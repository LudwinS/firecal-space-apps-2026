// Tipos escritos a mano a partir de src/firecal/contracts.py (modelos pydantic).
// Si cambia el contrato, actualizar aquí. Fechas (`date`) viajan como "YYYY-MM-DD".

export type ISODate = string;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type AlertLevel = "normal" | "elevated" | "high" | "extreme" | "no_data";

/** Exactly one field must be set. */
export interface AreaSpec {
  country?: string | null;
  /** [west, south, east, north] */
  bbox?: [number, number, number, number] | null;
  /** GeoJSON geometry (Polygon or MultiPolygon) */
  polygon?: GeoJSONPolygon | GeoJSONMultiPolygon | null;
  /** [lat, lon, radius_km] */
  point?: [number, number, number] | null;
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

export interface QueryRequest {
  area: AreaSpec;
  start?: ISODate;
  end?: ISODate | null;
  reference_years?: [number, number] | null;
}

export interface AreaInfo {
  id: string;
  name: string;
  kind: "country";
  bbox: [number, number, number, number];
}

type Grid<T> = (T | null)[][];

export interface CalendarResponse {
  years: number[];
  months: string[];
  /** [year][month], VIIRS-equivalent */
  harmonized: Grid<number>;
  harmonized_lo: Grid<number>;
  harmonized_hi: Grid<number>;
  raw_modis: Grid<number>;
  raw_viirs: Grid<number>;
  total_raw_hotspots: number;
  method: string;
}

export interface AnomalyPoint {
  month: ISODate;
  value: number;
  median: number | null;
  anomaly: number | null;
  ratio: number | null;
  /** 0-100 vs the same month in the reference period */
  percentile: number | null;
  level: AlertLevel;
}

export interface AnomalyResponse {
  series: AnomalyPoint[];
  reference_years: [number, number];
}

export interface StatusResponse {
  month: ISODate;
  value: number;
  median: number | null;
  level: AlertLevel;
  /** English, displayed as-is */
  message: string;
  peak_month: string;
  most_active_year: number;
}

export interface CompareRequest {
  area_a: AreaSpec;
  area_b: AreaSpec;
  start?: ISODate;
  end?: ISODate | null;
}

export interface CompareResponse {
  a: CalendarResponse;
  b: CalendarResponse;
  /** median per month of year (12) */
  monthly_a: number[];
  monthly_b: number[];
  correlation: number | null;
}

export interface MethodMetrics {
  method: string;
  mae: number;
  bias_pct: number;
  r2: number | null;
  years_evaluated: number[];
}

export interface MethodsResponse {
  chosen: string;
  metrics: MethodMetrics[];
  validation: string;
}

export interface PersistentSourceProps {
  name?: string;
  kind?: string;
  n_detections?: number;
  [key: string]: unknown;
}

export interface PersistentSourcesGeoJSON {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: PersistentSourceProps | null;
  }[];
}

export interface HealthResponse {
  status?: string;
  [key: string]: unknown;
}

/** Everything the UI needs from a data source (live API or mock). */
export interface FireCalApi {
  health(): Promise<HealthResponse>;
  areas(): Promise<AreaInfo[]>;
  calendar(req: QueryRequest): Promise<CalendarResponse>;
  anomalies(req: QueryRequest): Promise<AnomalyResponse>;
  status(req: QueryRequest): Promise<StatusResponse>;
  compare(req: CompareRequest): Promise<CompareResponse>;
  methods(): Promise<MethodsResponse>;
  persistentSources(): Promise<PersistentSourcesGeoJSON>;
  exportCsv(req: QueryRequest): Promise<Blob>;
  reportPdf(req: QueryRequest): Promise<Blob>;
}
