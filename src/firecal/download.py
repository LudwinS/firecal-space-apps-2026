"""Descarga de hotspots FIRMS.

Dos fuentes:
1. Archivos anuales por país (archivo histórico, calidad "standard", SIN llave):
   https://firms.modaps.eosdis.nasa.gov/data/country/{sensor}/{year}/{sensor}_{year}_{Country}.csv
   - modis:       2000 -> último año cerrado
   - viirs-snpp:  2012 -> último año cerrado (el año en curso aún no está publicado)
2. API de área NRT (año en curso), REQUIERE FIRMS_MAP_KEY en .env.
"""

from __future__ import annotations

import io
import os
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
HOTSPOTS_PARQUET = PROCESSED / "hotspots.parquet"

COUNTRY_URL = "https://firms.modaps.eosdis.nasa.gov/data/country/{s}/{y}/{s}_{y}_{c}.csv"
AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{bbox}/{days}/{start}"

ARCHIVE_SENSORS = {"modis": 2000, "viirs-snpp": 2012}
NRT_SOURCES = {"MODIS_NRT": "MODIS", "VIIRS_SNPP_NRT": "VIIRS"}


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


def _redact(text: str, secret: str) -> str:
    return text.replace(secret, "***")


def fetch_nrt_area(bbox: tuple[float, float, float, float], start: date, end: date) -> pd.DataFrame:
    """Hotspots NRT por bbox (oeste, sur, este, norte) en bloques de 10 días. Requiere FIRMS_MAP_KEY."""
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
    key = os.getenv("FIRMS_MAP_KEY")
    if not key:
        raise RuntimeError("Falta FIRMS_MAP_KEY en .env (gratis en https://firms.modaps.eosdis.nasa.gov/api/map_key/)")
    frames = []
    bbox_s = ",".join(str(v) for v in bbox)
    for source in NRT_SOURCES:
        d = start
        while d <= end:
            days = min(10, (end - d).days + 1)
            url = AREA_URL.format(key=key, source=source, bbox=bbox_s, days=days, start=d.isoformat())
            try:
                r = requests.get(url, timeout=120)
                r.raise_for_status()
            except requests.RequestException as exc:
                # La llave va en la URL y requests la incluye en el mensaje: se redacta y se corta la cadena.
                raise RuntimeError(f"FIRMS NRT request failed: {_redact(str(exc), key)}") from None
            if r.text.strip() and not r.text.lower().startswith("invalid"):
                frames.append(pd.read_csv(io.StringIO(r.text)))
            d += timedelta(days=days)
            time.sleep(0.5)  # respetar el límite de transacciones de FIRMS
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


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
