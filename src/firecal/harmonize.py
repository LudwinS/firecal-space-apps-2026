"""Piezas C y D: competencia de métodos de armonización MODIS -> VIIRS y aplicación al histórico.

Unidad: celda (0.25°) x mes, con hotspots limpios (ver features.py).
Objetivo: estimar cuántos hotspots VIIRS (S-NPP) se habrían detectado en cada celda-mes
anterior a VIIRS, a partir de lo que vio MODIS. La serie queda en "equivalente VIIRS".

Métodos que compiten (todos con la misma validación deja-un-año-fuera sobre el traslape 2012-2025):
- k_global   : V = k * M, con k = sum(V) / sum(M)
- k_monthly  : un k por mes del año (cociente de sumas, no mediana de cocientes: estable con pocos datos)
- k_cell_eb  : k por celda y mes del año, encogido hacia k_monthly (Bayes empírico)
- poisson_glm: regresión de Poisson con log1p(Terra), log1p(Aqua), indicador M == 0, mes y país
- gbm        : gradient boosting con pérdida Poisson (conteos, coordenadas, mes, FRP, fracción diurna)

Variante "terra_only" (pieza D): entre 2000-11 y 2002-06 solo existe Terra. Para esos meses se entrena
el mismo método usando solo Terra como entrada y se valida igual.

Métricas (a nivel país x mes, que es lo que ve el usuario): MAE, sesgo % y R². También MAE celda-mes.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import PoissonRegressor

from firecal.contracts import (
    CELL_DEG,
    CELL_MONTH,
    HARMONIZED_POINT_COLUMNS,
    HOTSPOTS,
    HOTSPOTS_CLEAN,
    HOTSPOTS_HARMONIZED,
    MODEL_METRICS,
)
from firecal.features import assign_cells, ensure_clean_columns

SWITCH_MONTH = pd.Timestamp("2012-02-01")  # desde aquí la serie usa VIIRS directo (ene-2012 está incompleto)
VIRTUAL_MIN = 0.05  # aporte mínimo para crear un punto "virtual" en celdas-mes sin MODIS
DRY_MONTHS = {12, 1, 2, 3, 4, 5}


# ---------------------------------------------------------------- métodos
@dataclass
class Method:
    name: str
    terra_only: bool = False

    def _m(self, d: pd.DataFrame) -> pd.Series:
        return d["n_terra"] if self.terra_only else d["n_modis"]

    def fit(self, d: pd.DataFrame) -> Method:
        raise NotImplementedError

    def predict(self, d: pd.DataFrame) -> np.ndarray:
        raise NotImplementedError


class KGlobal(Method):
    def fit(self, d):
        self.k = d["n_viirs"].sum() / max(self._m(d).sum(), 1)
        return self

    def predict(self, d):
        return self.k * self._m(d).to_numpy(float)


class KMonthly(Method):
    def fit(self, d):
        g = d.assign(m=self._m(d)).groupby(d["month"].dt.month)[["n_viirs", "m"]].sum()
        glob = g["n_viirs"].sum() / max(g["m"].sum(), 1)
        self.k = (g["n_viirs"] / g["m"].replace(0, np.nan)).fillna(glob).reindex(range(1, 13), fill_value=glob)
        return self

    def predict(self, d):
        return d["month"].dt.month.map(self.k).to_numpy(float) * self._m(d).to_numpy(float)


class KCellEB(Method):
    """k por celda y mes del año encogido hacia k_monthly: k = (V + a*k_m) / (M + a)."""

    alpha: float = 20.0  # equivale a ~20 detecciones MODIS de "prior"

    def fit(self, d):
        self.km = KMonthly(self.name, self.terra_only).fit(d)
        g = d.assign(m=self._m(d), mo=d["month"].dt.month).groupby(["cell_id", "mo"])[["n_viirs", "m"]].sum()
        prior = g.index.get_level_values("mo").map(self.km.k).to_numpy(float)
        self.k = (g["n_viirs"] + self.alpha * prior) / (g["m"] + self.alpha)
        return self

    def predict(self, d):
        idx = pd.MultiIndex.from_arrays([d["cell_id"], d["month"].dt.month])
        k = self.k.reindex(idx).to_numpy(float)
        k = np.where(np.isnan(k), d["month"].dt.month.map(self.km.k).to_numpy(float), k)
        return k * self._m(d).to_numpy(float)


def _design(d: pd.DataFrame, terra_only: bool, countries: list[str]) -> np.ndarray:
    mo = d["month"].dt.month.to_numpy()
    cols = [np.log1p(d["n_terra"].to_numpy(float))]
    if not terra_only:
        cols.append(np.log1p(d["n_aqua"].to_numpy(float)))
    m = d["n_terra"] if terra_only else d["n_modis"]
    cols.append((m.to_numpy() == 0).astype(float))
    cols += [(mo == k).astype(float) for k in range(2, 13)]
    cols += [(d["country"].to_numpy() == c).astype(float) for c in countries[1:]]
    return np.column_stack(cols)


class PoissonGLM(Method):
    def fit(self, d):
        self.countries = sorted(d["country"].unique())
        self.model = PoissonRegressor(alpha=1e-4, max_iter=1000).fit(
            _design(d, self.terra_only, self.countries), d["n_viirs"])
        return self

    def predict(self, d):
        return self.model.predict(_design(d, self.terra_only, self.countries))


def _gbm_features(d: pd.DataFrame, terra_only: bool) -> pd.DataFrame:
    mo = d["month"].dt.month
    x = pd.DataFrame({
        "n_terra": d["n_terra"],
        "lat0": d["lat0"], "lon0": d["lon0"],
        "mo_sin": np.sin(2 * np.pi * mo / 12), "mo_cos": np.cos(2 * np.pi * mo / 12),
    })
    if not terra_only:
        x["n_aqua"] = d["n_aqua"]
        x["frp_modis_mean"] = d["frp_modis_mean"]
        x["day_frac_modis"] = d["day_frac_modis"]
    else:
        # Con solo Terra, FRP y fracción diurna salen solo de Terra; no las tenemos separadas -> se omiten.
        pass
    return x


class GBM(Method):
    def fit(self, d):
        self.model = HistGradientBoostingRegressor(
            loss="poisson", learning_rate=0.06, max_iter=400, max_leaf_nodes=31,
            min_samples_leaf=40, l2_regularization=1.0, random_state=0,
        ).fit(_gbm_features(d, self.terra_only), d["n_viirs"])
        return self

    def predict(self, d):
        return self.model.predict(_gbm_features(d, self.terra_only))


class Ensemble(Method):
    """Promedio simple de k_cell_eb y gbm (sin pesos ajustados, para no sobreajustar a la validación)."""

    def fit(self, d):
        self.parts = [KCellEB("k_cell_eb", self.terra_only).fit(d), GBM("gbm", self.terra_only).fit(d)]
        return self

    def predict(self, d):
        return np.mean([p.predict(d) for p in self.parts], axis=0)


METHODS = {"k_global": KGlobal, "k_monthly": KMonthly, "k_cell_eb": KCellEB,
           "poisson_glm": PoissonGLM, "gbm": GBM, "ensemble_eb_gbm": Ensemble}


# ---------------------------------------------------------------- validación
def overlap(cm: pd.DataFrame) -> pd.DataFrame:
    return cm[cm["month"] >= SWITCH_MONTH]


def loyo_predictions(cm: pd.DataFrame, name: str, terra_only: bool = False) -> pd.DataFrame:
    """Deja un año fuera: entrena con los demás años del traslape y predice el año excluido."""
    ov = overlap(cm)
    years = sorted(ov["month"].dt.year.unique())
    parts = []
    for y in years:
        test = ov["month"].dt.year == y
        model = METHODS[name](name, terra_only).fit(ov[~test])
        parts.append(ov.loc[test, ["cell_id", "country", "month", "n_viirs"]].assign(pred=model.predict(ov[test])))
    return pd.concat(parts, ignore_index=True)


def metrics(pred: pd.DataFrame) -> dict:
    agg = pred.groupby(["country", "month"])[["n_viirs", "pred"]].sum()
    err = agg["pred"] - agg["n_viirs"]
    ss_res = float((err**2).sum())
    ss_tot = float(((agg["n_viirs"] - agg["n_viirs"].mean()) ** 2).sum())
    return {
        "mae": float(err.abs().mean()),
        "bias_pct": float(100 * err.sum() / agg["n_viirs"].sum()),
        "r2": 1 - ss_res / ss_tot if ss_tot else None,
        "mae_cell": float((pred["pred"] - pred["n_viirs"]).abs().mean()),
        "years_evaluated": sorted(int(y) for y in pred["month"].dt.year.unique()),
    }


def interval_factors(pred: pd.DataFrame, q: tuple[float, float] = (0.1, 0.9)) -> dict:
    """Factores multiplicativos lo/hi por temporada a partir de obs/pred país-mes (LOYO)."""
    agg = pred.groupby(["country", "month"])[["n_viirs", "pred"]].sum()
    agg = agg[agg["pred"] >= 20]  # cocientes con conteos minúsculos no informan
    season = np.where(agg.index.get_level_values("month").month.isin(DRY_MONTHS), "dry", "wet")
    out = {}
    for s in ("dry", "wet"):
        r = (agg["n_viirs"] / agg["pred"])[season == s]
        out[s] = [float(r.quantile(q[0])), float(r.quantile(q[1]))] if len(r) else [1.0, 1.0]
    return out


def compare_methods(cm: pd.DataFrame) -> dict:
    results = {}
    for variant, terra_only in (("full", False), ("terra_only", True)):
        rows = []
        for name in METHODS:
            m = metrics(loyo_predictions(cm, name, terra_only))
            rows.append({"method": name, **m})
            print(f"  [{variant:10}] {name:12} MAE país-mes={m['mae']:8.1f}  sesgo={m['bias_pct']:+6.1f}%  "
                  f"R²={m['r2']:.3f}  MAE celda={m['mae_cell']:.2f}")
        results[variant] = sorted(rows, key=lambda r: r["mae"])
    return results


# ---------------------------------------------------------------- aplicación
def apply_model(cm: pd.DataFrame, points: pd.DataFrame, full_name: str, terra_name: str,
                factors_full: dict, factors_terra: dict) -> pd.DataFrame:
    """Devuelve los puntos de la serie armonizada con su weight (ver contracts.py)."""
    ov = overlap(cm)
    full = METHODS[full_name](full_name).fit(ov)
    terra = METHODS[terra_name](terra_name, terra_only=True).fit(ov)

    pre = cm[cm["month"] < SWITCH_MONTH].copy()
    # Meses sin Aqua en toda la región -> modelo solo-Terra.
    aqua_by_month = pre.groupby("month")["n_aqua"].transform("sum")
    terra_mask = (aqua_by_month == 0).to_numpy()
    pre["pred"] = np.where(terra_mask, terra.predict(pre), full.predict(pre))
    pre["m_used"] = np.where(terra_mask, pre["n_terra"], pre["n_modis"])
    dry = pre["month"].dt.month.isin(DRY_MONTHS).to_numpy()

    def factor(i: int) -> np.ndarray:
        """i=0 -> lo, i=1 -> hi; según temporada y según qué modelo se usó."""
        f_dry = np.where(terra_mask, factors_terra["dry"][i], factors_full["dry"][i])
        f_wet = np.where(terra_mask, factors_terra["wet"][i], factors_full["wet"][i])
        return np.where(dry, f_dry, f_wet)

    pre["lo_f"], pre["hi_f"] = factor(0), factor(1)

    pts = ensure_clean_columns(points)
    pts = pts[pts["passes_quality"] & ~pts["persistent"].astype(bool)]
    pts = assign_cells(pts)
    pts = pts.assign(month=pts["acq_date"].dt.to_period("M").dt.to_timestamp())

    # 1) VIIRS desde SWITCH_MONTH: weight = 1.
    v = pts[(pts["sensor"] == "VIIRS") & (pts["month"] >= SWITCH_MONTH)].assign(weight=1.0, weight_lo=1.0,
                                                                                 weight_hi=1.0)
    # 2) MODIS antes: weight = pred / M de su celda-mes (en meses solo-Terra, solo cuentan puntos Terra).
    m = pts[(pts["sensor"] == "MODIS") & (pts["month"] < SWITCH_MONTH)]
    m = m.merge(pre[["cell_id", "month", "pred", "m_used", "lo_f", "hi_f"]], on=["cell_id", "month"], how="inner")
    m = m[m["m_used"] > 0]
    terra_months = set(pre.loc[terra_mask, "month"])
    m = m[~(m["month"].isin(terra_months) & (m["satellite"] != "Terra"))]
    w = m["pred"] / m["m_used"]
    m = m.assign(weight=w, weight_lo=w * m["lo_f"], weight_hi=w * m["hi_f"])
    # 3) Celdas-mes sin MODIS pero con VIIRS esperado > 0: punto virtual en el centro de la celda.
    z = pre[(pre["m_used"] == 0) & (pre["pred"] >= VIRTUAL_MIN)]
    virt = pd.DataFrame({
        "latitude": z["lat0"] + CELL_DEG / 2, "longitude": z["lon0"] + CELL_DEG / 2,
        "acq_date": z["month"], "sensor": "MODIS", "satellite": "virtual", "country": z["country"],
        "frp": np.nan, "weight": z["pred"], "weight_lo": z["pred"] * z["lo_f"], "weight_hi": z["pred"] * z["hi_f"],
        "cell_id": z["cell_id"],
    })
    out = pd.concat([v[HARMONIZED_POINT_COLUMNS], m[HARMONIZED_POINT_COLUMNS], virt[HARMONIZED_POINT_COLUMNS]],
                    ignore_index=True)
    return out.sort_values("acq_date").reset_index(drop=True)


def run() -> dict:
    cm = pd.read_parquet(CELL_MONTH)
    print("Validación deja-un-año-fuera (traslape 2012-2025):")
    res = compare_methods(cm)
    full_best = res["full"][0]["method"]
    terra_best = res["terra_only"][0]["method"]
    f_full = interval_factors(loyo_predictions(cm, full_best))
    f_terra = interval_factors(loyo_predictions(cm, terra_best, terra_only=True))

    src = HOTSPOTS_CLEAN if HOTSPOTS_CLEAN.exists() else HOTSPOTS
    pts = apply_model(cm, pd.read_parquet(src), full_best, terra_best, f_full, f_terra)
    pts.to_parquet(HOTSPOTS_HARMONIZED, index=False)

    report = {
        "chosen": full_best,
        "chosen_terra_only": terra_best,
        "metrics": res["full"],
        "metrics_terra_only": res["terra_only"],
        "validation": "leave-one-year-out over the MODIS/VIIRS overlap (2012-2025), errors at country x month",
        "interval_factors": {"full": f_full, "terra_only": f_terra},
        "unit": f"clean hotspots (quality-filtered, persistent sources removed), {CELL_DEG} deg cells x month",
        "source": src.name,
    }
    MODEL_METRICS.write_text(json.dumps(report, indent=2))
    print(f"Elegido: {full_best} (Terra+Aqua) / {terra_best} (solo Terra). "
          f"{HOTSPOTS_HARMONIZED.name}: {len(pts):,} puntos")
    return report
