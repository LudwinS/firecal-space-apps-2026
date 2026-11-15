"""Limpieza de hotspots: filtro de calidad + fuentes térmicas persistentes (DBSCAN).

Salidas (ver contracts.py):
    hotspots_clean.parquet      = hotspots.parquet + CLEAN_EXTRA_COLUMNS
    persistent_sources.geojson  = un punto por fuente persistente

Idea: un volcán (Fuego, Pacaya, Santiaguito, Masaya...) o una industria se detecta
SIEMPRE en el mismo ~1 km, en muchos años y en casi todos los meses del año, incluida
la temporada lluviosa. Las quemas agrícolas también se repiten cada año, pero se mueven
de parcela y se concentran en la estación seca (dic–may). Por eso un sitio es
persistente solo si, dentro de un radio `eps_km`, tiene actividad en:
    - >= min_years años distintos,
    - >= min_months meses-año distintos (p. ej. 2015-03 y 2016-03 cuentan como 2),
    - >= min_calendar_months meses del calendario distintos (de 12): descarta la estacionalidad agrícola.

Eficiencia (millones de filas): los hotspots se agregan a una rejilla fina de
GRID_DEG (~550 m) y cada celda guarda máscaras de bits de años, meses-año y meses del
calendario. El vecindario `eps_km` se resuelve con BallTree (haversine) sobre celdas
únicas y las máscaras se combinan con OR. Es un DBSCAN con criterio de núcleo propio:
    núcleo   = celda cuyo vecindario cumple los umbrales de persistencia,
    clúster  = componente conexa de núcleos a distancia <= eps (DBSCAN min_samples=1),
    frontera = celdas no núcleo a <= eps de un núcleo, heredan su clúster.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.neighbors import BallTree

from firecal.contracts import HOTSPOTS, HOTSPOTS_CLEAN, PERSISTENT_SOURCES

EARTH_RADIUS_KM = 6371.0088
GRID_DEG = 0.005  # ~550 m: más fino que el píxel MODIS (1 km), más grueso que VIIRS (375 m)
_KEY_BASE = 1_000_000  # llave de celda = iy * _KEY_BASE + (ix + _IX_OFFSET); |ix| <= 36 000
_IX_OFFSET = 500_000
YEAR0 = 2000
N_YEARS = 32  # años 2000–2031 en la máscara de años
N_YM_WORDS = (N_YEARS * 12 + 63) // 64  # palabras uint64 para la máscara de meses-año

# Umbrales por defecto (justificación en el docstring de flag_persistent)
EPS_KM = 0.75
MIN_SAMPLES = 20
MIN_YEARS = 5
MIN_MONTHS = 24
MIN_CALENDAR_MONTHS = 9


def filter_quality(df: pd.DataFrame, min_conf: float = 30.0) -> pd.Series:
    """passes_quality: confianza normalizada >= min_conf y type == 0 (o NA, p. ej. NRT).

    MODIS trae confianza 0–100; VIIRS ya viene mapeado (l=20, n=60, h=90), así que
    min_conf=30 deja fuera VIIRS 'low' y MODIS < 30. type 1 (volcán), 2 (otra fuente
    estática) y 3 (offshore) quedan fuera.
    """
    conf_ok = pd.to_numeric(df["confidence_norm"], errors="coerce") >= min_conf
    t = pd.to_numeric(df["type"], errors="coerce") if "type" in df else pd.Series(np.nan, index=df.index)
    type_ok = t.isna() | (t == 0)
    return (conf_ok & type_ok).fillna(False).astype(bool).rename("passes_quality")


def _popcount(a: np.ndarray) -> np.ndarray:
    """Bits encendidos por fila (suma sobre la última dimensión si es 2D)."""
    c = np.bitwise_count(a).astype(np.int64)
    return c.sum(axis=-1) if c.ndim == 2 else c


def _cell_table(lat: np.ndarray, lon: np.ndarray, dates: pd.Series) -> tuple[np.ndarray, pd.DataFrame]:
    """Agrega hotspots a celdas GRID_DEG. Devuelve (índice de celda por hotspot, tabla de celdas)."""
    iy = np.floor(lat / GRID_DEG).astype(np.int64)
    ix = np.floor(lon / GRID_DEG).astype(np.int64)
    # ix se desplaza a [0, _KEY_BASE) para que la llave se decodifique bien con longitudes negativas.
    key = iy * _KEY_BASE + (ix + _IX_OFFSET)
    uniq, inv = np.unique(key, return_inverse=True)
    cell_iy = uniq // _KEY_BASE
    cell_ix = uniq - cell_iy * _KEY_BASE - _IX_OFFSET

    d = pd.DatetimeIndex(dates)
    yi = np.clip(d.year.to_numpy() - YEAR0, 0, N_YEARS - 1).astype(np.int64)
    mi = d.month.to_numpy().astype(np.int64) - 1
    ym = yi * 12 + mi

    years = np.zeros(len(uniq), dtype=np.uint64)
    cal = np.zeros(len(uniq), dtype=np.uint64)
    ymw = np.zeros((len(uniq), N_YM_WORDS), dtype=np.uint64)
    np.bitwise_or.at(years, inv, np.left_shift(np.uint64(1), yi.astype(np.uint64)))
    np.bitwise_or.at(cal, inv, np.left_shift(np.uint64(1), mi.astype(np.uint64)))
    np.bitwise_or.at(ymw, (inv, ym // 64), np.left_shift(np.uint64(1), (ym % 64).astype(np.uint64)))

    cells = pd.DataFrame({
        "lat": (cell_iy + 0.5) * GRID_DEG,
        "lon": (cell_ix + 0.5) * GRID_DEG,
        "n": np.bincount(inv, minlength=len(uniq)),
    })
    cells.attrs["years"], cells.attrs["cal"], cells.attrs["ym"] = years, cal, ymw
    return inv, cells


def _neighborhood_or(nbrs: np.ndarray, starts: np.ndarray, arr: np.ndarray) -> np.ndarray:
    """OR de `arr` sobre los vecinos de cada celda (formato CSR: nbrs + starts)."""
    vals = arr[nbrs]
    return np.bitwise_or.reduceat(vals, starts, axis=0)


def flag_persistent(
    df: pd.DataFrame,
    eps_km: float = EPS_KM,
    min_samples: int = MIN_SAMPLES,
    min_years: int = MIN_YEARS,
    min_months: int = MIN_MONTHS,
    min_calendar_months: int = MIN_CALENDAR_MONTHS,
    min_conf: float = 30.0,
) -> pd.DataFrame:
    """Agrega passes_quality, persistent y cluster_id (-1 si no persistente).

    Umbrales por defecto y por qué:
    - eps_km=0.75: ~ píxel MODIS (1 km en nadir) y dos píxeles VIIRS (375 m); las
      detecciones de un cráter se dispersan <~1 km por geolocalización y tamaño de píxel.
      Mayor eps encadenaría parcelas agrícolas vecinas.
    - min_samples=20 hotspots en el vecindario: descarta sitios con pocas detecciones aisladas.
    - min_years=5: actividad recurrente, no un evento puntual (un incendio, una erupción corta).
    - min_months=24 meses-año distintos: una parcela que se quema 1–2 veces por año no llega
      salvo que se queme casi todos los años; un volcán activo o una industria sí.
    - min_calendar_months=9 de 12: las quemas agrícolas casi no ocurren en jun–oct (lluvias);
      una fuente persistente sí aparece en la temporada lluviosa.
    """
    out = df.copy()
    out["passes_quality"] = filter_quality(out, min_conf).to_numpy()
    out["persistent"] = False
    out["cluster_id"] = np.int64(-1)

    q = out["passes_quality"].to_numpy()
    if q.sum() == 0:
        return out
    sub = out.loc[q]
    inv, cells = _cell_table(sub["latitude"].to_numpy(float), sub["longitude"].to_numpy(float),
                             pd.to_datetime(sub["acq_date"]))
    years, cal, ymw = cells.attrs["years"], cells.attrs["cal"], cells.attrs["ym"]

    # Vecindario haversine de cada celda (incluye la propia celda)
    coords = np.radians(cells[["lat", "lon"]].to_numpy())
    eps_rad = eps_km / EARTH_RADIUS_KM
    tree = BallTree(coords, metric="haversine")
    ind = tree.query_radius(coords, r=eps_rad)
    lens = np.fromiter((len(i) for i in ind), dtype=np.int64, count=len(ind))
    nbrs = np.concatenate(ind)
    starts = np.concatenate([[0], np.cumsum(lens)[:-1]])

    n_nb = np.add.reduceat(cells["n"].to_numpy()[nbrs], starts)
    ny = _popcount(_neighborhood_or(nbrs, starts, years))
    nc = _popcount(_neighborhood_or(nbrs, starts, cal))
    nm = _popcount(_neighborhood_or(nbrs, starts, ymw))
    core = (n_nb >= min_samples) & (ny >= min_years) & (nm >= min_months) & (nc >= min_calendar_months)

    cell_cluster = np.full(len(cells), -1, dtype=np.int64)
    if core.any():
        core_idx = np.flatnonzero(core)
        lab = DBSCAN(eps=eps_rad, min_samples=1, metric="haversine", algorithm="ball_tree").fit_predict(coords[core_idx])
        cell_cluster[core_idx] = lab
        # Frontera: celdas no núcleo a <= eps de un núcleo heredan el clúster del núcleo más cercano
        border = np.flatnonzero(~core)
        if len(border):
            dist, j = BallTree(coords[core_idx], metric="haversine").query(coords[border], k=1)
            near = dist[:, 0] <= eps_rad
            cell_cluster[border[near]] = lab[j[near, 0]]

        # Re-chequeo a nivel clúster con la unión de todas sus celdas
        cl = cell_cluster >= 0
        order = np.argsort(cell_cluster[cl], kind="stable")
        cidx = np.flatnonzero(cl)[order]
        labs = cell_cluster[cidx]
        st = np.flatnonzero(np.r_[True, labs[1:] != labs[:-1]])
        ok = (
            (np.add.reduceat(cells["n"].to_numpy()[cidx], st) >= min_samples)
            & (_popcount(np.bitwise_or.reduceat(years[cidx], st)) >= min_years)
            & (_popcount(np.bitwise_or.reduceat(ymw[cidx], st, axis=0)) >= min_months)
            & (_popcount(np.bitwise_or.reduceat(cal[cidx], st)) >= min_calendar_months)
        )
        bad = set(labs[st][~ok].tolist())
        if bad:
            cell_cluster[np.isin(cell_cluster, list(bad))] = -1

        # Renumerar 0..K-1 por número de hotspots (0 = el mayor)
        valid = cell_cluster >= 0
        if valid.any():
            hs = pd.Series(cells["n"].to_numpy()[valid]).groupby(cell_cluster[valid]).sum()
            remap = {old: new for new, old in enumerate(hs.sort_values(ascending=False, kind="stable").index)}
            cell_cluster[valid] = pd.Series(cell_cluster[valid]).map(remap).to_numpy()

    hs_cluster = cell_cluster[inv]
    out.loc[q, "cluster_id"] = hs_cluster
    out.loc[q, "persistent"] = hs_cluster >= 0
    out["persistent"] = out["persistent"].astype(bool)
    out["cluster_id"] = out["cluster_id"].astype(np.int64)
    return out


def persistent_sources_geojson(df_clean: pd.DataFrame) -> dict:
    """FeatureCollection con un punto (centroide) por clúster persistente."""
    p = df_clean[df_clean["persistent"] & (df_clean["cluster_id"] >= 0)]
    feats = []
    if len(p):
        d = pd.to_datetime(p["acq_date"])
        p = p.assign(_y=d.dt.year, _ym=d.dt.to_period("M"), _d=d)
        countries = p["country"] if "country" in p else pd.Series("", index=p.index)
        p = p.assign(_c=countries.fillna("").astype(str))
        for cid, g in p.groupby("cluster_id", sort=True):
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(float(g["longitude"].mean()), 5),
                                                              round(float(g["latitude"].mean()), 5)]},
                "properties": {
                    "cluster_id": int(cid),
                    "n_hotspots": len(g),
                    "n_years": int(g["_y"].nunique()),
                    "n_months": int(g["_ym"].nunique()),
                    "first_date": g["_d"].min().date().isoformat(),
                    "last_date": g["_d"].max().date().isoformat(),
                    "countries": sorted(c for c in g["_c"].unique() if c),
                },
            })
    return {"type": "FeatureCollection", "features": feats}


def run(in_path: Path = HOTSPOTS, out_path: Path = HOTSPOTS_CLEAN, geojson_path: Path = PERSISTENT_SOURCES) -> pd.DataFrame:
    """Lee hotspots.parquet, marca calidad y persistentes, y escribe parquet + GeoJSON."""
    df = pd.read_parquet(in_path)
    clean = flag_persistent(df)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    clean.to_parquet(out_path, index=False)
    gj = persistent_sources_geojson(clean)
    Path(geojson_path).write_text(json.dumps(gj, indent=1))
    n = len(clean)
    nq = clean["passes_quality"].sum()
    npers = clean["persistent"].sum()
    print(f"{n:,} hotspots | pasan calidad: {nq:,} ({nq / max(n, 1):.1%}) | "
          f"persistentes: {npers:,} ({npers / max(nq, 1):.2%} de los de calidad) | "
          f"fuentes: {len(gj['features'])}")
    print(f"-> {out_path}\n-> {geojson_path}")
    return clean
