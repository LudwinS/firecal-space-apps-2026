// Datos de demostración (sin backend). Sintéticos pero coherentes con FIRMS en Centroamérica:
// temporada seca ene–may con pico mar–abr, casi nada jun–oct; VIIRS desde 2012; MODIS × k antes.
// NO son datos reales: la UI muestra un aviso "Demo data" cuando se usan.
import { describeArea, requestKey } from "./requests";
import {
  MONTHS,
  type AnomalyPoint,
  type AnomalyResponse,
  type AreaInfo,
  type AreaSpec,
  type CalendarResponse,
  type CompareRequest,
  type CompareResponse,
  type FireCalApi,
  type MethodsResponse,
  type PersistentSourcesGeoJSON,
  type QueryRequest,
  type StatusResponse,
} from "./types";
import { levelFromStats } from "../lib/levels";
import { median, monthlyMedians, pearson, percentileRank } from "../lib/stats";

export const MOCK_FIRST_YEAR = 2001;
export const MOCK_LAST_YEAR = 2025;
const VIIRS_YEAR = 2012;
/** VIIRS-equivalent detections in the peak month for El Salvador in an average year. */
const BASE_PEAK = 1250;

interface MockCountry extends AreaInfo {
  scale: number;
  /** months the peak is shifted later (northern countries burn later) */
  shift: number;
}

export const MOCK_COUNTRIES: MockCountry[] = [
  { id: "Belize", name: "Belize", kind: "country", bbox: [-89.22, 15.89, -87.49, 18.5], scale: 0.7, shift: 1 },
  { id: "Costa_Rica", name: "Costa Rica", kind: "country", bbox: [-85.95, 8.03, -82.55, 11.22], scale: 0.5, shift: 0 },
  { id: "El_Salvador", name: "El Salvador", kind: "country", bbox: [-90.13, 13.15, -87.68, 14.45], scale: 1, shift: 0 },
  { id: "Guatemala", name: "Guatemala", kind: "country", bbox: [-92.23, 13.74, -88.22, 17.82], scale: 4.2, shift: 1 },
  { id: "Honduras", name: "Honduras", kind: "country", bbox: [-89.36, 12.98, -83.13, 16.51], scale: 5, shift: 0 },
  { id: "Nicaragua", name: "Nicaragua", kind: "country", bbox: [-87.69, 10.71, -82.73, 15.03], scale: 4.6, shift: 0 },
  { id: "Panama", name: "Panama", kind: "country", bbox: [-83.05, 7.2, -77.17, 9.65], scale: 1.1, shift: 0 },
];

/** Share of the peak month by calendar month (El Salvador-like). */
const SEASON = [0.36, 0.72, 1.0, 0.93, 0.38, 0.05, 0.025, 0.02, 0.015, 0.02, 0.06, 0.16];
/** VIIRS/MODIS ratio per month: higher in the wet season (small, cloud-obscured fires). */
const K_MONTH = [3.4, 3.3, 3.2, 3.3, 3.6, 4.6, 5.0, 5.1, 5.2, 4.9, 4.4, 3.8];
/** Regional year-to-year factor (El Niño years drier: 2003, 2005, 2016, 2020, 2024). */
const YEAR_FACTOR: Record<number, number> = {
  2001: 0.95, 2002: 0.88, 2003: 1.28, 2004: 0.92, 2005: 1.22, 2006: 0.83, 2007: 1.05, 2008: 0.79,
  2009: 1.0, 2010: 0.86, 2011: 0.74, 2012: 0.97, 2013: 1.12, 2014: 0.93, 2015: 1.08, 2016: 1.41,
  2017: 0.9, 2018: 0.99, 2019: 1.1, 2020: 1.25, 2021: 0.84, 2022: 0.81, 2023: 1.06, 2024: 1.48, 2025: 0.96,
};

const ES_AREA_KM2 = 21_000;

// ---------------------------------------------------------------- utilidades
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function kmBox(b: [number, number, number, number]): number {
  const [w, s, e, n] = b;
  const lat = ((s + n) / 2) * (Math.PI / 180);
  return Math.abs(e - w) * 111 * Math.cos(lat) * Math.abs(n - s) * 111;
}

