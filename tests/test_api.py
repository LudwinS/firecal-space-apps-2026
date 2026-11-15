"""Pruebas de la API con datos sintéticos escritos en una carpeta temporal (FIRECAL_DATA_DIR)."""

from __future__ import annotations

import io
import json
from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from firecal.api import data
from firecal.api.app import app
from firecal.contracts import HOTSPOT_COLUMNS

# Conteos MODIS por mes del año (estación seca ene-may). VIIRS = 2x desde 2012-01-20.
BASE = [5, 8, 12, 10, 4, 1, 0, 0, 0, 1, 2, 3]
SV = (13.70, -89.20)  # El Salvador
HN = (14.50, -87.00)  # Honduras
LAST = (2014, 12)
LAST_SV_MODIS = 40  # dic-2014 muy por encima de lo normal en El Salvador


def _rows(country: str, lat: float, lon: float, sensor: str, d: date, n: int) -> list[dict]:
    sat = "N" if sensor == "VIIRS" else "Terra"
    return [{
        "latitude": lat + 0.001 * i, "longitude": lon + 0.001 * i, "acq_date": pd.Timestamp(d),
        "acq_time": "0400", "satellite": sat, "sensor": sensor, "confidence_norm": 80.0,
        "frp": 10.0, "daynight": "D", "type": 0, "country": country,
    } for i in range(n)]


def make_hotspots() -> pd.DataFrame:
    rows: list[dict] = []
    for y in range(2001, LAST[0] + 1):
        for m in range(1, 13):
            for country, (lat, lon), scale in (("El_Salvador", SV, 1), ("Honduras", HN, 2)):
                n = BASE[m - 1] * scale
                if (y, m) == LAST and country == "El_Salvador":
                    n = LAST_SV_MODIS
                d = date(y, m, 25)  # día 25: siempre después de VIIRS_START (2012-01-20) en enero
                rows += _rows(country, lat, lon, "MODIS", d, n)
                if d >= date(2012, 1, 20):
                    rows += _rows(country, lat, lon, "VIIRS", d, 2 * n)
    return pd.DataFrame(rows)[HOTSPOT_COLUMNS]


@pytest.fixture
def ddir(tmp_path, monkeypatch):
    make_hotspots().to_parquet(tmp_path / "hotspots.parquet", index=False)
    monkeypatch.setenv("FIRECAL_DATA_DIR", str(tmp_path))
    data.reset()
    yield tmp_path
    data.reset()


@pytest.fixture
def client(ddir):
    return TestClient(app)


SV_Q = {"area": {"country": "El_Salvador"}}


def expected_provisional(df: pd.DataFrame) -> pd.DataFrame:
    cut = pd.Timestamp("2012-01-20")
    return df[((df.sensor == "VIIRS") & (df.acq_date >= cut)) | ((df.sensor == "MODIS") & (df.acq_date < cut))]


