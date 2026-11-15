"""FastAPI del calendario armonizado de quemas (MODIS + VIIRS, NASA FIRMS).

Correr local:  uv run uvicorn firecal.api.app:app --reload
Variables de entorno:
    FIRECAL_DATA_DIR      carpeta con los archivos de data/processed (default: data/processed del repo)
    FIRECAL_CORS_ORIGINS  orígenes permitidos separados por comas (default: http://localhost:5173)
"""

from __future__ import annotations

import json
import os
import re

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from firecal import contracts as C
from firecal.api import data, queries, report
from firecal.api.areas import AreaError, resolve


def _origins() -> list[str]:
    raw = os.environ.get("FIRECAL_CORS_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(
    title="FireCal API",
    description="Harmonized MODIS + VIIRS burning activity calendar (NASA FIRMS). Team InnovaSoft, NASA Space Apps 2026.",
    version="0.1.0",
)
app.add_middleware(CORSMiddleware, allow_origins=_origins(), allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["Content-Disposition"])


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
def areas() -> list[C.AreaInfo]:
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
    df = queries.export_points(req)
    return Response(
        content=df.to_csv(index=False),
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
def methods() -> C.MethodsResponse:
    raw = data.read_metrics()
    if not raw:
        return C.MethodsResponse(chosen="provisional", metrics=[])
    try:
        return C.MethodsResponse.model_validate(raw)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=f"model_metrics.json does not match the contract: {exc}") from exc


@api.get("/persistent-sources")
def persistent_sources() -> JSONResponse:
    p = data.path("persistent_sources")
    content = {"type": "FeatureCollection", "features": []}
    if p.exists():
        try:
            content = json.loads(p.read_text())
        except ValueError as exc:
            raise HTTPException(status_code=500, detail=f"Invalid persistent_sources.geojson: {exc}") from exc
    return JSONResponse(content=content, media_type="application/geo+json")


app.include_router(api)