function ringAreaKm2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return (Math.abs(a) / 2) * 111 * 111 * Math.cos(lat0);
}

/** Bounding box of any area (used to place synthetic points and to test "in the sea"). */
export function areaBbox(area: AreaSpec): [number, number, number, number] {
  if (area.country) return (MOCK_COUNTRIES.find((c) => c.id === area.country) ?? MOCK_COUNTRIES[2]).bbox;
  if (area.bbox) return area.bbox;
  if (area.point) {
    const [lat, lon, r] = area.point;
    const dLat = r / 111;
    const dLon = r / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  }
  if (area.polygon) {
    const pts = area.polygon.type === "Polygon" ? area.polygon.coordinates.flat() : area.polygon.coordinates.flat(2);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return MOCK_COUNTRIES[2].bbox;
}

function overlapsLand(b: [number, number, number, number]): MockCountry | null {
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  return MOCK_COUNTRIES.find((c) => cx >= c.bbox[0] && cx <= c.bbox[2] && cy >= c.bbox[1] && cy <= c.bbox[3]) ?? null;
}

/** Activity scale relative to El Salvador, 0 for tiny areas or areas in the sea. */
export function areaScale(area: AreaSpec): { scale: number; shift: number } {
  if (area.country) {
    const c = MOCK_COUNTRIES.find((x) => x.id === area.country);
    return c ? { scale: c.scale, shift: c.shift } : { scale: 0, shift: 0 };
  }
  const box = areaBbox(area);
  const land = overlapsLand(box);
  if (!land) return { scale: 0, shift: 0 };
  let km2 = 0;
  if (area.bbox) km2 = kmBox(area.bbox);
  else if (area.point) km2 = Math.PI * area.point[2] ** 2;
  else if (area.polygon)
    km2 =
      area.polygon.type === "Polygon"
        ? ringAreaKm2(area.polygon.coordinates[0])
        : area.polygon.coordinates.reduce((s, p) => s + ringAreaKm2(p[0]), 0);
  if (km2 < 3) return { scale: 0, shift: land.shift };
  return { scale: Math.min(8, km2 / ES_AREA_KM2), shift: land.shift };
}

function yearsFor(req: { start?: string; end?: string | null }): number[] {
  const y0 = Math.max(MOCK_FIRST_YEAR, req.start ? Number(req.start.slice(0, 4)) : MOCK_FIRST_YEAR);
  const y1 = Math.min(MOCK_LAST_YEAR, req.end ? Number(req.end.slice(0, 4)) : MOCK_LAST_YEAR);
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) out.push(y);
  return out;
}

// ---------------------------------------------------------------- calendario
export function mockCalendar(req: QueryRequest | { area: AreaSpec; start?: string; end?: string | null }): CalendarResponse {
  const { scale, shift } = areaScale(req.area);
  const rand = prng(hashString(requestKey(req.area)));
  const years = yearsFor(req);
  const harmonized: (number | null)[][] = [];
  const lo: (number | null)[][] = [];
  const hi: (number | null)[][] = [];
  const modis: (number | null)[][] = [];
  const viirs: (number | null)[][] = [];
  let total = 0;

  for (const y of years) {
    const rowH: number[] = [];
    const rowLo: number[] = [];
    const rowHi: number[] = [];
    const rowM: number[] = [];
    const rowV: (number | null)[] = [];
    for (let m = 0; m < 12; m++) {
      const season = SEASON[(m - shift + 12) % 12];
      let expected = BASE_PEAK * scale * season * (YEAR_FACTOR[y] ?? 1) * (0.78 + 0.44 * rand());
      if (y === MOCK_LAST_YEAR && m === 11) expected *= 2.4; // diciembre 2025 anómalo: demo de alerta
      const trueViirs = Math.max(0, Math.round(expected));
      const k = K_MONTH[m] * (0.92 + 0.16 * rand());
      const nModis = Math.max(0, Math.round((trueViirs / k) * (0.85 + 0.3 * rand())));
      rowM.push(nModis);
      total += nModis;
      if (y >= VIIRS_YEAR) {
        rowV.push(trueViirs);
        total += trueViirs;
        rowH.push(trueViirs);
        rowLo.push(trueViirs);
        rowHi.push(trueViirs);
      } else {
        rowV.push(null);
        const h = round1(nModis * K_MONTH[m]);
        rowH.push(h);
        rowLo.push(round1(h * 0.78));
        rowHi.push(round1(h * 1.27));
      }
    }
    harmonized.push(rowH);
    lo.push(rowLo);
    hi.push(rowHi);
    modis.push(rowM);
    viirs.push(rowV);
  }
  return {
    years,
    months: [...MONTHS],
    harmonized,
    harmonized_lo: lo,
    harmonized_hi: hi,
    raw_modis: modis,
    raw_viirs: viirs,
    total_raw_hotspots: total,
    method: "k_seasonal",
  };
}

