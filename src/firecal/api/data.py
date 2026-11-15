"""Carga y caché en memoria de los archivos de data/processed.

La carpeta se configura con la variable de entorno FIRECAL_DATA_DIR (default: data/processed del repo).
Si falta hotspots_harmonized.parquet se construye una versión provisional (weight = 1):
VIIRS desde VIIRS_START y MODIS antes, y la API responde method="provisional".
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from firecal import contracts as C

FILES = {
    "hotspots": C.HOTSPOTS.name,
    "hotspots_clean": C.HOTSPOTS_CLEAN.name,
    "hotspots_harmonized": C.HOTSPOTS_HARMONIZED.name,
    "cell_month": C.CELL_MONTH.name,
    "persistent_sources": C.PERSISTENT_SOURCES.name,
    "model_metrics": C.MODEL_METRICS.name,
}

# Columnas que la API necesita de cada archivo (se carga lo mínimo para ahorrar memoria).
RAW_COLS = ["latitude", "longitude", "acq_date", "sensor", "country"]
HARM_COLS = ["latitude", "longitude", "acq_date", "sensor", "satellite", "country", "frp",
             "weight", "weight_lo", "weight_hi"]


def data_dir() -> Path:
    return Path(os.environ.get("FIRECAL_DATA_DIR") or C.PROCESSED)


def path(name: str) -> Path:
    return data_dir() / FILES[name]


def files_status() -> dict[str, bool]:
    return {name: path(name).exists() for name in FILES}


def read_metrics() -> dict | None:
    p = path("model_metrics")
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return None


def current_method() -> str:
    """'provisional' si no hay archivo armonizado; si lo hay, el método elegido en model_metrics.json."""
    if not path("hotspots_harmonized").exists():
        return "provisional"
    metrics = read_metrics() or {}
    return str(metrics.get("chosen") or "harmonized")


@dataclass
class Store:
    """Datos cargados en memoria. `harm` = puntos armonizados, `raw` = hotspots limpios para conteos crudos."""

    harm: pd.DataFrame
    raw: pd.DataFrame
    method: str
    # Cobertura temporal (primer y último mes con datos) global y por sensor.
    first_month: pd.Timestamp
    last_month: pd.Timestamp
    last_date: pd.Timestamp
    sensor_cover: dict[str, tuple[pd.Timestamp, pd.Timestamp]]
    countries: pd.DataFrame  # country, west, south, east, north
    key: tuple = field(default=())


TEXT_COLS = ("sensor", "country", "satellite")
FLOAT_COLS = ("latitude", "longitude", "frp", "weight", "weight_lo", "weight_hi")


def _read(p: Path, cols: list[str], filters=None) -> pd.DataFrame:
    """Lee con Arrow ya compacto (texto como diccionario, floats de 32 bits) para no duplicar memoria al cargar."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    available = set(pq.read_schema(p).names)
    use = [c for c in cols if c in available]
    table = pq.read_table(p, columns=use, filters=filters, read_dictionary=[c for c in TEXT_COLS if c in use])
    for c in FLOAT_COLS:
        if c in use:
            i = table.schema.get_field_index(c)
            table = table.set_column(i, c, table.column(c).cast(pa.float32()))
    df = table.to_pandas(self_destruct=True, split_blocks=True)
    del table
    # El pool de Arrow guarda la memoria liberada; devolverla al sistema evita ~500 MB retenidos.
    pa.default_memory_pool().release_unused()
    return df


def _tidy(df: pd.DataFrame) -> pd.DataFrame:
    # Tipos compactos: el plan gratuito de hosting tiene 512 MB de RAM y son ~4 M de filas.
    # Texto repetido -> category (1 byte por fila); coordenadas y pesos -> float32 (~1 m de precisión, de sobra).
    df["acq_date"] = pd.to_datetime(df["acq_date"]).astype("datetime64[us]")
    for c in TEXT_COLS:
        if c in df and not isinstance(df[c].dtype, pd.CategoricalDtype):
            df[c] = df[c].astype(str).astype("category")
    for c in FLOAT_COLS:
        if c in df and df[c].dtype != "float32":
            df[c] = df[c].astype("float32")
    return df.reset_index(drop=True)


def _load_raw() -> pd.DataFrame:
    clean = path("hotspots_clean")
    if clean.exists():
        # Filtra al leer (calidad y fuentes persistentes) para no cargar filas que se descartan.
        keep = [[("passes_quality", "=", True), ("persistent", "=", False)]]
        df = _read(clean, RAW_COLS + ["satellite", "frp"], filters=keep)
    else:
        df = _read(path("hotspots"), RAW_COLS + ["satellite", "frp"])
    return _tidy(df)


def _provisional(raw: pd.DataFrame) -> pd.DataFrame:
    """Serie provisional sin modelo: VIIRS desde VIIRS_START, MODIS antes; weight = 1."""
    cut = pd.Timestamp(C.VIIRS_START)
    keep = ((raw["sensor"] == "VIIRS") & (raw["acq_date"] >= cut)) | ((raw["sensor"] == "MODIS") & (raw["acq_date"] < cut))
    df = raw.loc[keep].copy()
    df["weight"] = df["weight_lo"] = df["weight_hi"] = 1.0
    return df.reset_index(drop=True)


def _signature() -> tuple:
    out = [str(data_dir())]
    for name in ("hotspots", "hotspots_clean", "hotspots_harmonized", "model_metrics"):
        p = path(name)
        out.append(p.stat().st_mtime_ns if p.exists() else None)
    return tuple(out)


def _build() -> Store:
    if not path("hotspots").exists() and not path("hotspots_clean").exists():
        raise FileNotFoundError(f"No hotspot data found in {data_dir()}")
    raw = _load_raw()
    if path("hotspots_harmonized").exists():
        harm = _tidy(_read(path("hotspots_harmonized"), HARM_COLS))
        for c in ("weight_lo", "weight_hi"):
            if c not in harm:
                harm[c] = harm["weight"]
    else:
        harm = _provisional(raw)
    dates = harm["acq_date"]
    cover = {s: (g.min().to_period("M").to_timestamp(), g.max().to_period("M").to_timestamp())
             for s, g in raw.groupby("sensor", observed=True)["acq_date"]}
    base = raw if len(raw) else harm
    countries = (base.groupby("country", observed=True)
                 .agg(west=("longitude", "min"), south=("latitude", "min"),
                      east=("longitude", "max"), north=("latitude", "max"))
                 .reset_index())
    countries["country"] = countries["country"].astype(str)
    return Store(
        harm=harm, raw=raw, method=current_method(),
        first_month=dates.min().to_period("M").to_timestamp(),
        last_month=dates.max().to_period("M").to_timestamp(),
        last_date=dates.max(), sensor_cover=cover, countries=countries,
    )


_lock = threading.Lock()
_cache: dict[str, Store] = {}


def get_store() -> Store:
    """Carga perezosa con caché; se recarga sola si cambian los archivos (mtime) o FIRECAL_DATA_DIR."""
    sig = _signature()
    with _lock:
        st = _cache.get("store")
        if st is None or st.key != sig:
            st = _build()
            st.key = sig
            _cache.clear()
            _cache["store"] = st
            from firecal.api import queries  # evita import circular

            queries.clear_cache()
        return st


def reset() -> None:
    with _lock:
        _cache.clear()
