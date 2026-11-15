import type { AlertLevel, AnomalyResponse, CalendarResponse } from "../api/types";

/** Mes elegido en un calendario: índices dentro de calendar.years y calendar.months. */
export interface MonthPick {
  yearIndex: number;
  month: number; // 0-11
}

export interface MonthDetailData {
  year: number;
  month: number; // 0-11
  iso: string; // "2024-03-01"
  harmonized: number | null;
  lo: number | null;
  hi: number | null;
  rawModis: number | null;
  rawViirs: number | null;
  /** Mediana del mismo mes en el periodo de referencia (null si no hay comparación). */
  median: number | null;
  ratio: number | null;
  percentile: number | null;
  level: AlertLevel;
  /** true si los valores antes de 2012 se estimaron desde MODIS. */
  estimated: boolean;
}

export function isoMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** Junta lo que dice el calendario y la serie de anomalías sobre un mes. */
export function monthDetail(cal: CalendarResponse, pick: MonthPick, anomalies?: AnomalyResponse): MonthDetailData | null {
  const year = cal.years[pick.yearIndex];
  if (year === undefined || pick.month < 0 || pick.month > 11) return null;
  const iso = isoMonth(year, pick.month);
  const at = <T,>(g: (T | null)[][]) => g[pick.yearIndex]?.[pick.month] ?? null;
  const harmonized = at(cal.harmonized);
  const a = anomalies?.series.find((p) => p.month === iso);
  return {
    year,
    month: pick.month,
    iso,
    harmonized,
    lo: at(cal.harmonized_lo),
    hi: at(cal.harmonized_hi),
    rawModis: at(cal.raw_modis),
    rawViirs: at(cal.raw_viirs),
    median: a?.median ?? null,
    ratio: a?.ratio ?? null,
    percentile: a?.percentile ?? null,
    level: harmonized === null ? "no_data" : (a?.level ?? "no_data"),
    estimated: year < 2012 || (year === 2012 && pick.month === 0),
  };
}

/** Último mes con dato del calendario (para abrir el detalle ya seleccionado). */
export function latestPick(cal: CalendarResponse): MonthPick | null {
  for (let yi = cal.years.length - 1; yi >= 0; yi--) {
    for (let m = 11; m >= 0; m--) {
      if (cal.harmonized[yi]?.[m] !== null && cal.harmonized[yi]?.[m] !== undefined) return { yearIndex: yi, month: m };
    }
  }
  return null;
}
