---
title: FireCal API
emoji: 🔥
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: Harmonized MODIS + VIIRS burning activity calendar API
---

# FireCal API — Harmonized MODIS + VIIRS burning activity calendar

Team **InnovaSoft**, NASA Space Apps Challenge 2026 — challenge *Harmonization of MODIS and VIIRS Hot Spots*.

REST API (FastAPI) that serves a year × month burning-activity calendar for any area in Central America,
harmonized across MODIS (2000+) and VIIRS S-NPP (2012+) hotspots, plus anomalies against the historical
median, a firefighter-friendly status, CSV export and a PDF report.

- Interactive docs: `/docs`
- Health check: `/api/health`
- Data: NASA FIRMS (Fire Information for Resource Management System).

## Deploying this Space

1. Copy this file to the root of the Space repository as `README.md`.
2. Copy `Dockerfile`, `pyproject.toml`, `uv.lock`, `README.md` (project), `src/` and `deploy/` (with the
   processed data files in `deploy/data/`) to the Space repository. Track `*.parquet` with Git LFS.
3. Set the `FIRECAL_CORS_ORIGINS` variable in the Space settings to the frontend URL(s), comma-separated.
