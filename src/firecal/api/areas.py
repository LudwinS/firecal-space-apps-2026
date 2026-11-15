"""Resolución de AreaSpec: filtro grueso (país o bbox, vectorizado) + máscara fina (polígono / radio)."""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import shapely
from shapely.geometry import shape

from firecal.contracts import AreaSpec

EARTH_RADIUS_KM = 6371.0088
KM_PER_DEG = 111.32
# Límites de tamaño de la petición: el servidor gratuito tiene 512 MB y poca CPU.
MAX_RADIUS_KM = 2000.0
MAX_POLYGON_VERTICES = 5000


class AreaError(ValueError):
    """Área inválida -> HTTP 422."""


@dataclass
class Region:
    key: str  # identificador estable para la caché
    label: str  # texto legible (inglés) para reportes
    country: str | None = None
    bbox: tuple[float, float, float, float] | None = None  # west, south, east, north
    mask: Callable[[np.ndarray, np.ndarray], np.ndarray] | None = None  # (lat, lon) -> bool


def _haversine_km(lat0: float, lon0: float, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    p0, p = math.radians(lat0), np.radians(lat)
    dlat = p - p0
    dlon = np.radians(lon) - math.radians(lon0)
    a = np.sin(dlat / 2) ** 2 + math.cos(p0) * np.cos(p) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def resolve(area: AreaSpec) -> Region:
    given = [k for k in ("country", "bbox", "polygon", "point") if getattr(area, k) is not None]
    if len(given) != 1:
        raise AreaError("Area must have exactly one of: country, bbox, polygon, point")
    kind = given[0]
    key = json.dumps({kind: getattr(area, kind)}, sort_keys=True, default=str)

    if kind == "country":
        return Region(key=key, label=area.country.replace("_", " "), country=area.country)

    if kind == "bbox":
        w, s, e, n = area.bbox
        if not (all(math.isfinite(v) for v in area.bbox) and w < e and s < n):
            raise AreaError("bbox must be [west, south, east, north] with west < east and south < north")
        return Region(key=key, label=f"Box W{w:g} S{s:g} E{e:g} N{n:g}", bbox=(w, s, e, n))

    if kind == "point":
        lat, lon, radius = area.point
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or not (0 < radius <= MAX_RADIUS_KM):
            raise AreaError(f"point must be [lat, lon, radius_km] with 0 < radius_km <= {MAX_RADIUS_KM:g}")
        dlat = radius / KM_PER_DEG
        dlon = radius / (KM_PER_DEG * max(math.cos(math.radians(lat)), 1e-6))
        return Region(
            key=key, label=f"{radius:g} km around ({lat:.4f}, {lon:.4f})",
            bbox=(lon - dlon, lat - dlat, lon + dlon, lat + dlat),
            mask=lambda la, lo: _haversine_km(lat, lon, la, lo) <= radius,
        )

    # polygon (acepta también un Feature GeoJSON y lo desenvuelve)
    geo = area.polygon
    if geo.get("type") == "Feature":
        geo = geo.get("geometry") or {}
    try:
        geom = shape(geo)
    except Exception as exc:
        raise AreaError(f"Invalid GeoJSON polygon: {exc}") from exc
    if geom.geom_type not in ("Polygon", "MultiPolygon") or geom.is_empty:
        raise AreaError("polygon must be a GeoJSON Polygon or MultiPolygon")
    if shapely.get_num_coordinates(geom) > MAX_POLYGON_VERTICES:
        raise AreaError(f"polygon has too many vertices (max {MAX_POLYGON_VERTICES}); simplify it first")
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
    shapely.prepare(geom)
    w, s, e, n = geom.bounds
    return Region(
        key=key, label="Custom polygon", bbox=(w, s, e, n),
        mask=lambda la, lo: shapely.contains_xy(geom, lo, la),
    )
