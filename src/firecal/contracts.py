"""Contratos compartidos entre piezas (pipeline offline, API y frontend).

Cualquier cambio aquí afecta a otras piezas: avisar al integrador antes de tocarlo.

Flujo de datos (todo en data/processed/):

    hotspots.parquet            <- download.build_parquet      (HOTSPOT_COLUMNS)
    hotspots_clean.parquet      <- clean.flag_persistent       (+ CLEAN_EXTRA_COLUMNS)
    persistent_sources.geojson  <- clean.persistent_sources_geojson
    cell_month.parquet          <- features.build_cell_month   (CELL_MONTH_COLUMNS)
    hotspots_harmonized.parquet <- harmonize.apply_model       (HARMONIZED_POINT_COLUMNS)
    model_metrics.json          <- harmonize.compare_methods   (MethodsResponse)

Idea clave de la serie armonizada: cada hotspot usado lleva un `weight`.
- 2012+ : se usan los hotspots VIIRS, weight = 1.
- <2012 : se usan los hotspots MODIS, weight = (VIIRS-equivalente estimado de su celda-mes) / (MODIS de esa celda-mes).
Así, para CUALQUIER área (país, bbox o polígono dibujado), harmonized = suma de weight de los puntos dentro.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from firecal.download import PROCESSED

# ---------------------------------------------------------------- archivos
HOTSPOTS = PROCESSED / "hotspots.parquet"
HOTSPOTS_CLEAN = PROCESSED / "hotspots_clean.parquet"
PERSISTENT_SOURCES = PROCESSED / "persistent_sources.geojson"
CELL_MONTH = PROCESSED / "cell_month.parquet"
HOTSPOTS_HARMONIZED = PROCESSED / "hotspots_harmonized.parquet"
MODEL_METRICS = PROCESSED / "model_metrics.json"

# ---------------------------------------------------------------- columnas
HOTSPOT_COLUMNS = [
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "sensor",
    "confidence_norm", "frp", "daynight", "type", "country",
]
# satellite: MODIS -> "Terra" | "Aqua"; VIIRS -> "N" (Suomi-NPP). sensor: "MODIS" | "VIIRS".

CLEAN_EXTRA_COLUMNS = [
    "passes_quality",  # bool: confianza >= umbral y type == 0 (o NA en NRT)
    "persistent",      # bool: pertenece a una fuente térmica persistente (volcán, industria)
    "cluster_id",      # int: id del clúster DBSCAN persistente, -1 si no
]

CELL_DEG = 0.25  # rejilla de entrenamiento del modelo de armonización
CELL_MONTH_COLUMNS = [
    "cell_id",        # str "lat0_lon0" con la esquina inferior izquierda, p. ej. "13.75_-89.25"
    "lat0", "lon0",   # float: esquina inferior izquierda de la celda
    "country",        # str: país mayoritario de los hotspots de la celda
    "month",          # Timestamp: primer día del mes
    "n_terra", "n_aqua", "n_modis", "n_viirs",  # int: hotspots limpios (passes_quality & ~persistent)
    "frp_modis_mean", "frp_viirs_mean",         # float: NaN si no hay detecciones
    "day_frac_modis",                           # float: fracción diurna MODIS, NaN si n_modis == 0
]

HARMONIZED_POINT_COLUMNS = [
    "latitude", "longitude", "acq_date", "sensor", "satellite", "country", "frp",
    "weight", "weight_lo", "weight_hi",  # float: aporte en equivalente VIIRS (con intervalo)
    "cell_id",
]

VIIRS_START = date(2012, 1, 20)  # primer día con VIIRS S-NPP en FIRMS
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# ---------------------------------------------------------------- API
AlertLevel = Literal["normal", "elevated", "high", "extreme", "no_data"]


class AreaSpec(BaseModel):
    """Área de interés. Debe venir exactamente uno de los campos."""

    country: str | None = Field(None, description="Nombre FIRMS, p. ej. 'El_Salvador'")
    bbox: tuple[float, float, float, float] | None = Field(None, description="[west, south, east, north]")
    polygon: dict | None = Field(None, description="Geometría GeoJSON (Polygon o MultiPolygon)")
    point: tuple[float, float, float] | None = Field(None, description="[lat, lon, radius_km]")


class QueryRequest(BaseModel):
    area: AreaSpec
    start: date = date(2000, 11, 1)
    end: date | None = None  # None = último dato disponible
    reference_years: tuple[int, int] | None = Field(None, description="Rango histórico de referencia, p. ej. (2001, 2010)")


class AreaInfo(BaseModel):
    id: str
    name: str
    kind: Literal["country"]
    bbox: tuple[float, float, float, float]


class CalendarResponse(BaseModel):
    years: list[int]
    months: list[str] = MONTHS
    harmonized: list[list[float | None]]  # [año][mes], equivalente VIIRS
    harmonized_lo: list[list[float | None]]
    harmonized_hi: list[list[float | None]]
    raw_modis: list[list[int | None]]
    raw_viirs: list[list[int | None]]
    total_raw_hotspots: int
    method: str


class AnomalyPoint(BaseModel):
    month: date
    value: float
    median: float | None
    anomaly: float | None
    ratio: float | None
    percentile: float | None  # 0-100 vs mismo mes en el periodo de referencia
    level: AlertLevel


class AnomalyResponse(BaseModel):
    series: list[AnomalyPoint]
    reference_years: tuple[int, int]


class StatusResponse(BaseModel):
    """Vista bombero: ¿el último mes está peor que lo normal?"""

    month: date
    value: float
    median: float | None
    level: AlertLevel
    message: str  # en inglés, para mostrar tal cual
    peak_month: str  # mes del año con mayor mediana
    most_active_year: int


class CompareRequest(BaseModel):
    area_a: AreaSpec
    area_b: AreaSpec
    start: date = date(2000, 11, 1)
    end: date | None = None


class CompareResponse(BaseModel):
    a: CalendarResponse
    b: CalendarResponse
    monthly_a: list[float]  # mediana por mes del año (12)
    monthly_b: list[float]
    correlation: float | None


class MethodMetrics(BaseModel):
    method: str  # "k_monthly" | "k_seasonal" | "poisson_glm" | "gbm" | ...
    mae: float
    bias_pct: float
    r2: float | None
    years_evaluated: list[int]


class MethodsResponse(BaseModel):
    chosen: str
    metrics: list[MethodMetrics]
    validation: str = "leave-one-year-out over the MODIS/VIIRS overlap"
