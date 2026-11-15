import { describe, expect, it } from "vitest";
import { ICON_DATA } from "../components/icons/iconData";
import { ANOMALY_ABOVE, ANOMALY_BELOW, BUCKET_NO_DATA, BUCKET_ZERO, CALENDAR_RAMP, cellColor, colorBucket, EMBER_RAMP, HEATMAP_STEPS, heatmapPieces, contrastRatio, luminance, needsOutline, NO_DATA_COLOR, rampColor, SERIES_A, SERIES_B, sqrtScale, sqrtScaleInverse, textOn, THEME, ZERO_COLOR } from "./colors";
import { LEVELS, levelFromStats, levelStyle } from "./levels";

describe("color ramp", () => {
  it("returns the ends of the ramp at 0 and 1 and clamps outside", () => {
    expect(rampColor(0)).toBe(CALENDAR_RAMP[0]);
    expect(rampColor(1)).toBe(CALENDAR_RAMP[CALENDAR_RAMP.length - 1]);
    expect(rampColor(-3)).toBe(CALENDAR_RAMP[0]);
    expect(rampColor(7)).toBe(CALENDAR_RAMP[CALENDAR_RAMP.length - 1]);
  });

  it("gets darker as activity grows (monotonic luminance)", () => {
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => contrastRatio(rampColor(t), "#ffffff"));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it("uses special colors for zero and missing values", () => {
    expect(cellColor(0, 100)).toBe(ZERO_COLOR);
    expect(cellColor(null, 100)).toBe(NO_DATA_COLOR);
    expect(cellColor(Number.NaN, 100)).toBe(NO_DATA_COLOR);
    expect(cellColor(100, 100)).toBe(CALENDAR_RAMP[CALENDAR_RAMP.length - 1]);
  });

  it("sqrt scale maps 0..max to 0..1 and quiet months stay light", () => {
    expect(sqrtScale(0, 1000)).toBe(0);
    expect(sqrtScale(1000, 1000)).toBeCloseTo(1);
    expect(sqrtScale(10, 1000)).toBeCloseTo(0.1); expect(sqrtScaleInverse(0.5, 1000)).toBe(250);
    expect(sqrtScale(5, 0)).toBe(0);
  });

  it("heatmap buckets cover no-data, zero and the full ramp", () => {
    expect(colorBucket(null, 100)).toBe(BUCKET_NO_DATA);
    expect(colorBucket(0, 100)).toBe(BUCKET_ZERO);
    expect(colorBucket(100, 100)).toBe(HEATMAP_STEPS - 1);
    expect(colorBucket(1e9, 100)).toBe(HEATMAP_STEPS - 1);
    const values = heatmapPieces().map((p) => p.value);
    for (const v of [BUCKET_NO_DATA, BUCKET_ZERO, 0, HEATMAP_STEPS - 1]) expect(values).toContain(v);
  });

  it("uses the Ember ramp, light to dark, with strictly decreasing luminance", () => {
    expect(CALENDAR_RAMP).toEqual(["#FFF4DC", "#FBD38D", "#F59E4C", "#E2632B", "#B23A2A", "#6E1F35", "#2E0F2B"]);
    for (let i = 1; i < EMBER_RAMP.length; i++) expect(luminance(EMBER_RAMP[i])).toBeLessThan(luminance(EMBER_RAMP[i - 1]));
  });

  it("no-data and zero cells are distinguishable from the ramp ends", () => {
    expect(NO_DATA_COLOR).toBe("#1E2B26");
    // Sin datos (oscuro, neutro) frente al primer paso de la rampa (claro).
    expect(contrastRatio(NO_DATA_COLOR, EMBER_RAMP[0])).toBeGreaterThanOrEqual(3);
    expect(luminance(ZERO_COLOR)).toBeGreaterThanOrEqual(luminance(EMBER_RAMP[0]));
  });

  it("outlines only the darkest cells", () => {
    expect(needsOutline(100, 100)).toBe(true);
    expect(needsOutline(10, 100)).toBe(false);
    expect(needsOutline(null, 100)).toBe(false);
    expect(needsOutline(0, 100)).toBe(false);
  });

  it("picks readable text on dark and light cells", () => {
    expect(textOn("#2E0F2B")).toBe(THEME.ash);
    expect(textOn("#FFF4DC")).toBe(THEME.night);
  });

  it("anomaly and series colors pass AA against the dark panels", () => {
    for (const c of [ANOMALY_ABOVE, ANOMALY_BELOW, SERIES_A, SERIES_B]) {
      expect(contrastRatio(c, THEME.forest)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c, THEME.night)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("theme tokens", () => {
  it("text tokens pass WCAG AA on the Night background and Forest panels", () => {
    for (const bg of [THEME.night, THEME.forest]) {
      for (const fg of [THEME.ash, THEME.ink2, THEME.ink3, THEME.sand, THEME.ember]) {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("text on Ember passes AA", () => {
    expect(contrastRatio(THEME.onEmber, THEME.ember)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("alert levels", () => {
  it("every level chip and status card passes WCAG AA for its text", () => {
    for (const l of Object.values(LEVELS)) {
      expect(contrastRatio(l.fg, l.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(l.card.title, l.card.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(l.card.text, l.card.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(l.card.kicker, l.card.bg)).toBeGreaterThanOrEqual(4.5);
      // Ícono sobre el fondo oscuro: elemento gráfico, mínimo 3:1.
      expect(contrastRatio(l.accent, THEME.night)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the specified level colors", () => {
    expect([LEVELS.normal.bg, LEVELS.normal.fg]).toEqual(["#DCEBF7", "#0B3A5E"]);
    expect([LEVELS.elevated.bg, LEVELS.elevated.fg]).toEqual(["#FBE3A8", "#5A3B00"]);
    expect([LEVELS.high.bg, LEVELS.high.fg]).toEqual(["#E2632B", "#1A0700"]);
    expect([LEVELS.extreme.bg, LEVELS.extreme.fg]).toEqual(["#6E1F35", "#FFE9EE"]);
    expect([LEVELS.normal.card.bg, LEVELS.normal.card.border]).toEqual(["#10273A", "#23557F"]);
  });

  it("level chips get darker with severity (readable without color)", () => {
    const order = [LEVELS.normal, LEVELS.elevated, LEVELS.high, LEVELS.extreme].map((l) => luminance(l.bg));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThan(order[i - 1]);
  });

  it("every level has its own icon and a label (not color only)", () => {
    for (const l of Object.values(LEVELS)) {
      expect(ICON_DATA[l.icon].length).toBeGreaterThan(0);
      expect(l.label.length).toBeGreaterThan(0);
    }
    expect(LEVELS.normal.icon).toBe("level-normal");
    expect(LEVELS.extreme.icon).toBe("level-extreme");
  });

  it("maps percentiles to levels", () => {
    expect(levelFromStats(10, 10, 50)).toBe("normal");
    expect(levelFromStats(20, 10, 75)).toBe("elevated");
    expect(levelFromStats(30, 10, 90)).toBe("high");
    expect(levelFromStats(90, 10, 99)).toBe("extreme");
    expect(levelFromStats(5, null, null)).toBe("no_data");
    expect(levelFromStats(0, 0, 50)).toBe("normal");
  });

  it("falls back to no_data for unknown levels", () => {
    expect(levelStyle(undefined).level).toBe("no_data");
    expect(levelStyle("weird" as never).level).toBe("no_data");
  });
});
