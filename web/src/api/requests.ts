// Armado y validación de requests a partir del estado de la UI.
import type { AreaSpec, GeoJSONMultiPolygon, GeoJSONPolygon, QueryRequest } from "./types";

export type AreaMode = "country" | "draw" | "point";

export type DrawnShape =
  | { kind: "bbox"; bbox: [number, number, number, number] }
  | { kind: "polygon"; polygon: GeoJSONPolygon | GeoJSONMultiPolygon };

/** Editable UI state of the area panel (all modes kept so switching tabs does not lose input). */
export interface AreaState {
  mode: AreaMode;
  country: string;
  drawn: DrawnShape | null;
  lat: string;
  lon: string;
  radiusKm: string;
}

export const DEFAULT_AREA: AreaState = {
  mode: "country",
  country: "El_Salvador",
  drawn: null,
  lat: "13.70",
  lon: "-89.20",
  radiusKm: "25",
};

export type RefPreset = "all" | "modis" | "viirs" | "custom";

export interface TimeState {
  startYear: number;
  endYear: number;
  refPreset: RefPreset;
  refFrom: number;
  refTo: number;
}

export const FIRST_YEAR = 2000;
/** First full year of VIIRS S-NPP (data starts 2012-01-20). */
export const VIIRS_FIRST_YEAR = 2012;
export const LAST_ARCHIVE_YEAR = 2025;
export const CURRENT_YEAR = new Date().getFullYear();
export const MAX_RADIUS_KM = 300;

export const DEFAULT_TIME: TimeState = {
  startYear: 2001,
  endYear: CURRENT_YEAR,
  refPreset: "all",
  refFrom: 2001,
  refTo: 2010,
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parseNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

export function buildArea(state: AreaState): Result<AreaSpec> {
  switch (state.mode) {
    case "country":
      if (!state.country) return { ok: false, error: "Choose a country." };
      return { ok: true, value: { country: state.country } };
    case "draw":
      if (!state.drawn) return { ok: false, error: "Draw a rectangle or polygon on the map." };
      if (state.drawn.kind === "bbox") {
        const bbox = normalizeBbox(state.drawn.bbox);
        if (!bbox) return { ok: false, error: "The drawn rectangle is empty. Draw it again." };
        return { ok: true, value: { bbox } };
      }
      return { ok: true, value: { polygon: state.drawn.polygon } };
    case "point": {
      const lat = parseNum(state.lat);
      const lon = parseNum(state.lon);
      const r = parseNum(state.radiusKm);
      if (lat === null || lat < -90 || lat > 90) return { ok: false, error: "Latitude must be a number between -90 and 90." };
      if (lon === null || lon < -180 || lon > 180) return { ok: false, error: "Longitude must be a number between -180 and 180." };
      if (r === null || r <= 0) return { ok: false, error: "Radius must be a positive number of kilometers." };
      if (r > MAX_RADIUS_KM) return { ok: false, error: `Radius must be ${MAX_RADIUS_KM} km or less.` };
      return { ok: true, value: { point: [round(lat, 5), round(lon, 5), round(r, 3)] } };
    }
  }
}

/** Orders a [west, south, east, north] box and rejects degenerate ones. */
export function normalizeBbox(b: [number, number, number, number]): [number, number, number, number] | null {
  const [x1, y1, x2, y2] = b.map((v) => round(v, 5));
  const west = Math.min(x1, x2);
  const east = Math.max(x1, x2);
  const south = Math.min(y1, y2);
  const north = Math.max(y1, y2);
  if (west === east || south === north) return null;
  return [west, south, east, north];
}

export function referenceYears(t: TimeState): Result<[number, number] | null> {
  switch (t.refPreset) {
    case "all":
      return { ok: true, value: null };
    case "modis":
      return { ok: true, value: [2001, VIIRS_FIRST_YEAR - 1] };
    case "viirs":
      return { ok: true, value: [VIIRS_FIRST_YEAR, LAST_ARCHIVE_YEAR] };
    case "custom": {
      const { refFrom, refTo } = t;
      if (!Number.isInteger(refFrom) || !Number.isInteger(refTo)) return { ok: false, error: "Reference years must be whole years." };
      if (refFrom > refTo) return { ok: false, error: "Reference period: the first year must not be after the last year." };
      if (refTo - refFrom < 2) return { ok: false, error: "Reference period needs at least 3 years." };
      return { ok: true, value: [refFrom, refTo] };
    }
  }
}

export function dateRange(t: TimeState): Result<{ start: string; end: string | null }> {
  if (t.startYear > t.endYear) return { ok: false, error: "Start year must not be after end year." };
  // FIRMS MODIS arranca el 2000-11-01.
  const start = t.startYear <= FIRST_YEAR ? "2000-11-01" : `${t.startYear}-01-01`;
  // Año en curso = "hasta el último dato disponible".
  const end = t.endYear >= CURRENT_YEAR ? null : `${t.endYear}-12-31`;
  return { ok: true, value: { start, end } };
}

export function buildQuery(area: AreaState, time: TimeState): Result<QueryRequest> {
  const a = buildArea(area);
  if (!a.ok) return a;
  const d = dateRange(time);
  if (!d.ok) return d;
  const ref = referenceYears(time);
  if (!ref.ok) return ref;
  return {
    ok: true,
    value: { area: a.value, start: d.value.start, end: d.value.end, reference_years: ref.value },
  };
}

/** Stable cache key for a request. */
export function requestKey(req: unknown): string {
  return JSON.stringify(req);
}

/** Short English label for an area (used in headings and file names). */
export function describeArea(area: AreaSpec): string {
  if (area.country) return area.country.replace(/_/g, " ");
  if (area.bbox) return `Box ${area.bbox.map((v) => v.toFixed(2)).join(", ")}`;
  if (area.point) return `${area.point[2]} km around ${area.point[0].toFixed(3)}, ${area.point[1].toFixed(3)}`;
  if (area.polygon) return "Drawn polygon";
  return "Area";
}

export function fileSlug(area: AreaSpec): string {
  if (area.country) return area.country.toLowerCase();
  if (area.point) return `point_${area.point[0].toFixed(2)}_${area.point[1].toFixed(2)}_${area.point[2]}km`;
  if (area.bbox) return "bbox";
  return "polygon";
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
