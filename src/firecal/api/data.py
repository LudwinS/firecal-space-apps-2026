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

import numpy as np
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
PROVISIONAL_COLS = ["satellite", "frp"]  # solo hacen falta si hay que armar la serie provisional desde `raw`
HARM_COLS = ["latitude", "longitude", "acq_date", "sensor", "satellite", "country", "frp",
             "weight", "weight_lo", "weight_hi"]
BATCH_ROWS = 131_072


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
class Points:
    """Tabla de puntos + vistas numpy de las columnas que usan los filtros (sin copiar los datos)."""

    df: pd.DataFrame
    lat: np.ndarray  # float32
    lon: np.ndarray  # float32
    date: np.ndarray  # datetime64[us]
    month: np.ndarray  # int32: meses desde Store.first_month (puede quedar fuera de [0, n_months))
    country: np.ndarray  # código de categoría
    country_code: dict[str, int]


@dataclass
class Store:
    """Datos cargados en memoria. `harm` = puntos armonizados, `raw` = hotspots limpios para conteos crudos."""

    harm: Points
    raw: Points
    method: str
    # Cobertura temporal (primer y último mes con datos) global y por sensor.
    first_month: pd.Timestamp
    last_month: pd.Timestamp
    last_date: pd.Timestamp
    sensor_cover: dict[str, tuple[pd.Timestamp, pd.Timestamp]]
    countries: pd.DataFrame  # country, west, south, east, north
    months: pd.DatetimeIndex  # todos los meses de la cobertura (índice de las tablas mensuales)
    key: tuple = field(default=())


TEXT_COLS = ("sensor", "country", "satellite")
FLOAT_COLS = ("latitude", "longitude", "frp", "weight", "weight_lo", "weight_hi")


def _read(p: Path, cols: list[str], keep: dict[str, bool] | None = None) -> pd.DataFrame:
    """Lee el parquet por lotes y compacta cada lote (texto como diccionario, floats de 32 bits).

    Así el pico de memoria es ~el tamaño final y no el del archivo completo en float64 + texto:
    el plan gratuito de hosting tiene 512 MB. `keep` filtra filas por igualdad (p. ej. passes_quality=True).
    """
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    pf = pq.ParquetFile(p, read_dictionary=[c for c in TEXT_COLS if c in cols])
    available = set(pf.schema_arrow.names)
    use = [c for c in cols if c in available]
    keep = {k: v for k, v in (keep or {}).items() if k in available}

    def compact(t: pa.Table) -> pa.Table:
        if keep:
            mask = None
            for k, v in keep.items():
                eq = pc.equal(t.column(k), v)
                mask = eq if mask is None else pc.and_(mask, eq)
            t = t.filter(mask).select(use)
        for c in FLOAT_COLS:
            if c in use:
                t = t.set_column(t.schema.get_field_index(c), c, t.column(c).cast(pa.float32()))
        return t

    parts = [compact(pa.Table.from_batches([b]))
             for b in pf.iter_batches(batch_size=BATCH_ROWS, columns=use + list(keep), use_threads=False)]
    if not parts:
        parts = [compact(pf.schema_arrow.empty_table().select(use + list(keep)))]
    table = pa.concat_tables(parts).unify_dictionaries().combine_chunks()
    del parts
    df = table.to_pandas(self_destruct=True, split_blocks=True)
    del table
    # El pool de Arrow guarda la memoria liberada; devolverla al sistema evita cientos de MB retenidos.
    pa.default_memory_pool().release_unused()
    return df


def _tidy(df: pd.DataFrame) -> pd.DataFrame:
    # Tipos compactos: el plan gratuito de hosting tiene 512 MB de RAM y son ~4 M de filas.
    # Texto repetido -> category (1 byte por fila); coordenadas y pesos -> float32 (~1 m de precisión, de sobra).
    # Solo se convierte lo que no viene ya compacto de _read: cada conversión copia la columna entera.
    if df["acq_date"].dtype != "datetime64[us]":
        df["acq_date"] = pd.to_datetime(df["acq_date"]).astype("datetime64[us]")
    for c in TEXT_COLS:
        if c in df and not isinstance(df[c].dtype, pd.CategoricalDtype):
            df[c] = df[c].astype(str).astype("category")
    for c in FLOAT_COLS:
        if c in df and df[c].dtype != "float32":
            df[c] = df[c].astype("float32")
    return df if isinstance(df.index, pd.RangeIndex) else df.reset_index(drop=True)


