import numpy as np
import pandas as pd

from firecal.features import build_cell_month
from firecal.harmonize import SWITCH_MONTH, apply_model, interval_factors, loyo_predictions, metrics


def _synthetic(seed=0):
    """Dos celdas; VIIRS ve ~4x lo de MODIS (Terra+Aqua). Aqua existe desde 2003."""
    rng = np.random.default_rng(seed)
    rows = []
    for month in pd.date_range("2001-01-01", "2016-12-01", freq="MS"):
        for lat, lon in ((13.55, -89.2), (14.55, -90.7)):
            base = 30 if month.month in (2, 3, 4) else 2
            sats = [("MODIS", "Terra", rng.poisson(base))]
            if month.year >= 2003:
                sats.append(("MODIS", "Aqua", rng.poisson(base * 2)))
            if month >= SWITCH_MONTH:
                sats.append(("VIIRS", "N", rng.poisson(base * 12)))
            for sensor, sat, n in sats:
                for _ in range(n):
                    rows.append({"latitude": lat + rng.uniform(0, 0.15), "longitude": lon + rng.uniform(0, 0.15),
                                 "acq_date": month + pd.Timedelta(days=int(rng.integers(0, 27))),
                                 "sensor": sensor, "satellite": sat, "confidence_norm": 80.0, "frp": 10.0,
                                 "daynight": "D", "type": 0, "country": "El_Salvador"})
    return pd.DataFrame(rows)


def test_cell_month_counts_and_zero_fill():
    pts = _synthetic()
    cm = build_cell_month(pts)
    assert cm["cell_id"].nunique() == 2
    assert cm["n_terra"].sum() + cm["n_aqua"].sum() + cm["n_viirs"].sum() == len(pts)
    assert (cm["n_modis"] == cm["n_terra"] + cm["n_aqua"]).all()
    assert len(cm) == 2 * 192  # todas las celdas x todos los meses


def test_loyo_recovers_ratio_and_harmonized_weights_sum():
    pts = _synthetic()
    cm = build_cell_month(pts)
    pred = loyo_predictions(cm, "k_monthly")
    m = metrics(pred)
    assert abs(m["bias_pct"]) < 5
    f = interval_factors(pred)
    out = apply_model(cm, pts, "k_monthly", "k_monthly", f, f)
    pre = out[out["acq_date"] < SWITCH_MONTH]
    # Pre-2012 armonizado ~ 4x MODIS (Terra+Aqua) o ~12x Terra en años solo-Terra.
    yr2005 = out[out["acq_date"].dt.year == 2005]["weight"].sum()
    modis2005 = ((pts["sensor"] == "MODIS") & (pts["acq_date"].dt.year == 2005)).sum()
    assert 3.3 < yr2005 / modis2005 < 4.7
    yr2001 = out[out["acq_date"].dt.year == 2001]["weight"].sum()
    terra2001 = (pts["acq_date"].dt.year == 2001).sum()
    assert 9 < yr2001 / terra2001 < 15
    assert (pre["weight_lo"] <= pre["weight"]).all() and (pre["weight"] <= pre["weight_hi"]).all()
    assert (out.loc[out["acq_date"] >= SWITCH_MONTH, "weight"] == 1).all()