// ---------------------------------------------------------------- anomalías y estado
function refRange(cal: CalendarResponse, ref: [number, number] | null | undefined): [number, number] {
  if (ref) return ref;
  return [cal.years[0] ?? MOCK_FIRST_YEAR, cal.years[cal.years.length - 1] ?? MOCK_LAST_YEAR];
}

export function mockAnomalies(req: QueryRequest): AnomalyResponse {
  // La referencia usa todo el histórico, aunque el rango mostrado sea más corto.
  const full = mockCalendar({ area: req.area });
  const shown = mockCalendar(req);
  const [r0, r1] = refRange(full, req.reference_years);
  const series: AnomalyPoint[] = [];
  shown.years.forEach((y, yi) => {
    for (let m = 0; m < 12; m++) {
      const value = shown.harmonized[yi][m];
      if (value === null) continue;
      const sample = full.years
        .map((yy, i) => ({ yy, v: full.harmonized[i][m] }))
        .filter((d) => d.yy >= r0 && d.yy <= r1 && d.yy !== y && d.v !== null)
        .map((d) => d.v as number);
      const med = median(sample);
      const pct = percentileRank(value, sample);
      let level = levelFromStats(value, med, pct);
      // Meses con muy pocos fuegos no disparan alertas.
      if (value < 5 && level !== "no_data") level = "normal";
      series.push({
        month: `${y}-${String(m + 1).padStart(2, "0")}-01`,
        value,
        median: med,
        anomaly: med === null ? null : round1(value - med),
        ratio: med && med > 0 ? Math.round((value / med) * 100) / 100 : null,
        percentile: pct === null ? null : Math.round(pct * 10) / 10,
        level,
      });
    }
  });
  return { series, reference_years: [r0, r1] };
}

export function mockStatus(req: QueryRequest): StatusResponse {
  const cal = mockCalendar(req);
  const an = mockAnomalies(req);
  const last = an.series[an.series.length - 1];
  const meds = monthlyMedians(cal.harmonized);
  const peak = meds.indexOf(Math.max(...meds));
  const sums = cal.harmonized.map((row) => row.reduce<number>((s, v) => s + (v ?? 0), 0));
  const mostActive = cal.years[sums.indexOf(Math.max(...sums))] ?? MOCK_LAST_YEAR;
  if (!last || cal.total_raw_hotspots === 0) {
    return {
      month: `${MOCK_LAST_YEAR}-12-01`,
      value: 0,
      median: null,
      level: "no_data",
      message: `No fire detections were found in ${describeArea(req.area)} for the selected period.`,
      peak_month: MONTHS[peak] ?? "Mar",
      most_active_year: mostActive,
    };
  }
  const d = new Date(last.month + "T00:00:00Z");
  const monthName = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  const v = Math.round(last.value);
  const med = last.median === null ? null : Math.round(last.median);
  const ratio = last.ratio ? `${last.ratio.toFixed(1)}× the usual` : "compared with the usual";
  const tail: Record<string, string> = {
    normal: "Activity is within the normal range.",
    elevated: "Activity is elevated: stay alert.",
    high: "Activity is high: prepare resources.",
    extreme: "Activity is extreme: among the highest ever recorded for this month.",
    no_data: "There is not enough history to compare.",
  };
  return {
    month: last.month,
    value: last.value,
    median: last.median,
    level: last.level,
    message: `${monthName} ${year}: ${v} fire detections (VIIRS-equivalent), ${ratio} for ${monthName}${med !== null ? ` (median ${med})` : ""}. ${tail[last.level]}`,
    peak_month: MONTHS[peak],
    most_active_year: mostActive,
  };
}

