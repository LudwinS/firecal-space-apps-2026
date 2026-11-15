# FireCal — Harmonized Burning Activity Calendar (MODIS + VIIRS)

**NASA Space Apps Challenge 2026 · Challenge: _Harmonization of MODIS and VIIRS Hot Spots_ · Team InnovaSoft**
(Universidad Gerardo Barrios, San Miguel, El Salvador)

FireCal turns 25 years of NASA FIRMS active-fire hotspots into one consistent burning-activity calendar
(year × month, Nov 2000 → Dec 2025) for Central America, so that firefighters, emergency responders,
scientists and land managers can see, for any area, which months and years burn the most and whether the
current month is above or below the historical median — no matter which satellite sensor saw the fires.

- **Live app:** https://firecal-space-apps-2026.vercel.app
- **API docs:** https://firecal-api.onrender.com/docs (free tier: the first request after idle can take ~1 min while the server wakes up)

## The problem

MODIS (Terra/Aqua, 1 km pixels, since 2000) and VIIRS (Suomi-NPP, 375 m pixels, since 2012) are not
directly comparable: VIIRS detects roughly 4.7× more hotspots than MODIS over the same places. Stacking
their counts makes 2012 look like a fire explosion that never happened.

## How it works

1. **Data.** NASA FIRMS yearly country archives for Belize, Guatemala, Honduras, El Salvador, Nicaragua,
   Costa Rica and Panama: 2,583,438 hotspots (MODIS 700,335 + VIIRS S-NPP 1,883,103).
2. **Cleaning.** Confidence filter (MODIS ≥ 30, VIIRS nominal/high), vegetation fires only (`type == 0`),
   and **DBSCAN clustering** to remove persistent heat sources (volcanoes such as Fuego, Santiaguito and
   Pacaya, and industrial sites): 236 sources, 1.2 % of quality detections.
3. **Harmonization.** On a 0.25° grid, month by month, six methods compete to predict VIIRS counts from
   MODIS over the 2012–2025 overlap: a global ratio, a monthly ratio, a per-cell ratio shrunk toward the
   regional value (empirical Bayes), a Poisson regression, gradient boosting, and an ensemble of the
   empirical-Bayes and gradient-boosting predictions. Nov 2000 – Jun 2002 (Terra only, before Aqua) uses a
   separate Terra-only model.
4. **Validation.** Leave-one-year-out cross-validation; errors measured per country and month.

| Method | MAE (Terra + Aqua) | MAE (Terra only) |
|---|---|---|
| **Ensemble (empirical Bayes + gradient boosting)** — used in the app | **147.9** (R² 0.987, bias −0.6 %) | **204.7** |
| Per-cell ratio, empirical Bayes | 166.1 | 295.5 |
| Gradient boosting | 171.3 | 259.4 |
| Poisson regression | 217.9 | 338.9 |
| Monthly ratio | 309.3 | 528.6 |
| Single global ratio | 334.5 | 583.8 |

The ensemble cuts the error by 56 % compared with a single MODIS→VIIRS ratio. Pre-2012 months carry an
uncertainty range derived from the validation errors.

5. **Anomalies and alerts.** Each month is compared with the same calendar month in the reference years
   (percentiles 75 / 90 / 97.5 → Normal / Elevated / High / Extreme).

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