def test_health_and_methods_default(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["method"] == "provisional"
    assert r["data_files"]["hotspots"] is True and r["data_files"]["hotspots_harmonized"] is False
    assert client.get("/api/methods").json() == {
        "chosen": "provisional", "metrics": [], "validation": "leave-one-year-out over the MODIS/VIIRS overlap"}
    assert client.get("/api/persistent-sources").json() == {"type": "FeatureCollection", "features": []}


def test_areas(client):
    areas = client.get("/api/areas").json()
    assert [a["id"] for a in areas] == ["El_Salvador", "Honduras"]
    sv = areas[0]
    assert sv["name"] == "El Salvador" and sv["kind"] == "country"
    assert sv["bbox"][0] == pytest.approx(SV[1]) and sv["bbox"][1] == pytest.approx(SV[0])


def test_calendar_country_totals_match_direct_count(client):
    r = client.post("/api/calendar", json=SV_Q)
    assert r.status_code == 200
    cal = r.json()
    assert cal["method"] == "provisional" and cal["years"] == list(range(2001, 2015))
    df = make_hotspots().query("country == 'El_Salvador'")
    harm = sum(v for row in cal["harmonized"] for v in row if v is not None)
    assert harm == pytest.approx(len(expected_provisional(df)))
    assert cal["total_raw_hotspots"] == len(df)
    assert sum(v for row in cal["raw_modis"] for v in row if v is not None) == (df.sensor == "MODIS").sum()
    # VIIRS no existe antes de 2012 -> None; MODIS sí
    y2005 = cal["years"].index(2005)
    assert all(v is None for v in cal["raw_viirs"][y2005])
    assert cal["raw_modis"][y2005][2] == BASE[2]
    # dic-2014 armonizado = VIIRS (2x)
    assert cal["harmonized"][-1][11] == 2 * LAST_SV_MODIS
    assert cal["harmonized_lo"] == cal["harmonized_hi"] == cal["harmonized"]


def test_calendar_date_range_marks_outside_months_none(client):
    cal = client.post("/api/calendar", json={**SV_Q, "start": "2010-03-01", "end": "2011-02-28"}).json()
    assert cal["years"] == [2010, 2011]
    assert cal["harmonized"][0][:2] == [None, None] and cal["harmonized"][0][2] == BASE[2]
    assert cal["harmonized"][1][1] == BASE[1] and cal["harmonized"][1][2:] == [None] * 10


@pytest.mark.parametrize("area", [
    {"bbox": [-89.5, 13.5, -89.0, 14.0]},
    {"point": [13.70, -89.20, 20.0]},
    {"polygon": {"type": "Polygon", "coordinates": [[[-89.5, 13.5], [-89.0, 13.5], [-89.0, 14.0],
                                                     [-89.5, 14.0], [-89.5, 13.5]]]}},
])
def test_calendar_custom_areas_match_country(client, area):
    a = client.post("/api/calendar", json={"area": area}).json()
    b = client.post("/api/calendar", json=SV_Q).json()
    assert a["harmonized"] == b["harmonized"] and a["total_raw_hotspots"] == b["total_raw_hotspots"]


def test_point_radius_excludes_far_points(client):
    cal = client.post("/api/calendar", json={"area": {"point": [13.70, -89.20, 0.01]}}).json()
    # radio de 10 m: solo el primer punto de cada lote (los demás están a >= ~150 m)
    harm = sum(v for row in cal["harmonized"] for v in row if v is not None)
    expected = expected_provisional(make_hotspots().query("country == 'El_Salvador'"))
    assert 0 < harm < len(expected)


@pytest.mark.parametrize("body,code", [
    ({"area": {}}, 422),
    ({"area": {"country": "El_Salvador", "bbox": [-90, 13, -88, 14]}}, 422),
    ({"area": {"bbox": [-88, 13, -90, 14]}}, 422),
    ({"area": {"point": [13.7, -89.2, 0]}}, 422),
    ({"area": {"polygon": {"type": "Point", "coordinates": [0, 0]}}}, 422),
    ({**SV_Q, "start": "2010-01-01", "end": "2009-01-01"}, 422),
    ({"area": {"country": "Atlantis"}}, 404),
])
def test_invalid_requests(client, body, code):
    assert client.post("/api/calendar", json=body).status_code == code


def test_anomalies_and_status(client):
    an = client.post("/api/anomalies", json={**SV_Q, "start": "2014-01-01"}).json()
    assert an["reference_years"] == [2001, 2014]
    series = an["series"]
    assert len(series) == 12 and series[-1]["month"] == "2014-12-01"
    dec = series[-1]
    # dic: referencia 2001-2011 (MODIS=3) y 2012-2013 (VIIRS=6) -> mediana 3; valor 80
    assert dec["median"] == 3 and dec["value"] == 80 and dec["level"] == "extreme"
    assert dec["ratio"] == pytest.approx(80 / 3, rel=1e-3) and dec["percentile"] == 100
    assert series[6]["level"] == "normal"  # julio sin fuegos

    st = client.post("/api/status", json=SV_Q).json()
    assert st["month"] == "2014-12-01" and st["level"] == "extreme"
    # los datos terminan el 25-dic: el mensaje lo avisa
    assert st["message"].startswith("December 2014 (data through Dec 25): 26.7× the usual for December")
    assert st["message"].endswith("EXTREME")
    assert st["peak_month"] == "Mar" and st["most_active_year"] == 2014


def test_level_needs_a_minimum_of_detections():
    import numpy as np

    from firecal.api.queries import _level

    zeros = np.zeros(10)
    assert _level(1.0, zeros)[2] == "normal"  # un hotspot aislado no es "extreme"
    assert _level(0.3, zeros)[2] == "normal"
    assert _level(50.0, zeros)[2] == "extreme"


def test_start_after_last_data_is_empty_not_an_error(client):
    q = {**SV_Q, "start": "2020-01-01"}
    r = client.post("/api/calendar", json=q)
    assert r.status_code == 200 and r.json()["years"] == [] and r.json()["total_raw_hotspots"] == 0
    assert client.post("/api/anomalies", json=q).json()["series"] == []
    st = client.post("/api/status", json=q)
    assert st.status_code == 422 and st.json()["detail"] == "No data in the requested period"
    assert client.post("/api/export/csv", json=q).status_code == 200


def test_anomalies_reference_years(client):
    an = client.post("/api/anomalies", json={**SV_Q, "start": "2014-12-01", "reference_years": [2012, 2013]}).json()
    assert an["reference_years"] == [2012, 2013] and an["series"][0]["median"] == 6


def test_compare(client):
    r = client.post("/api/compare", json={"area_a": {"country": "El_Salvador"}, "area_b": {"country": "Honduras"},
                                          "start": "2001-01-01", "end": "2011-12-31"}).json()
    assert r["monthly_a"] == BASE and r["monthly_b"] == [2 * v for v in BASE]
    assert r["correlation"] == pytest.approx(1.0)


def test_export_csv(client):
    r = client.post("/api/export/csv", json={**SV_Q, "start": "2013-03-01", "end": "2013-03-31"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    df = pd.read_csv(io.StringIO(r.text))
    assert list(df.columns) == ["latitude", "longitude", "acq_date", "sensor", "satellite", "country", "frp", "weight"]
    assert len(df) == 2 * BASE[2] and set(df.sensor) == {"VIIRS"} and set(df.acq_date) == {"2013-03-25"}


def test_report_pdf(client):
    r = client.post("/api/report/pdf", json=SV_Q)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and len(r.content) > 2000


def test_harmonized_and_clean_files_are_used(ddir, client):
    hs = make_hotspots()
    clean = hs.assign(passes_quality=True, persistent=False, cluster_id=-1)
    clean.loc[clean.index[:5], "persistent"] = True  # los 5 MODIS de El Salvador ene-2001 quedan fuera
    clean.to_parquet(ddir / "hotspots_clean.parquet", index=False)
    harm = expected_provisional(hs).assign(weight=0.5, weight_lo=0.25, weight_hi=1.0, cell_id="x")
    harm.drop(columns=["acq_time", "confidence_norm", "daynight", "type"]).to_parquet(
        ddir / "hotspots_harmonized.parquet", index=False)
    (ddir / "model_metrics.json").write_text(json.dumps({"chosen": "k_seasonal", "metrics": [
        {"method": "k_seasonal", "mae": 1.5, "bias_pct": -2.0, "r2": 0.9, "years_evaluated": [2012, 2013]}]}))
    (ddir / "persistent_sources.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-89.6, 13.9]}, "properties": {}}]}))

    assert client.get("/api/health").json()["method"] == "k_seasonal"
    assert client.get("/api/methods").json()["chosen"] == "k_seasonal"
    assert len(client.get("/api/persistent-sources").json()["features"]) == 1
    cal = client.post("/api/calendar", json=SV_Q).json()
    sv = hs.query("country == 'El_Salvador'")
    assert cal["method"] == "k_seasonal"
    assert sum(v for row in cal["harmonized"] for v in row if v is not None) == pytest.approx(
        0.5 * len(expected_provisional(sv)))
    assert sum(v for row in cal["harmonized_hi"] for v in row if v is not None) == pytest.approx(
        len(expected_provisional(sv)))
    assert cal["total_raw_hotspots"] == len(sv) - 5
