# API FireCal para Hugging Face Spaces (sdk: docker, puerto 7860).
# Antes de construir, copia a deploy/data/ los archivos de data/processed que use la API:
#   hotspots_clean.parquet (o hotspots.parquet), hotspots_harmonized.parquet,
#   model_metrics.json, persistent_sources.geojson
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.27 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    PYTHONUNBUFFERED=1

# HF Spaces ejecuta el contenedor con el usuario 1000
RUN useradd -m -u 1000 user
WORKDIR /app

# Dependencias primero (capa cacheable), luego el código
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev

# Datos procesados (carpeta llenada antes del build; ignorada por git en este repo)
COPY deploy ./deploy

ENV PATH="/app/.venv/bin:$PATH" \
    FIRECAL_DATA_DIR=/app/deploy/data \
    FIRECAL_CORS_ORIGINS=http://localhost:5173

RUN chown -R user:user /app
USER user

EXPOSE 7860
CMD ["uvicorn", "firecal.api.app:app", "--host", "0.0.0.0", "--port", "7860"]
