import { describe, expect, it } from "vitest";
import { mockAnomalies, mockCalendar, mockCompare, mockCsv, mockStatus, MOCK_FIRST_YEAR, MOCK_LAST_YEAR, simplePdf } from "./mock";
import { monthlyMedians, pearson } from "../lib/stats";

const ES = { area: { country: "El_Salvador" } };

describe("mock calendar (El Salvador)", () => {
  const cal = mockCalendar(ES);

  it("covers 2001-2025 with 12 months per year", () => {
    expect(cal.years[0]).toBe(MOCK_FIRST_YEAR);
    expect(cal.years[cal.years.length - 1]).toBe(MOCK_LAST_YEAR);
    for (const k of ["harmonized", "harmonized_lo", "harmonized_hi", "raw_modis", "raw_viirs"] as const) {
      expect(cal[k]).toHaveLength(cal.years.length);
      cal[k].forEach((row) => expect(row).toHaveLength(12));
    }
  });

  it("has a dry-season peak in Mar-Apr and almost nothing Jun-Oct", () => {
    const med = monthlyMedians(cal.harmonized);
    const peak = med.indexOf(Math.max(...med));
    expect([2, 3]).toContain(peak);
    for (const m of [5, 6, 7, 8, 9]) expect(med[m]).toBeLessThan(med[peak] * 0.1);
  });

  it("has VIIRS only from 2012 and harmonized == VIIRS afterwards", () => {
    cal.years.forEach((y, i) => {
      if (y < 2012) expect(cal.raw_viirs[i].every((v) => v === null)).toBe(true);
      else expect(cal.harmonized[i]).toEqual(cal.raw_viirs[i]);
    });
  });

  it("keeps lo <= harmonized <= hi and MODIS below VIIRS-equivalent", () => {
    cal.years.forEach((_, i) =>
      cal.harmonized[i].forEach((h, m) => {
        expect(cal.harmonized_lo[i][m]!).toBeLessThanOrEqual(h!);
        expect(cal.harmonized_hi[i][m]!).toBeGreaterThanOrEqual(h!);
        expect(cal.raw_modis[i][m]!).toBeLessThanOrEqual(Math.max(1, h!));
      }),
    );
  });

  it("is deterministic", () => {
    expect(mockCalendar(ES)).toEqual(cal);
  });

  it("respects the requested year range", () => {
    expect(mockCalendar({ ...ES, start: "2010-01-01", end: "2014-12-31" }).years).toEqual([2010, 2011, 2012, 2013, 2014]);
  });
});

describe("mock empty areas", () => {
  it("returns zero detections for a point in the Pacific", () => {
    const cal = mockCalendar({ area: { point: [11.5, -91.5, 10] } });
    expect(cal.total_raw_hotspots).toBe(0);
    expect(mockStatus({ area: { point: [11.5, -91.5, 10] } }).level).toBe("no_data");
  });
});

describe("mock anomalies & status", () => {
  it("flags the latest month (Dec 2025) as above normal", () => {
    const st = mockStatus(ES);
    expect(st.month).toBe("2025-12-01");
    expect(["elevated", "high", "extreme"]).toContain(st.level);
    expect(st.message).toMatch(/December 2025/);
    expect(["Mar", "Apr"]).toContain(st.peak_month);
  });

  it("anomaly = value - median and uses the requested reference years", () => {
    const a = mockAnomalies({ ...ES, reference_years: [2001, 2010] });
    expect(a.reference_years).toEqual([2001, 2010]);
    for (const p of a.series) if (p.median !== null) expect(p.anomaly).toBeCloseTo(p.value - p.median, 0);
  });
});

describe("mock compare & csv", () => {
  it("neighbouring countries are positively correlated", () => {
    const c = mockCompare({ area_a: { country: "El_Salvador" }, area_b: { country: "Honduras" } });
    expect(c.monthly_a).toHaveLength(12);
    expect(c.correlation).not.toBeNull();
    expect(c.correlation!).toBeGreaterThan(0.5);
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("demo PDF has a consistent xref table", async () => {
    const text = await simplePdf(["Title", "Line (with) parens", "Ünïcode → ascii"]).text();
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("CSV has the harmonized point columns", () => {
    const csv = mockCsv({ ...ES, start: "2020-01-01", end: "2020-12-31" }, 300);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("latitude,longitude,acq_date,sensor,satellite,country,frp,weight,weight_lo,weight_hi,cell_id");
    expect(lines.length).toBeGreaterThan(50);
    expect(lines.length).toBeLessThan(500);
    expect(lines[1].split(",")).toHaveLength(11);
  });
});
