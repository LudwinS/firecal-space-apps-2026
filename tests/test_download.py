
import pandas as pd
import pytest

from firecal.download import normalize


def test_normalize_unifies_modis_and_viirs_confidence():
    df = pd.DataFrame({
        "latitude": [13.4, 13.9], "longitude": [-87.8, -89.1],
        "acq_date": ["2020-01-02", "2020-01-01"], "acq_time": [1920, 736],
        "satellite": ["Aqua", "N"], "instrument": ["MODIS", "VIIRS"],
        "confidence": ["73", "n"], "frp": [9.7, 2.0], "daynight": ["D", "N"], "type": [0, 0],
    })
    out = normalize(df)
    assert list(out["sensor"]) == ["MODIS", "VIIRS"]
    assert list(out["confidence_norm"]) == [73.0, 60.0]
    assert list(out["acq_time"]) == ["1920", "0736"]


def test_assign_country_uses_nearest_reference_within_threshold():
    import numpy as np

    from firecal.download import assign_country

    ref = pd.DataFrame({"latitude": [13.70, 14.60], "longitude": [-89.20, -87.20],
                        "country": ["El_Salvador", "Honduras"]})
    lat = np.array([13.71, 14.59, 10.0])  # ~1 km de SV, ~1 km de HN, lejos de todo
    lon = np.array([-89.20, -87.20, -80.0])
    assert list(assign_country(lat, lon, ref, max_km=3.0)) == ["El_Salvador", "Honduras", None]


def test_fetch_area_splits_in_5_day_blocks_and_hides_key(monkeypatch):
    import datetime as dt

    from firecal import download

    calls = []

    class Resp:
        status_code = 200
        text = "latitude,longitude,acq_date\n13.7,-89.2,2026-01-01\n"

    def fake_get(url, timeout):
        calls.append(url)
        return Resp()

    monkeypatch.setattr(download.requests, "get", fake_get)
    monkeypatch.setattr(download.time, "sleep", lambda s: None)
    df = download.fetch_area("SECRETKEY", "VIIRS_SNPP_SP", (-90, 13, -87, 15), dt.date(2026, 1, 1), dt.date(2026, 1, 12))
    assert [u.split("/")[-2:] for u in calls] == [["5", "2026-01-01"], ["5", "2026-01-06"], ["2", "2026-01-11"]]
    assert len(df) == 3

    Resp.status_code, Resp.text = 400, "Invalid day range."
    with pytest.raises(RuntimeError) as exc:
        download.fetch_area("SECRETKEY", "MODIS_SP", (-90, 13, -87, 15), dt.date(2026, 1, 1), dt.date(2026, 1, 1))
    assert "SECRETKEY" not in str(exc.value)


def test_network_errors_do_not_leak_the_map_key(monkeypatch):
    import datetime as dt

    import requests

    from firecal import download

    secret = "s3cr3tk3y"

    def boom(url, timeout):
        raise requests.ConnectionError(f"Max retries exceeded with url: {url}")

    monkeypatch.setattr(download.requests, "get", boom)
    monkeypatch.setattr(download.time, "sleep", lambda s: None)
    with pytest.raises(RuntimeError) as err:
        download.fetch_area(secret, "MODIS_NRT", (-90, 13, -88, 14), dt.date(2026, 1, 1), dt.date(2026, 1, 2))
    assert secret not in str(err.value)
    assert err.value.__cause__ is None