export function mockCompare(req: CompareRequest): CompareResponse {
  const a = mockCalendar({ area: req.area_a, start: req.start, end: req.end });
  const b = mockCalendar({ area: req.area_b, start: req.start, end: req.end });
  const flatA = a.harmonized.flat().map((v) => v ?? 0);
  const flatB = b.harmonized.flat().map((v) => v ?? 0);
  const r = pearson(flatA, flatB);
  return {
    a,
    b,
    monthly_a: monthlyMedians(a.harmonized),
    monthly_b: monthlyMedians(b.harmonized),
    correlation: r === null ? null : Math.round(r * 1000) / 1000,
  };
}

export const MOCK_METHODS: MethodsResponse = {
  chosen: "k_seasonal",
  validation: "leave-one-year-out over the MODIS/VIIRS overlap",
  metrics: [
    { method: "k_monthly", mae: 41.2, bias_pct: 6.8, r2: 0.88, years_evaluated: range(2012, 2025) },
    { method: "k_seasonal", mae: 33.5, bias_pct: -2.1, r2: 0.91, years_evaluated: range(2012, 2025) },
    { method: "k_global", mae: 52.7, bias_pct: 11.4, r2: 0.84, years_evaluated: range(2012, 2025) },
    { method: "poisson_glm", mae: 35.9, bias_pct: -3.6, r2: 0.9, years_evaluated: range(2012, 2025) },
    { method: "gbm", mae: 37.8, bias_pct: 1.9, r2: 0.89, years_evaluated: range(2012, 2025) },
  ],
};

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export const MOCK_PERSISTENT: PersistentSourcesGeoJSON = {
  type: "FeatureCollection",
  features: [
    pt(-89.63, 13.853, "Santa Ana (Ilamatepec) volcano", "volcano", 412),
    pt(-89.633, 13.813, "Izalco volcano", "volcano", 96),
    pt(-88.269, 13.434, "San Miguel (Chaparrastique) volcano", "volcano", 538),
    pt(-89.828, 13.574, "Acajutla industrial area", "industrial", 221),
    pt(-90.601, 14.381, "Pacaya volcano", "volcano", 1290),
    pt(-90.88, 14.473, "Fuego volcano", "volcano", 2874),
    pt(-91.552, 14.756, "Santiaguito volcano", "volcano", 640),
    pt(-86.161, 11.984, "Masaya volcano", "volcano", 1735),
    pt(-86.702, 12.702, "San Cristóbal volcano", "volcano", 318),
    pt(-87.18, 15.0, "Gas flare / industrial site", "industrial", 88),
  ],
};

function pt(lon: number, lat: number, name: string, kind: string, n: number) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { name, kind, n_detections: n },
  };
}