def _load_raw(for_provisional: bool) -> pd.DataFrame:
    cols = RAW_COLS + (PROVISIONAL_COLS if for_provisional else [])
    clean = path("hotspots_clean")
    if clean.exists():
        # Filtra al leer (calidad y fuentes persistentes) para no cargar filas que se descartan.
        df = _read(clean, cols, keep={"passes_quality": True, "persistent": False})
    else:
        df = _read(path("hotspots"), cols)
    return _tidy(df)


def _provisional(raw: pd.DataFrame) -> pd.DataFrame:
    """Serie provisional sin modelo: VIIRS desde VIIRS_START, MODIS antes; weight = 1."""
    cut = pd.Timestamp(C.VIIRS_START)
    keep = ((raw["sensor"] == "VIIRS") & (raw["acq_date"] >= cut)) | ((raw["sensor"] == "MODIS") & (raw["acq_date"] < cut))
    df = raw.loc[keep].copy()
    for c in ("weight", "weight_lo", "weight_hi"):
        df[c] = np.float32(1.0)
    return df.reset_index(drop=True)


def _month_number(dates: np.ndarray) -> np.ndarray:
    """Meses desde 1970-01 (entero) de un arreglo datetime64."""
    return dates.astype("datetime64[M]").astype(np.int64)


def _points(df: pd.DataFrame, first_month: pd.Timestamp) -> Points:
    date = df["acq_date"].to_numpy()
    origin = first_month.year * 12 + first_month.month - 1 - 1970 * 12
    cat = df["country"].cat
    return Points(
        df=df, lat=df["latitude"].to_numpy(), lon=df["longitude"].to_numpy(), date=date,
        month=(_month_number(date) - origin).astype(np.int32),
        country=cat.codes.to_numpy(), country_code={str(name): i for i, name in enumerate(cat.categories)},
    )


def _signature() -> tuple:
    out = [str(data_dir())]
    for name in ("hotspots", "hotspots_clean", "hotspots_harmonized", "model_metrics"):
        p = path(name)
        out.append(p.stat().st_mtime_ns if p.exists() else None)
    return tuple(out)


def _build() -> Store:
    if not path("hotspots").exists() and not path("hotspots_clean").exists():
        raise FileNotFoundError(f"No hotspot data found in {data_dir()}")
    has_harm = path("hotspots_harmonized").exists()
    raw = _load_raw(for_provisional=not has_harm)
    if has_harm:
        harm = _tidy(_read(path("hotspots_harmonized"), HARM_COLS))
        for c in ("weight_lo", "weight_hi"):
            if c not in harm:
                harm[c] = harm["weight"]
    else:
        harm = _provisional(raw)
    first_month = harm["acq_date"].min().to_period("M").to_timestamp()
    last_date = harm["acq_date"].max()
    last_month = last_date.to_period("M").to_timestamp()
    harm_pts, raw_pts = _points(harm, first_month), _points(raw, first_month)
    # Cobertura por sensor y bbox por país con máscaras numpy (un groupby de pandas copia millones de filas).
    cover = {}
    sensor = raw["sensor"].cat
    for i, name in enumerate(sensor.categories):
        d = raw_pts.date[sensor.codes.to_numpy() == i]
        if len(d):
            cover[str(name)] = (pd.Timestamp(d.min()).to_period("M").to_timestamp(),
                                pd.Timestamp(d.max()).to_period("M").to_timestamp())
    base = raw_pts if len(raw) else harm_pts
    rows = []
    for name, code in base.country_code.items():
        m = base.country == code
        if m.any():
            lon, lat = base.lon[m], base.lat[m]
            rows.append((name, float(lon.min()), float(lat.min()), float(lon.max()), float(lat.max())))
    countries = pd.DataFrame(rows, columns=["country", "west", "south", "east", "north"])
    return Store(
        harm=harm_pts, raw=raw_pts, method=current_method(),
        first_month=first_month, last_month=last_month,
        last_date=last_date, sensor_cover=cover, countries=countries,
        months=pd.date_range(first_month, last_month, freq="MS").astype("datetime64[us]"),
    )


_lock = threading.Lock()
_cache: dict[str, Store] = {}


def get_store() -> Store:
    """Carga perezosa con caché; se recarga sola si cambian los archivos (mtime) o FIRECAL_DATA_DIR."""
    sig = _signature()
    with _lock:
        st = _cache.get("store")
        if st is None or st.key != sig:
            _cache.clear()  # suelta la versión anterior antes de cargar la nueva (no caben dos en 512 MB)
            st = None
            st = _build()
            st.key = sig
            _cache["store"] = st
            from firecal.api import queries  # evita import circular

            queries.clear_cache()
        return st


def reset() -> None:
    with _lock:
        _cache.clear()
