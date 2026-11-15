import numpy as np
import pandas as pd

from firecal.clean import filter_quality, flag_persistent, persistent_sources_geojson, run
from firecal.contracts import CLEAN_EXTRA_COLUMNS, HOTSPOT_COLUMNS


def _rows(lat, lon, dates, sensor="VIIRS", conf=60.0, typ=0, country="Guatemala"):
    n = len(dates)
    return pd.DataFrame({
        "latitude": lat, "longitude": lon, "acq_date": pd.to_datetime(dates), "acq_time": "0130",
        "satellite": "N" if sensor == "VIIRS" else "Aqua", "sensor": sensor,
        "confidence_norm": conf, "frp": 10.0, "daynight": "N", "type": [typ] * n, "country": country,
    })


def _synthetic(seed=0):
    rng = np.random.default_rng(seed)
    # "Volcán": punto fijo (dispersión ~300 m), detecciones en 10 años y todos los meses
    vdates = [f"{y}-{m:02d}-{d:02d}" for y in range(2012, 2022) for m in range(1, 13) for d in (5, 20)]
    volcano = _rows(14.473 + rng.normal(0, 0.0025, len(vdates)), -90.880 + rng.normal(0, 0.0025, len(vdates)), vdates)
    # Quemas agrícolas: cada año, en la estación seca (feb–abr), en parcelas que cambian de lugar
    adates, alat, alon = [], [], []
    for y in range(2005, 2025):
        for _ in range(60):
            adates.append(f"{y}-{rng.integers(2, 5):02d}-{rng.integers(1, 28):02d}")
            alat.append(13.5 + rng.uniform(0, 0.3))
            alon.append(-89.5 + rng.uniform(0, 0.3))
    agri = _rows(np.array(alat), np.array(alon), adates, sensor="MODIS", conf=70.0, country="El_Salvador")
    return pd.concat([volcano, agri], ignore_index=True), len(volcano)


def test_filter_quality():
    df = pd.DataFrame({
        "confidence_norm": [20.0, 60.0, 90.0, 60.0, 29.0, 30.0],  # VIIRS l, n, h; MODIS 29 / 30
        "type": pd.array([0, 0, 0, 2, 0, pd.NA], dtype="Int64"),
    })
    assert filter_quality(df).tolist() == [False, True, True, False, False, True]


def test_volcano_persistent_agriculture_not():
    df, nv = _synthetic()
    out = flag_persistent(df)
    assert list(out.columns) == HOTSPOT_COLUMNS + CLEAN_EXTRA_COLUMNS
    assert out["persistent"].iloc[:nv].mean() > 0.95
    assert out["cluster_id"].iloc[:nv].nunique() == 1
    assert not out["persistent"].iloc[nv:].any()
    assert (out.loc[~out["persistent"], "cluster_id"] == -1).all()


def test_low_quality_never_persistent():
    df, nv = _synthetic()
    df.loc[: nv - 1, "confidence_norm"] = 20.0  # VIIRS 'low'
    out = flag_persistent(df)
    assert not out["persistent"].any()
    assert not out["passes_quality"].iloc[:nv].any()


def test_geojson_and_run(tmp_path):
    df, _ = _synthetic()
    gj =persistent_sources_geojson(flag_persistent(df))
    assert gj["type"] == "FeatureCollection" and len(gj["features"]) == 1
    f = gj["features"][0]
    lon, lat = f["geometry"]["coordinates"]
    assert abs(lat - 14.473) < 0.01 and abs(lon + 90.880) < 0.01
    p = f["properties"]
    assert p["n_years"] == 10 and p["n_months"] == 120 and p["countries"] == ["Guatemala"]
    assert p["first_date"] == "2012-01-05" and p["last_date"] == "2021-12-20"

    src = tmp_path / "h.parquet"
    df.to_parquet(src, index=False)
    out = run(src, tmp_path / "c.parquet", tmp_path / "p.geojson")
    assert (tmp_path / "p.geojson").exists() and len(pd.read_parquet(tmp_path / "c.parquet")) == len(out)