// ---------------------------------------------------------------- exportaciones
export function mockCsv(req: QueryRequest, maxRows = 2000): string {
  const cal = mockCalendar(req);
  const rand = prng(hashString("csv" + requestKey(req)));
  const [w, s, e, n] = areaBbox(req.area);
  const country = req.area.country ?? overlapsLand([w, s, e, n])?.id ?? "";
  const header = "latitude,longitude,acq_date,sensor,satellite,country,frp,weight,weight_lo,weight_hi,cell_id";
  const totalPoints = cal.years.reduce(
    (acc, y, yi) => acc + cal.months.reduce((a2, _, m) => a2 + (y >= VIIRS_YEAR ? cal.raw_viirs[yi][m] ?? 0 : cal.raw_modis[yi][m] ?? 0), 0),
    0,
  );
  const keep = totalPoints > maxRows ? maxRows / totalPoints : 1;
  const rows: string[] = [header];
  cal.years.forEach((y, yi) => {
    for (let m = 0; m < 12; m++) {
      const isViirs = y >= VIIRS_YEAR;
      const count = isViirs ? cal.raw_viirs[yi][m] ?? 0 : cal.raw_modis[yi][m] ?? 0;
      const weight = isViirs ? 1 : K_MONTH[m];
      for (let i = 0; i < count; i++) {
        if (rand() > keep) continue;
        const lat = s + (n - s) * rand();
        const lon = w + (e - w) * rand();
        const day = 1 + Math.floor(rand() * 28);
        const cell = `${(Math.floor(lat / 0.25) * 0.25).toFixed(2)}_${(Math.floor(lon / 0.25) * 0.25).toFixed(2)}`;
        rows.push(
          [
            lat.toFixed(4),
            lon.toFixed(4),
            `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            isViirs ? "VIIRS" : "MODIS",
            isViirs ? "N" : rand() < 0.5 ? "Terra" : "Aqua",
            country,
            (2 + rand() * 40).toFixed(1),
            weight.toFixed(3),
            (isViirs ? 1 : weight * 0.78).toFixed(3),
            (isViirs ? 1 : weight * 1.27).toFixed(3),
            cell,
          ].join(","),
        );
      }
    }
  });
  return rows.join("\n") + "\n";
}

/** Minimal valid one-page PDF with plain text lines (Helvetica). */
export function simplePdf(lines: string[]): Blob {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, "-").replace(/([\\()])/g, "\\$1");
  const body = ["BT", "/F1 11 Tf", "14 TL", "56 780 Td"];
  lines.forEach((l, i) => {
    if (i === 0) body.push("/F1 16 Tf", `(${esc(l)}) Tj`, "/F1 11 Tf", "T*", "T*");
    else body.push(`(${esc(l)}) Tj`, "T*");
  });
  body.push("ET");
  const stream = body.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: "application/pdf" });
}

export function mockPdf(req: QueryRequest): Blob {
  const st = mockStatus(req);
  const cal = mockCalendar(req);
  return simplePdf([
    "FireCal - Burning activity report (DEMO DATA)",
    `Area: ${describeArea(req.area)}`,
    `Period: ${cal.years[0] ?? "-"} to ${cal.years[cal.years.length - 1] ?? "-"}`,
    "",
    `Latest month: ${st.month.slice(0, 7)}   Level: ${st.level.toUpperCase()}`,
    st.message,
    `Peak month of the year: ${st.peak_month}   Most active year: ${st.most_active_year}`,
    `Raw hotspots (MODIS + VIIRS): ${cal.total_raw_hotspots}`,
    `Harmonization method: ${cal.method}`,
    "",
    "This report was generated from synthetic demo data because the live server was unavailable.",
    "Data source for the real service: NASA FIRMS (MODIS & VIIRS).",
    "Team InnovaSoft - NASA Space Apps Challenge 2026",
  ]);
}

// ---------------------------------------------------------------- API mock
const delay = <T,>(v: T, ms = 220): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));

export const mockApi: FireCalApi = {
  health: () => delay({ status: "ok", mode: "mock" }, 50),
  areas: () => delay(MOCK_COUNTRIES.map(({ id, name, kind, bbox }) => ({ id, name, kind, bbox }))),
  calendar: (req) => delay(mockCalendar(req)),
  anomalies: (req) => delay(mockAnomalies(req)),
  status: (req) => delay(mockStatus(req)),
  compare: (req) => delay(mockCompare(req), 350),
  methods: () => delay(MOCK_METHODS),
  persistentSources: () => delay(MOCK_PERSISTENT),
  exportCsv: (req) => delay(new Blob([mockCsv(req)], { type: "text/csv" })),
  reportPdf: (req) => delay(mockPdf(req)),
};
