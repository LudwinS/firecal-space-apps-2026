# FireCal — Harmonized Burning Activity Calendar (MODIS + VIIRS)

**NASA Space Apps Challenge 2026 · Challenge: _Harmonization of MODIS and VIIRS Hot Spots_ · Team InnovaSoft**
(Universidad Gerardo Barrios, San Miguel, El Salvador)

FireCal turns 25 years of NASA FIRMS active-fire hotspots into one consistent burning-activity calendar
(year × month, Nov 2000 → Oct 2026) for Central America, so that firefighters, emergency responders,
scientists and land managers can see, for any area, which months and years burn the most and whether the
current month is above or below the historical median — no matter which satellite sensor saw the fires.

- **Live app:** https://firecal-space-apps-2026.vercel.app
- **API docs:** https://firecal-api.onrender.com/docs (free tier: the first request after idle can take ~1 min while the server wakes up)

## The problem

MODIS (Terra/Aqua, 1 km pixels, since 2000) and VIIRS (Suomi-NPP, 375 m pixels, since 2012) are not
directly comparable: VIIRS detects roughly 4.7× more hotspots than MODIS over the same places. Stacking
their counts makes 2012 look like a fire explosion that never happened.

## How it works

1. **Data.** NASA FIRMS yearly country archives (2000–2025) for Belize, Guatemala, Honduras, El Salvador,
   Nicaragua, Costa Rica and Panama, plus Jan–Oct 2026 from the FIRMS area API (standard processing where
   available, near-real-time for the latest months; each 2026 hotspot gets the country of the nearest archived
   hotspot within 3 km, 99.96 % agreement when tested on 2025): 2,687,846 hotspots (MODIS 719,173 +
   VIIRS S-NPP 1,968,673).
2. **Cleaning.** Confidence filter (MODIS ≥ 30, VIIRS nominal/high), vegetation fires only (`type == 0`),
   and **DBSCAN clustering** to remove persistent heat sources (volcanoes such as Fuego, Santiaguito and
   Pacaya, and industrial sites): 275 sources, 1.4 % of quality detections.
3. **Harmonization.** On a 0.25° grid, month by month, six methods compete to predict VIIRS counts from
   MODIS over the complete 2012–2025 overlap years: a global ratio, a monthly ratio, a per-cell ratio shrunk toward the
   regional value (empirical Bayes), a Poisson regression, gradient boosting, and an ensemble of the
   empirical-Bayes and gradient-boosting predictions. Nov 2000 – Jun 2002 (Terra only, before Aqua) uses a
   separate Terra-only model.
4. **Validation.** Leave-one-year-out cross-validation; errors measured per country and month.

| Method | MAE (Terra + Aqua) | MAE (Terra only) |
|---|---|---|
| **Ensemble (empirical Bayes + gradient boosting)** — used in the app | **146.2** (R² 0.987, bias −0.7 %) | **203.3** |
| Per-cell ratio, empirical Bayes | 165.7 | 295.3 |
| Gradient boosting | 169.6 | 260.2 |
| Poisson regression | 217.3 | 337.8 |
| Monthly ratio | 308.9 | 528.5 |
| Single global ratio | 334.2 | 583.8 |

The ensemble cuts the error by 56 % compared with a single MODIS→VIIRS ratio. Pre-2012 months carry an
uncertainty range derived from the validation errors.

5. **Anomalies and alerts.** Each month is compared with the same calendar month in the reference years
   (percentiles 75 / 90 / 97.5 → Normal / Elevated / High / Extreme). Months with fewer than 5 detections
   are always Normal, so a single hotspot in a quiet area never raises an alert.

## The app

- **Responder view:** a traffic-light status for the latest month, peak month, most active year, a
  10-year mini calendar, and one-click CSV and PDF report downloads. Works on phones.
- **Analyst view:** full harmonized calendar with raw MODIS / raw VIIRS toggles, monthly anomalies, a
  side-by-side comparison of two areas, and the method & validation table.
- **Area selection:** country, a polygon or rectangle drawn on the map, or latitude/longitude + radius;
  custom date range and reference period.
- **Accessibility:** color-blind-safe sequential ramp (lightness changes monotonically), every alert level
  shown with color + icon + text, AA contrast verified by tests, keyboard navigation.

## Architecture

```
NASA FIRMS ─► download/build ─► clean (quality + DBSCAN) ─► features (0.25° × month)
          ─► harmonize (6 methods, leave-one-year-out) ─► parquet/json
          ─► FastAPI + DuckDB (Render, Docker) ─► React + Vite (Vercel)
```

- `src/firecal/` — offline pipeline (`download`, `clean`, `features`, `harmonize`) and shared contracts.
- `src/firecal/api/` — FastAPI service: calendar, anomalies, status, compare, CSV, PDF, methods.
- `web/` — React + TypeScript frontend (Leaflet + Geoman map, ECharts charts).
- `tests/`, `web/src/**/*.test.ts` — pytest and Vitest.

## Run it locally

Requirements: [uv](https://docs.astral.sh/uv/) (Python 3.12) and Node 20+.

```bash
uv sync
for c in Belize Guatemala Honduras El_Salvador Nicaragua Costa_Rica Panama; do
  uv run firecal download --country $c --start 2000 --end 2025
done
uv run firecal recent    # current year via the FIRMS API (needs FIRMS_MAP_KEY in .env)
uv run firecal build && uv run firecal clean && uv run firecal features && uv run firecal harmonize
uv run uvicorn firecal.api.app:app --port 8000
```

In another terminal:

```bash
cd web && npm ci && npm run dev        # http://localhost:5173 (API at http://localhost:8000)
npm run dev:mock                       # frontend only, with demo data
```

Quality checks: `uv run pytest -q`, `uv run ruff check .`, `cd web && npm test && npm run lint && npm run build`.
Static analysis with SonarQube: see `sonar-project.properties`.

## Deployment

- **Frontend:** Vercel, built from the repo root (`vercel.json` builds `web/`). Every push to `main` deploys
  to production; other branches get preview URLs. `VITE_API_URL` is set in the Vercel project.
- **API:** Render free web service from `render.yaml` + `Dockerfile`; the image downloads the processed data
  from the `data-v2` release. Every push to `main` redeploys it.

## Data and credits

- **NASA FIRMS** — Fire Information for Resource Management System (MODIS Collection 6.1 and VIIRS S-NPP
  375 m active fire products): https://firms.modaps.eosdis.nasa.gov
- Map tiles © OpenStreetMap contributors.
- Open-source libraries: pandas, DuckDB, scikit-learn, FastAPI, fpdf2, React, Leaflet, Geoman, ECharts.

## Use of AI

AI coding assistants (Claude) were used to speed up implementation, testing, documentation and visual
design under the team's direction. The solution approach (sensor harmonization with competing models,
DBSCAN filtering, and the dual responder/analyst interface) was chosen by the team.

## Team InnovaSoft

Information Systems Engineering students, Universidad Gerardo Barrios (El Salvador).
