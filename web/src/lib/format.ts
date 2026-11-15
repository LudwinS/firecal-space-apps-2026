import { MONTHS } from "../api/types";

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

/** "2025-03-01" -> "March 2025" */
export function fmtMonthLong(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2025-03-01" -> "Mar 2025" */
export function fmtMonthShort(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Mar" -> "March" (leaves unknown strings untouched). */
export function fullMonthName(short: string): string {
  const i = MONTHS.findIndex((m) => m.toLowerCase() === short.slice(0, 3).toLowerCase());
  return i >= 0 ? MONTH_NAMES[i] : short;
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
  return known[id] ?? id.replace(/_/g, " ");
}
