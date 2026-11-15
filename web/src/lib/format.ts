import { MONTHS } from "../api/types";
import { getLang, t } from "../i18n";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Month abbreviation in the current language (0 = January). */
export function monthShort(i: number): string {
  return (getLang() === "es" ? MONTHS_ES : MONTHS)[i] ?? "";
}

/** The 12 month abbreviations in the current language. */
export function monthsShort(): string[] {
  return MONTHS.map((_, i) => monthShort(i));
}

/** Full month name in the current language (0 = January): "March" / "marzo". */
export function monthLong(i: number): string {
  return (getLang() === "es" ? MONTH_NAMES_ES : MONTH_NAMES)[i] ?? "";
}

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v >= 10 || v === 0 ? nf0.format(v) : nf1.format(v);
}

export function fmtPct(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = nf1.format(v) + "%";
  return signed && v > 0 ? "+" + s : s;
}

/** "2025-03-01" -> "March 2025" / "marzo de 2025" */
export function fmtMonthLong(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const name = monthLong((m || 1) - 1);
  return getLang() === "es" ? `${name} de ${y}` : `${name} ${y}`;
}

/** "2025-03-01" -> "Mar 2025" */
export function fmtMonthShort(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${monthShort((m || 1) - 1)} ${y}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Mar" (as sent by the API) -> "March" / "Marzo" (leaves unknown strings untouched). */
export function fullMonthName(short: string): string {
  const i = MONTHS.findIndex((m) => m.toLowerCase() === short.slice(0, 3).toLowerCase());
  if (i < 0) return short;
  const name = monthLong(i);
  return name[0].toUpperCase() + name.slice(1);
}

/** "El_Salvador" -> "El Salvador" */
export function prettyCountry(id: string): string {
  return id.replace(/_/g, " ");
}

/** Human-readable method id: "k_monthly" -> "k monthly". */
export function prettyMethod(id: string): string {
  const known: Record<string, string> = {
    k_monthly: "Monthly ratio (k per month)",
    k_seasonal: "Seasonal ratio (dry / wet season)",
    k_global: "Single global ratio",
    poisson_glm: "Poisson regression (GLM)",
    gbm: "Gradient boosting",
    k_cell_eb: "Ratio per grid cell and month (empirical Bayes)",
    ensemble_eb_gbm: "Ensemble: empirical Bayes + gradient boosting",
  };
  return known[id] ? t(known[id]) : id.replace(/_/g, " ");
}
