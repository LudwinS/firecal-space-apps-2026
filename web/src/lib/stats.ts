export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Percentile rank (0-100) of `value` within `sample` (share of values <= value). */
export function percentileRank(value: number, sample: number[]): number | null {
  const v = sample.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const below = v.filter((x) => x < value).length;
  const equal = v.filter((x) => x === value).length;
  return (100 * (below + 0.5 * equal)) / v.length;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const mb = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/** Median of each calendar month across years (12 values, nulls ignored). */
export function monthlyMedians(grid: (number | null)[][]): number[] {
  return Array.from({ length: 12 }, (_, m) => median(grid.map((row) => row[m]).filter((x): x is number => x !== null)) ?? 0);
}

/** Max finite value in a [year][month] grid (0 if empty). */
export function gridMax(grid: (number | null)[][]): number {
  let max = 0;
  for (const row of grid) for (const v of row) if (v !== null && Number.isFinite(v) && v > max) max = v;
  return max;
}
