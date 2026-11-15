import pandas as pd

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
