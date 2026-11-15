# API FireCal (FastAPI) en un contenedor. Pensado para el plan gratuito de Render (512 MB de RAM),
# pero corre igual en cualquier host Docker. Los datos procesados se bajan del release "data-v2"
# del repositorio de GitHub (data/ no se versiona).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.27 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    PYTHONUNBUFFERED=1

RUN useradd -m -u 1000 user
WORKDIR /app

# Dependencias primero (capa cacheable), luego el código
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev

# Datos procesados (NASA FIRMS, Centroamérica 2000-11 → 2026-10)
ARG DATA_URL=https://github.com/LudwinS/firecal-space-apps-2026/releases/download/data-v2
ADD ${DATA_URL}/hotspots_clean.parquet ${DATA_URL}/hotspots_harmonized.parquet \
    ${DATA_URL}/model_metrics.json ${DATA_URL}/persistent_sources.geojson /app/deploy/data/

ENV PATH="/app/.venv/bin:$PATH" \
    FIRECAL_DATA_DIR=/app/deploy/data \
    FIRECAL_CORS_ORIGINS=http://localhost:5173

RUN chown -R user:user /app
USER user

# Render define PORT (10000 por defecto); en local se usa 7860.
EXPOSE 7860
# exec: uvicorn queda como PID 1 y recibe SIGTERM directo (apagado limpio en cada redeploy).
CMD ["sh", "-c", "exec uvicorn firecal.api.app:app --host 0.0.0.0 --port ${PORT:-7860}"]
