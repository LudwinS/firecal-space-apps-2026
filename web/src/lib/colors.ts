// Paleta "Ember & Night" de FireCal. Los mismos valores viven como CSS custom properties en styles.css.

/** Tokens de tema (oscuro por defecto) para lo que no se pinta con CSS: ECharts, Leaflet, tooltips. */
export const THEME = {
  night: "#0E1714",
  forest: "#17241F",
  line: "#22322C",
  lineStrong: "#2C3B35",
  ash: "#EDE8DD",
  ink2: "#B9B3A6",
  ink3: "#8E897E",
  sand: "#F2D9A6",
  ember: "#FF6A2B",
  onEmber: "#1A0700",
  sky: "#4F9BE0",
} as const;

/**
 * Rampa de calor secuencial "Ember", poco -> mucho: la luminosidad baja de forma monótona
 * (claro = poca actividad, oscuro = mucha), así que se lee con daltonismo y en escala de grises.
 */
export const EMBER_RAMP = ["#FFF4DC", "#FBD38D", "#F59E4C", "#E2632B", "#B23A2A", "#6E1F35", "#2E0F2B"];

/** Ramp used in the calendars: light (few fires) -> dark (many fires). */
export const CALENDAR_RAMP = EMBER_RAMP;

/** Cell color for exact zero detections (a touch whiter than the ramp start) and for missing data. */
export const ZERO_COLOR = "#FFFBF2";
export const NO_DATA_COLOR = "#1E2B26";

/** Outline for the darkest cells, which would otherwise melt into the dark panels. */
export const DARK_CELL_OUTLINE = "#5A4553";
/** From this point of the ramp (0..1) cells get DARK_CELL_OUTLINE. */
export const DARK_CELL_FROM = 0.8;

/** Diverging pair for anomalies (sky = below, ember = above); distinguishable with deuteranopia/protanopia. */
export const ANOMALY_BELOW = "#4F9BE0";
export const ANOMALY_ABOVE = "#FF7A3D";

/** Series colors for comparisons (sky vs ember; B also uses a dashed line and another marker). */
export const SERIES_A = "#4F9BE0";
export const SERIES_B = "#FF7A3D";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Linear interpolation along a ramp, t in [0, 1] (clamped). */
export function rampColor(t: number, ramp: string[] = CALENDAR_RAMP): string {
  if (!Number.isFinite(t)) return NO_DATA_COLOR;
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]);
  const b = hexToRgb(ramp[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/**
 * Square-root scale: a few huge months do not wash out the rest, but quiet months
 * (a handful of fires) still look quiet — a log scale made them look mid-season.
 */
export function sqrtScale(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, Math.sqrt(value / max));
}

/** Inverse of sqrtScale: value at position t of the legend. */
export function sqrtScaleInverse(t: number, max: number): number {
  return max * t * t;
}

/** Color for one calendar cell. */
export function cellColor(value: number | null | undefined, max: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_COLOR;
  if (value <= 0) return ZERO_COLOR;
  return rampColor(sqrtScale(value, max));
}

/** Number of discrete steps used to paint ECharts heatmaps (visually continuous). */
export const HEATMAP_STEPS = 40;
export const BUCKET_NO_DATA = -2;
export const BUCKET_ZERO = -1;

/** Discrete color bucket for a cell: -2 no data, -1 zero, 0..HEATMAP_STEPS-1 along the ramp. */
export function colorBucket(value: number | null | undefined, max: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return BUCKET_NO_DATA;
  if (value <= 0) return BUCKET_ZERO;
  return Math.min(HEATMAP_STEPS - 1, Math.floor(sqrtScale(value, max) * HEATMAP_STEPS));
}

/** visualMap pieces matching colorBucket (same colors as cellColor). */
export function heatmapPieces(): { value: number; color: string }[] {
  const pieces = [
    { value: BUCKET_NO_DATA, color: NO_DATA_COLOR },
    { value: BUCKET_ZERO, color: ZERO_COLOR },
  ];
  for (let k = 0; k < HEATMAP_STEPS; k++) pieces.push({ value: k, color: rampColor((k + 0.5) / HEATMAP_STEPS) });
  return pieces;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Dark (Night) or light (Ash) text, whichever reads better on the given background. */
export function textOn(bg: string): string {
  return contrastRatio(bg, THEME.night) >= contrastRatio(bg, THEME.ash) ? THEME.night : THEME.ash;
}

/** True when a cell color is dark enough to need an outline on the dark panels. */
export function needsOutline(value: number | null | undefined, max: number): boolean {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 && sqrtScale(value, max) >= DARK_CELL_FROM;
}
