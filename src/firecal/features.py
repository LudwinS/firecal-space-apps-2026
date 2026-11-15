"""Pieza B: dataset celda x mes para entrenar y aplicar la armonización MODIS -> VIIRS.

Cada fila es una celda de CELL_DEG grados en un mes, con los conteos de hotspots limpios
de cada sensor (Terra y Aqua por separado, porque 2000-11..2002-06 solo existe Terra)
y variables auxiliares (FRP medio, fracción diurna). Ver CELL_MONTH_COLUMNS en contracts.py.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from firecal.contracts import CELL_DEG, CELL_MONTH, CELL_MONTH_COLUMNS, HOTSPOTS, HOTSPOTS_CLEAN

MIN_CONF = 30.0


def ensure_clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Si la pieza A (DBSCAN) aún no corrió, calcula el filtro de calidad y marca persistent=False."""
    if "passes_quality" not in df:
        ok_type = df["type"].isna() | (df["type"] == 0)
        df = df.assign(passes_quality=(df["confidence_norm"] >= MIN_CONF) & ok_type)
    if "persistent" not in df:
        df = df.assign(persistent=False)
    return df


def assign_cells(df: pd.DataFrame, deg: float = CELL_DEG) -> pd.DataFrame:
    lat0 = np.floor(df["latitude"].to_numpy() / deg) * deg
    lon0 = np.floor(df["longitude"].to_numpy() / deg) * deg
    lat0, lon0 = np.round(lat0, 4), np.round(lon0, 4)
    cell_id = pd.Series(lat0).map("{:.2f}".format) + "_" + pd.Series(lon0).map("{:.2f}".format)
    return df.assign(lat0=lat0, lon0=lon0, cell_id=cell_id.to_numpy())


def build_cell_month(df: pd.DataFrame, deg: float = CELL_DEG) -> pd.DataFrame:
    """Agrega hotspots limpios a celda x mes, rellenando con ceros todas las celdas activas en todos los meses."""
    df = ensure_clean_columns(df)
    df = df[df["passes_quality"] & ~df["persistent"].astype(bool)]
    df = assign_cells(df, deg)
    df = df.assign(month=df["acq_date"].dt.to_period("M").dt.to_timestamp())

    sat = np.where(df["sensor"] == "VIIRS", "viirs", np.where(df["satellite"] == "Terra", "terra", "aqua"))
    df = df.assign(src=sat, is_day=(df["daynight"] == "D").astype(float))

    counts = df.pivot_table(index=["cell_id", "month"], columns="src", values="frp", aggfunc="size", fill_value=0)
    counts = counts.reindex(columns=["terra", "aqua", "viirs"], fill_value=0)
    counts.columns = ["n_terra", "n_aqua", "n_viirs"]

    modis = df[df["src"] != "viirs"]
    viirs = df[df["src"] == "viirs"]
    m_aux = modis.groupby(["cell_id", "month"]).agg(frp_modis_mean=("frp", "mean"), day_frac_modis=("is_day", "mean"))
    v_aux = viirs.groupby(["cell_id", "month"]).agg(frp_viirs_mean=("frp", "mean"))

    # Rejilla completa: todas las celdas que alguna vez tuvieron actividad x todos los meses del periodo.
    cells = df.groupby("cell_id").agg(lat0=("lat0", "first"), lon0=("lon0", "first"),
                                      country=("country", lambda s: s.mode().iat[0]))
    months = pd.date_range(df["month"].min(), df["month"].max(), freq="MS")
    full = pd.MultiIndex.from_product([cells.index, months], names=["cell_id", "month"])

    out = (counts.reindex(full, fill_value=0)
           .join(m_aux).join(v_aux)
           .reset_index()
           .merge(cells, left_on="cell_id", right_index=True))
    for c in ("n_terra", "n_aqua", "n_viirs"):
        out[c] = out[c].astype("int64")
    out["n_modis"] = out["n_terra"] + out["n_aqua"]
    return out[CELL_MONTH_COLUMNS].sort_values(["cell_id", "month"]).reset_index(drop=True)


def run(out_path: Path = CELL_MONTH) -> Path:
    src = HOTSPOTS_CLEAN if HOTSPOTS_CLEAN.exists() else HOTSPOTS
    df = pd.read_parquet(src)
    cm = build_cell_month(df)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cm.to_parquet(out_path, index=False)
    print(f"{out_path.name}: {len(cm):,} filas, {cm['cell_id'].nunique():,} celdas, "
          f"{cm['month'].min():%Y-%m}..{cm['month'].max():%Y-%m} (fuente: {src.name})")
    return out_path
