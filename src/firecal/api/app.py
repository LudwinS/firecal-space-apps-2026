"""FastAPI del calendario armonizado de quemas (MODIS + VIIRS, NASA FIRMS).

Correr local:  uv run uvicorn firecal.api.app:app --reload
Variables de entorno:
    FIRECAL_DATA_DIR      carpeta con los archivos de data/processed (default: data/processed del repo)
    FIRECAL_CORS_ORIGINS  orígenes permitidos separados por comas (default: http://localhost:5173)
"""

from __future__ import annotations

import os
import re
import threading
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from firecal import contracts as C
from firecal.api import data, queries, report
from firecal.api.areas import AreaError, resolve


def _origins() -> list[str]:
    raw = os.environ.get("FIRECAL_CORS_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _warm_up() -> None:
    try:
        queries.warm_up()
    except Exception as exc:  # noqa: BLE001 - sin datos la API igual arranca; cada petición responderá 503
        print(f"FireCal warm-up skipped: {exc}")


@asynccontextmanager
async def _lifespan(_: FastAPI):
    # Carga los datos en segundo plano al arrancar: /api/health responde de inmediato y la primera
    # consulta real ya no paga la lectura de los parquet.
    if os.environ.get("FIRECAL_WARM_UP", "1") != "0":
        threading.Thread(target=_warm_up, name="firecal-warm-up", daemon=True).start()
    yield


# Respuestas que solo cambian cuando se redespliegan los datos: el navegador puede reutilizarlas.
STATIC_CACHE = {"Cache-Control": "public, max-age=3600"}

app = FastAPI(
    lifespan=_lifespan,
    title="FireCal API",
    description="Harmonized MODIS + VIIRS burning activity calendar (NASA FIRMS). Team InnovaSoft, NASA Space Apps 2026.",
    version="0.1.0",
)
# Además de FIRECAL_CORS_ORIGINS, se aceptan siempre el frontend público en Vercel y sus vistas previas por rama.
VERCEL_ORIGIN_REGEX = r"https://firecal-space-apps-2026(-[a-z0-9-]+)?\.vercel\.app"
app.add_middleware(CORSMiddleware, allow_origins=_origins(),
                   allow_origin_regex=os.environ.get("FIRECAL_CORS_ORIGIN_REGEX", VERCEL_ORIGIN_REGEX),
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"],
                   max_age=7200)  # los POST con JSON llevan preflight: que el navegador lo recuerde 2 h
# El CSV de un país baja de ~4 MB a ~1 MB y el JSON de anomalías de 35 KB a ~5 KB.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)


@app.exception_handler(AreaError)
@app.exception_handler(queries.QueryError)
async def _unprocessable(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(queries.AreaNotFound)
async def _not_found(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(FileNotFoundError)
async def _no_data(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": f"Data not available: {exc}"})


api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict:
    return {"status": "ok", "data_files": data.files_status(), "method": data.current_method()}


@api.get("/areas", response_model=list[C.AreaInfo])
def areas(response: Response) -> list[C.AreaInfo]:
    response.headers.update(STATIC_CACHE)
    return queries.areas()


@api.post("/calendar", response_model=C.CalendarResponse)
def calendar(req: C.QueryRequest) -> C.CalendarResponse:
    return queries.calendar(req)


@api.post("/anomalies", response_model=C.AnomalyResponse)
def anomalies(req: C.QueryRequest) -> C.AnomalyResponse:
    return queries.anomalies(req)


@api.post("/status", response_model=C.StatusResponse)
def status(req: C.QueryRequest) -> C.StatusResponse:
    return queries.status(req)


@api.post("/compare", response_model=C.CompareResponse)
def compare(req: C.CompareRequest) -> C.CompareResponse:
    return queries.compare(req)


def _slug(req: C.QueryRequest) -> str:
    label = resolve(req.area).label
    end = req.end.isoformat() if req.end else "latest"
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", f"firecal_{label}_{req.start.isoformat()}_{end}").strip("_")[:120]


@api.post("/export/csv")
def export_csv(req: C.QueryRequest) -> Response:
    # Streaming por año: exportar toda la región (2 M de filas) no cabe en 512 MB de una sola vez.
    return StreamingResponse(
        queries.export_chunks(req),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{_slug(req)}.csv"'},
    )


@api.post("/report/pdf")
def report_pdf(req: C.QueryRequest) -> Response:
    pdf = report.build_pdf(req)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_slug(req)}.pdf"'},
    )


@api.get("/methods", response_model=C.MethodsResponse)
def methods(response: Response) -> C.MethodsResponse:
    response.headers.update(STATIC_CACHE)
    raw = data.read_metrics()
    if not raw:
        return C.MethodsResponse(chosen="provisional", metrics=[])
    try:
        return C.MethodsResponse.model_validate(raw)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"model_metrics.json does not match the contract: {exc}") from exc


@lru_cache(maxsize=2)
def _persistent_body(path: str, mtime_ns: int) -> bytes:
    """GeoJSON validado y compacto; se relee solo si cambia el archivo (mtime en la llave)."""
    import json

    with open(path, encoding="utf-8") as fh:
        return json.dumps(json.load(fh), separators=(",", ":")).encode()


@api.get("/persistent-sources")
def persistent_sources() -> Response:
    p = data.path("persistent_sources")
    body = b'{"type":"FeatureCollection","features":[]}'
    if p.exists():
        try:
            body = _persistent_body(str(p), p.stat().st_mtime_ns)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail=f"Invalid persistent_sources.geojson: {exc}") from exc
    return Response(content=body, media_type="application/geo+json", headers=STATIC_CACHE)


app.include_router(api)
