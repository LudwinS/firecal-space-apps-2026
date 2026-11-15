// Armado y validación de requests a partir del estado de la UI.
import { t } from "../i18n";
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
      if (!state.country) return { ok: false, error: t("Choose a country.") };
      return { ok: true, value: { country: state.country } };
    case "draw":
      if (!state.drawn) return { ok: false, error: t("Draw a rectangle or polygon on the map.") };
      if (state.drawn.kind === "bbox") {
        const bbox = normalizeBbox(state.drawn.bbox);
        if (!bbox) return { ok: false, error: t("The drawn rectangle is empty. Draw it again.") };
        return { ok: true, value: { bbox } };
      }
      return { ok: true, value: { polygon: state.drawn.polygon } };
    case "point": {
      const lat = parseNum(state.lat);
      const lon = parseNum(state.lon);
      const r = parseNum(state.radiusKm);
      if (lat === null || lat < -90 || lat > 90) return { ok: false, error: t("Latitude must be a number between -90 and 90.") };
      if (lon === null || lon < -180 || lon > 180) return { ok: false, error: t("Longitude must be a number between -180 and 180.") };
      if (r === null || r <= 0) return { ok: false, error: t("Radius must be a positive number of kilometers.") };
      if (r > MAX_RADIUS_KM) return { ok: false, error: t("Radius must be {n} km or less.", { n: MAX_RADIUS_KM }) };
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

export function referenceYears(time: TimeState): Result<[number, number] | null> {
  switch (time.refPreset) {
    case "all":
      return { ok: true, value: null };
    case "modis":
      return { ok: true, value: [2001, VIIRS_FIRST_YEAR - 1] };
    case "viirs":
      return { ok: true, value: [VIIRS_FIRST_YEAR, LAST_ARCHIVE_YEAR] };
    case "custom": {
      const { refFrom, refTo } = time;
      if (!Number.isInteger(refFrom) || !Number.isInteger(refTo)) return { ok: false, error: t("Reference years must be whole years.") };
      if (refFrom > refTo) return { ok: false, error: t("Reference period: the first year must not be after the last year.") };
      if (refTo - refFrom < 2) return { ok: false, error: t("Reference period needs at least 3 years.") };
      return { ok: true, value: [refFrom, refTo] };
    }
  }
}

export function dateRange(time: TimeState): Result<{ start: string; end: string | null }> {
  if (time.startYear > time.endYear) return { ok: false, error: t("Start year must not be after end year.") };
  // FIRMS MODIS arranca el 2000-11-01.
  const start = time.startYear <= FIRST_YEAR ? "2000-11-01" : `${time.startYear}-01-01`;
  // Año en curso = "hasta el último dato disponible".
  const end = time.endYear >= CURRENT_YEAR ? null : `${time.endYear}-12-31`;
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

export type Bbox = [number, number, number, number];

/** Box [west, south, east, north] around every country that has data, with a small margin (degrees). */
export function coverageBox(countries: { bbox: Bbox }[], margin = 0.3): Bbox | null {
  if (countries.length === 0) return null;
  const west = Math.min(...countries.map((c) => c.bbox[0])) - margin;
  const south = Math.min(...countries.map((c) => c.bbox[1])) - margin;
  const east = Math.max(...countries.map((c) => c.bbox[2])) + margin;
  const north = Math.max(...countries.map((c) => c.bbox[3])) + margin;
  return [west, south, east, north];
}

function ringBounds(coords: unknown, acc: Bbox): Bbox {
  if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [x, y] = coords as number[];
    return [Math.min(acc[0], x), Math.min(acc[1], y), Math.max(acc[2], x), Math.max(acc[3], y)];
  }
  if (Array.isArray(coords)) for (const c of coords) acc = ringBounds(c, acc);
  return acc;
}

/** True when the area has no overlap with the covered box (a point counts by its center). */
export function outsideCoverage(area: AreaSpec, box: Bbox): boolean {
  let b: Bbox | null = null;
  if (area.point) b = [area.point[1], area.point[0], area.point[1], area.point[0]];
  else if (area.bbox) b = area.bbox;
  else if (area.polygon) b = ringBounds(area.polygon.coordinates, [Infinity, Infinity, -Infinity, -Infinity]);
  if (!b) return false;
  return b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3];
}

/** buildQuery + check that the area falls inside the region that has data. */
export function buildCoveredQuery(area: AreaState, time: TimeState, box: Bbox | null): Result<QueryRequest> {
  const q = buildQuery(area, time);
  if (q.ok && box && outsideCoverage(q.value.area, box)) {
    return { ok: false, error: t("That place is outside the region FireCal covers. Choose a location inside the highlighted area of the map.") };
  }
  return q;
}

/** Stable cache key for a request. */
export function requestKey(req: unknown): string {
  return JSON.stringify(req);
}

/** Short English label for an area (used in headings and file names). */
export function describeArea(area: AreaSpec): string {
  if (area.country) return t(area.country.replace(/_/g, " "));
  if (area.bbox) return t("Box {box}", { box: area.bbox.map((v) => v.toFixed(2)).join(", ") });
  if (area.point) return t("{r} km around {lat}, {lon}", { r: area.point[2], lat: area.point[0].toFixed(3), lon: area.point[1].toFixed(3) });
  if (area.polygon) return t("Drawn polygon");
  return t("Area");
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
