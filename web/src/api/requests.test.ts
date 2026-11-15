import { describe, expect, it } from "vitest";
import { buildArea, buildQuery, CURRENT_YEAR, dateRange, DEFAULT_AREA, DEFAULT_TIME, describeArea, normalizeBbox, referenceYears, type AreaState } from "./requests";

const area = (patch: Partial<AreaState>): AreaState => ({ ...DEFAULT_AREA, ...patch });

describe("buildArea", () => {
  it("country mode sends only the country", () => {
    expect(buildArea(area({ mode: "country", country: "Honduras" }))).toEqual({ ok: true, value: { country: "Honduras" } });
  });

  it("point mode sends [lat, lon, radius_km]", () => {
    const r = buildArea(area({ mode: "point", lat: " 13.7 ", lon: "-89.2", radiusKm: "25" }));
    expect(r).toEqual({ ok: true, value: { point: [13.7, -89.2, 25] } });
  });

  it("rejects invalid coordinates and radius", () => {
    expect(buildArea(area({ mode: "point", lat: "95", lon: "0" })).ok).toBe(false);
    expect(buildArea(area({ mode: "point", lat: "13", lon: "abc" })).ok).toBe(false);
    expect(buildArea(area({ mode: "point", lat: "13", lon: "-89", radiusKm: "0" })).ok).toBe(false);
    expect(buildArea(area({ mode: "point", lat: "13", lon: "-89", radiusKm: "5000" })).ok).toBe(false);
    expect(buildArea(area({ mode: "point", lat: "", lon: "-89" })).ok).toBe(false);
  });

  it("draw mode requires a shape and orders bbox as [west, south, east, north]", () => {
    expect(buildArea(area({ mode: "draw", drawn: null })).ok).toBe(false);
    const r = buildArea(area({ mode: "draw", drawn: { kind: "bbox", bbox: [-88, 14, -89.5, 13.2] } }));
    expect(r).toEqual({ ok: true, value: { bbox: [-89.5, 13.2, -88, 14] } });
  });

  it("draw mode passes polygons through", () => {
    const polygon = { type: "Polygon" as const, coordinates: [[[-89, 13], [-88, 13], [-88, 14], [-89, 13]]] };
    expect(buildArea(area({ mode: "draw", drawn: { kind: "polygon", polygon } }))).toEqual({ ok: true, value: { polygon } });
  });

  it("exactly one AreaSpec field is set", () => {
    for (const mode of ["country", "point"] as const) {
      const r = buildArea(area({ mode }));
      expect(r.ok && Object.keys(r.value).length).toBe(1);
    }
  });
});

describe("normalizeBbox", () => {
  it("rejects degenerate boxes", () => {
    expect(normalizeBbox([-89, 13, -89, 14])).toBeNull();
    expect(normalizeBbox([-89, 13, -88, 13])).toBeNull();
  });
});

describe("dates and reference period", () => {
  it("year 2000 starts at the first MODIS month and the current year means 'latest'", () => {
    expect(dateRange({ ...DEFAULT_TIME, startYear: 2000, endYear: CURRENT_YEAR })).toEqual({ ok: true, value: { start: "2000-11-01", end: null } });
    expect(dateRange({ ...DEFAULT_TIME, startYear: 2005, endYear: 2010 })).toEqual({ ok: true, value: { start: "2005-01-01", end: "2010-12-31" } });
  });

  it("rejects inverted ranges", () => {
    expect(dateRange({ ...DEFAULT_TIME, startYear: 2015, endYear: 2010 }).ok).toBe(false);
    expect(referenceYears({ ...DEFAULT_TIME, refPreset: "custom", refFrom: 2010, refTo: 2001 }).ok).toBe(false);
    expect(referenceYears({ ...DEFAULT_TIME, refPreset: "custom", refFrom: 2010, refTo: 2011 }).ok).toBe(false);
  });

  it("presets produce the expected reference years", () => {
    expect(referenceYears({ ...DEFAULT_TIME, refPreset: "all" })).toEqual({ ok: true, value: null });
    expect(referenceYears({ ...DEFAULT_TIME, refPreset: "modis" })).toEqual({ ok: true, value: [2001, 2011] });
    expect(referenceYears({ ...DEFAULT_TIME, refPreset: "custom", refFrom: 2001, refTo: 2010 })).toEqual({ ok: true, value: [2001, 2010] });
  });
});

describe("buildQuery", () => {
  it("builds a QueryRequest matching the API contract", () => {
    const r = buildQuery(area({ mode: "country", country: "El_Salvador" }), { ...DEFAULT_TIME, startYear: 2001, endYear: 2020, refPreset: "modis" });
    expect(r).toEqual({
      ok: true,
      value: { area: { country: "El_Salvador" }, start: "2001-01-01", end: "2020-12-31", reference_years: [2001, 2011] },
    });
  });

  it("surfaces the first validation error", () => {
    const r = buildQuery(area({ mode: "draw", drawn: null }), DEFAULT_TIME);
    expect(r.ok).toBe(false);
  });

  it("describes areas in plain English", () => {
    expect(describeArea({ country: "El_Salvador" })).toBe("El Salvador");
    expect(describeArea({ point: [13.7, -89.2, 25] })).toBe("25 km around 13.700, -89.200");
  });
});
