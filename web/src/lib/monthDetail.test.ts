import { describe, expect, it } from "vitest";
import type { AnomalyResponse, CalendarResponse } from "../api/types";
import { isoMonth, latestPick, monthDetail } from "./monthDetail";

const row = (v: number | null) => Array.from({ length: 12 }, () => v);
const cal: CalendarResponse = {
  years: [2011, 2026],
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  harmonized: [row(10), [...row(5).slice(0, 10), null, null]],
  harmonized_lo: [row(8), [...row(5).slice(0, 10), null, null]],
  harmonized_hi: [row(13), [...row(5).slice(0, 10), null, null]],
  raw_modis: [row(2), row(1)],
  raw_viirs: [row(null), row(5)],
  total_raw_hotspots: 100,
  method: "ensemble_eb_gbm",
};
const an: AnomalyResponse = {
  reference_years: [2001, 2025],
  series: [{ month: "2011-03-01", value: 10, median: 4, anomaly: 6, ratio: 2.5, percentile: 92, level: "high" }],
};

describe("monthDetail", () => {
  it("combines calendar values with the anomaly of that month", () => {
    const d = monthDetail(cal, { yearIndex: 0, month: 2 }, an)!;
    expect(d.iso).toBe("2011-03-01");
    expect([d.harmonized, d.lo, d.hi, d.rawModis, d.rawViirs]).toEqual([10, 8, 13, 2, null]);
    expect([d.median, d.ratio, d.percentile, d.level, d.estimated]).toEqual([4, 2.5, 92, "high", true]);
  });

  it("has no level without comparison and no_data for months without data", () => {
    expect(monthDetail(cal, { yearIndex: 1, month: 0 }, an)!.level).toBe("no_data");
    const nov = monthDetail(cal, { yearIndex: 1, month: 10 }, an)!;
    expect(nov.harmonized).toBeNull();
    expect(nov.estimated).toBe(false);
  });

  it("rejects picks outside the calendar", () => {
    expect(monthDetail(cal, { yearIndex: 5, month: 0 })).toBeNull();
  });
});

describe("latestPick / isoMonth", () => {
  it("starts on the last month that has data", () => {
    expect(latestPick(cal)).toEqual({ yearIndex: 1, month: 9 });
  });
  it("formats ISO months", () => {
    expect(isoMonth(2026, 9)).toBe("2026-10-01");
  });
});

describe("rankText", () => {
  it("reads naturally above, below and at the extremes", async () => {
    const { rankText } = await import("../components/MonthDetail");
    expect(rankText(92, "April")).toBe("Higher than 92% of past April months in the reference period.");
    expect(rankText(16, "March")).toBe("Lower than 84% of past March months in the reference period.");
    expect(rankText(0, "February")).toBe("The lowest February in the reference period.");
    expect(rankText(100, "May")).toBe("The highest May in the reference period.");
  });
});
