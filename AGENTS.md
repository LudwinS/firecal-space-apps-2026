# Instrucciones para agentes y colaboradores (Claude Code, Codex, Antigravity)

## Proyecto
FireCal: calendario armonizado de actividad de quema (MODIS + VIIRS, NASA FIRMS) para Centroamérica.
Reto "Harmonization of MODIS and VIIRS Hot Spots", NASA Space Apps 2026, equipo InnovaSoft. Ver README.md.

## Estructura
- `src/firecal/download.py`: descarga FIRMS (archivo por país sin llave; NRT con `FIRMS_MAP_KEY`) y construye `data/processed/hotspots.parquet`.
- `src/firecal/clean.py`: filtro de calidad + DBSCAN de fuentes persistentes (volcanes, industria).
- `src/firecal/features.py`: dataset celda 0.25° × mes.
- `src/firecal/harmonize.py`: competencia de 6 métodos con validación deja-un-año-fuera; aplica el ganador (ensamble).
- `src/firecal/contracts.py`: **contratos compartidos** (archivos, columnas, modelos de la API). No los cambies sin avisar.
- `src/firecal/api/`: API FastAPI (DuckDB). Despliegue en Hugging Face Spaces con `Dockerfile` y `deploy/`.
- `web/`: frontend React + Vite + TypeScript. Despliegue en Vercel (root `web/`).
- `tests/` (pytest) y `web/src/**/*.test.ts` (Vitest).

## Comandos
```bash
uv sync
uv run firecal download --country El_Salvador --start 2000 --end 2025
uv run firecal build && uv run firecal clean && uv run firecal features && uv run firecal harmonize
uv run uvicorn firecal.api.app:app --port 8000
cd web && npm ci && npm run dev
uv run pytest -q && uv run ruff check .
cd web && npm test && npm run lint && npm run build
```

## Reglas
- Python 3.12 con `uv`; agrega dependencias con `uv add`, no con pip.
- Nunca imprimas ni hagas commit de `.env`, tokens ni de la `FIRMS_MAP_KEY`. `data/` está en `.gitignore`.
- Cambios acotados; varias personas y agentes trabajan sobre el repo: no reescribas código ajeno sin necesidad.
- Textos visibles al usuario en **inglés**; comentarios y docs internas pueden ir en español.
- Herramientas y hosting gratuitos.
- Corre los tests y linters antes de dar algo por terminado.
