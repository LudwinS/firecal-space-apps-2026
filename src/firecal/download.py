"""Descarga de hotspots FIRMS.

Dos fuentes:
1. Archivos anuales por país (archivo histórico, calidad "standard", SIN llave):
   https://firms.modaps.eosdis.nasa.gov/data/country/{sensor}/{year}/{sensor}_{year}_{Country}.csv
   - modis:       2000 -> último año cerrado
   - viirs-snpp:  2012 -> último año cerrado (el año en curso aún no está publicado)
2. API de área (año en curso: SP y, donde aún no existe, NRT), REQUIERE FIRMS_MAP_KEY en .env.
   El país se asigna por el hotspot histórico más cercano (ver assign_country).
"""

from __future__ import annotations

import io
import os
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
HOTSPOTS_PARQUET = PROCESSED / "hotspots.parquet"

COUNTRY_URL = "https://firms.modaps.eosdis.nasa.gov/data/country/{s}/{y}/{s}_{y}_{c}.csv"
AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{bbox}/{days}/{start}"

AVAILABILITY_URL = "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{key}/all"

ARCHIVE_SENSORS = {"modis": 2000, "viirs-snpp": 2012}
# Año en curso por la API de área: primero la versión "standard" (SP) y, donde aún no existe, la NRT.
API_SOURCES = {"modis": ("MODIS_SP", "MODIS_NRT"), "viirs-snpp": ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT")}
CENTRAL_AMERICA_BBOX = (-92.5, 7.0, -77.0, 18.6)  # oeste, sur, este, norte
MAX_COUNTRY_KM = 3.0  # distancia máxima al punto histórico más cercano para heredar su país


def download_country(country: str, start: int, end: int, force: bool = False) -> list[Path]:
    """Descarga CSV anuales por país. Devuelve rutas existentes (omite años no publicados)."""
    RAW.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for sensor, first_year in ARCHIVE_SENSORS.items():
        for year in range(max(start, first_year), end + 1):
            out = RAW / f"{sensor}_{year}_{country}.csv"
            if out.exists() and not force:
                paths.append(out)
                continue
            r = requests.get(COUNTRY_URL.format(s=sensor, y=year, c=country), timeout=120)
            if r.status_code == 404:
                print(f"  - {sensor} {year}: no publicado (404)")
                continue
            r.raise_for_status()
            # Escritura atómica: una descarga cortada no debe quedar como CSV válido para la próxima corrida.
            tmp = out.with_name(out.name + ".part")
            tmp.write_bytes(r.content)
            tmp.replace(out)
            print(f"  + {sensor} {year}: {len(r.content) / 1024:.0f} KB")
            paths.append(out)
    return paths


def _map_key() -> str:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
    key = os.getenv("FIRMS_MAP_KEY")
    if not key:
        raise RuntimeError("Falta FIRMS_MAP_KEY en .env (gratis en https://firms.modaps.eosdis.nasa.gov/api/map_key/)")
    return key


def data_availability(key: str) -> dict[str, tuple[date, date]]:
    """Rango de fechas publicado por FIRMS para cada fuente de la API."""
    r = requests.get(AVAILABILITY_URL.format(key=key), timeout=60)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    return {row.data_id: (date.fromisoformat(row.min_date), date.fromisoformat(row.max_date))
            for row in df.itertuples()}


def fetch_area(key: str, source: str, bbox: tuple[float, float, float, float], start: date, end: date) -> pd.DataFrame:
    """Hotspots de una fuente por bbox (oeste, sur, este, norte), en bloques de 5 días (límite de la API)."""
    frames = []
    bbox_s = ",".join(str(v) for v in bbox)
    d = start
    while d <= end:
        days = min(5, (end - d).days + 1)
        url = AREA_URL.format(key=key, source=source, bbox=bbox_s, days=days, start=d.isoformat())
        # Los errores nunca incluyen la URL: lleva la FIRMS_MAP_KEY.
        for attempt in range(4):
            try:
                r = requests.get(url, timeout=180)
                break
            except requests.RequestException as exc:
                if attempt == 3:
                    raise RuntimeError(f"FIRMS no respondió para {source} {d}: {type(exc).__name__}") from None
                time.sleep(10 * (attempt + 1))
        if r.status_code != 200 or r.text.lower().startswith("invalid"):
            raise RuntimeError(f"FIRMS rechazó la consulta {source} {d} ({r.status_code}): {r.text[:80]}")
        if r.text.strip():
            frames.append(pd.read_csv(io.StringIO(r.text)))
        d += timedelta(days=days)
        time.sleep(0.5)  # respetar el límite de transacciones de FIRMS
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def assign_country(lat: np.ndarray, lon: np.ndarray, ref: pd.DataFrame, max_km: float = MAX_COUNTRY_KM) -> np.ndarray:
    """País del hotspot histórico más cercano (archivos por país de FIRMS) si está a <= max_km; si no, None.

    La API de área no trae el país; los 25 años de detecciones por país dan una referencia densa de fronteras.
    """
    from sklearn.neighbors import BallTree

    ref = ref[["latitude", "longitude", "country"]].assign(
        latitude=ref["latitude"].round(3), longitude=ref["longitude"].round(3)).drop_duplicates()
    tree = BallTree(np.radians(ref[["latitude", "longitude"]].to_numpy()), metric="haversine")
    dist, idx = tree.query(np.radians(np.column_stack([lat, lon])), k=1)
    km = dist[:, 0] * 6371.0088
    countries = ref["country"].to_numpy()[idx[:, 0]].astype(object)
    countries[km > max_km] = None
    return countries


def download_recent(end: date | None = None, bbox: tuple[float, float, float, float] = CENTRAL_AMERICA_BBOX,
                    reference: Path = HOTSPOTS_PARQUET) -> list[Path]:
    """Año en curso (aún sin archivo anual) por la API de área, hasta `end` (por defecto, el último mes completo).

    Escribe data/raw/{sensor}_{año}_{País}.csv con las mismas columnas que el archivo anual, para que
    `firecal build` los combine igual. Requiere FIRMS_MAP_KEY y un hotspots.parquet previo (referencia de países).
    """
    key = _map_key()
    avail = data_availability(key)
    if end is None:
        end = date.today().replace(day=1) - timedelta(days=1)
    start = date(end.year, 1, 1)
    ref = pd.read_parquet(reference, columns=["latitude", "longitude", "country"])
    RAW.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for sensor, (sp, nrt) in API_SOURCES.items():
        sp_end = min(end, avail[sp][1]) if sp in avail else start - timedelta(days=1)
        parts = []
        if sp_end >= start:
            parts.append(fetch_area(key, sp, bbox, start, sp_end))
        if sp_end < end:
            nrt_start = max(sp_end + timedelta(days=1), avail[nrt][0])
            nrt_end = min(end, avail[nrt][1])
            if nrt_start > sp_end + timedelta(days=1) or nrt_end < end:
                print(f"  ! {sensor}: FIRMS no cubre todo el rango ({sp} hasta {sp_end}, {nrt} {nrt_start} -> {nrt_end})")
            parts.append(fetch_area(key, nrt, bbox, nrt_start, nrt_end))
        df = pd.concat(parts, ignore_index=True)
        df = df[pd.to_datetime(df["acq_date"]).dt.date.between(start, end)]
        df = df.assign(country=assign_country(df["latitude"].to_numpy(), df["longitude"].to_numpy(), ref))
        kept = df["country"].notna()
        print(f"  {sensor} {start} -> {end}: {len(df):,} en el bbox, {int(kept.sum()):,} dentro de los países")
        for country, g in df[kept].groupby("country"):
            out = RAW / f"{sensor}_{end.year}_{country}.csv"
            g.drop(columns="country").to_csv(out, index=False)
            paths.append(out)
    return paths


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Unifica columnas MODIS/VIIRS a un esquema común."""
    df = df.copy()
    df["sensor"] = df["instrument"].str.upper()
    df["acq_date"] = pd.to_datetime(df["acq_date"])
    # Confianza normalizada a 0-100: MODIS ya es 0-100; VIIRS es l/n/h.
    conf = df["confidence"].astype(str).str.lower()
    viirs_map = {"l": 20.0, "low": 20.0, "n": 60.0, "nominal": 60.0, "h": 90.0, "high": 90.0}
    df["confidence_norm"] = pd.to_numeric(conf, errors="coerce").fillna(conf.map(viirs_map))
    if "type" not in df:
        df["type"] = pd.NA  # NRT no trae "type"
    df["acq_time"] = df["acq_time"].astype(str).str.zfill(4)
    keep = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "sensor",
            "confidence_norm", "frp", "daynight", "type"]
    return df[keep]


def build_parquet(paths: list[Path] | None = None) -> Path:
    """Combina todos los CSV de data/raw en data/processed/hotspots.parquet."""
    paths = paths or sorted(RAW.glob("*.csv"))
    if not paths:
        raise FileNotFoundError("No hay CSV en data/raw. Corre: uv run firecal download")
    # El país sale del nombre del archivo: {sensor}_{año}_{País}.csv
    df = pd.concat(
        [normalize(pd.read_csv(p)).assign(country=p.stem.split("_", 2)[2]) for p in paths], ignore_index=True
    )
    df = df.drop_duplicates()
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_parquet(HOTSPOTS_PARQUET, index=False)
    print(f"Guardado {HOTSPOTS_PARQUET.relative_to(ROOT)}: {len(df):,} hotspots "
          f"({df['acq_date'].min():%Y-%m-%d} -> {df['acq_date'].max():%Y-%m-%d})")
    return HOTSPOTS_PARQUET
