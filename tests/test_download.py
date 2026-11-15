from datetime import date

import pandas as pd
import pytest

from firecal.download import normalize


def test_nrt_errors_do_not_leak_the_map_key(monkeypatch):
    import requests

    from firecal import download

    secret = "s3cr3tk3y"
    monkeypatch.setenv("FIRMS_MAP_KEY", secret)

    def boom(url, timeout):
        raise requests.ConnectionError(f"Max retries exceeded with url: {url}")

    monkeypatch.setattr(download.requests, "get", boom)
    with pytest.raises(RuntimeError) as err:
        download.fetch_nrt_area((-90, 13, -88, 14), date(2026, 1, 1), date(2026, 1, 2))
    assert secret not in str(err.value) and "***" in str(err.value)
    assert err.value.__cause__ is None


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
