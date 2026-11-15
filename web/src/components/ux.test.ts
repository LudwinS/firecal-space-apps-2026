import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { StatusResponse } from "../api/types";
import { setLang } from "../i18n";
import { NO_DETECTIONS, displayLevel, levelStyle } from "../lib/levels";
import { InfoTip } from "./InfoTip";
import { StatusCard, levelMeaning, levelRange } from "./StatusCard";

afterEach(() => setLang("en"));

const status = (over: Partial<StatusResponse>): StatusResponse => ({
  month: "2026-10-01",
  value: 120,
  median: 100,
  level: "normal",
  message: "October 2026: 1.2× the usual for October",
  peak_month: "Mar",
  most_active_year: 2015,
  ...over,
});
const card = (over: Partial<StatusResponse>) => renderToStaticMarkup(createElement(StatusCard, { status: status(over), areaName: "El Salvador" }));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("InfoTip", () => {
  const html = renderToStaticMarkup(createElement(InfoTip, { term: "Harmonized", text: "Both sensors on one scale." }));

  it("is a real button described by its tooltip", () => {
    expect(html).toContain('<button type="button"');
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`role="tooltip" id="${id}"`);
    expect(html).toContain("Both sensors on one scale.");
  });

  it("has an accessible name and starts closed", () => {
    expect(html).toContain('aria-label="What is Harmonized?"');
    expect(html).toContain('aria-expanded="false"');
    expect(renderToStaticMarkup(createElement(InfoTip, { text: "x" }))).toContain('aria-label="More information"');
  });

  it("translates its accessible name", () => {
    setLang("es");
    expect(renderToStaticMarkup(createElement(InfoTip, { term: "Armonizado", text: "x" }))).toContain('aria-label="¿Qué es Armonizado?"');
  });
});

describe("StatusCard alert scale", () => {
  it("marks no chip as active when there are zero detections", () => {
    const html = card({ value: 0, median: 0, level: "normal" });
    expect(html).toContain("No detections");
    expect(count(html, 'aria-current="true"')).toBe(0);
    expect(count(html, "level-chip-check")).toBe(0);
    expect(html).toContain("No fire was detected, so there is no level to rate.");
  });

  it("marks exactly the current level, with a check, and keeps all four chips", () => {
    for (const level of ["normal", "elevated", "high", "extreme"] as const) {
      const html = card({ level });
      expect(count(html, 'aria-current="true"'), level).toBe(1);
      expect(count(html, "level-chip-check"), level).toBe(1);
      expect(count(html, "level-chip level-chip-lg"), level).toBe(4);
    }
  });

  it("has a keyboard-reachable button that controls the full scale, closed by default", () => {
    const html = card({});
    const id = /class="scale-toggle" aria-expanded="false" aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${id}" class="scale-panel" hidden=""`));
  });

  it("explains the level with the percentile thresholds and the under-5 rule", () => {
    expect(levelRange("normal", "October")).toContain("75th");
    expect(levelRange("elevated", "October")).toMatch(/75th.*90th/);
    expect(levelRange("high", "October")).toMatch(/90th.*97\.5th/);
    expect(levelRange("extreme", "October")).toContain("97.5th");
    expect(levelMeaning(levelStyle("normal"), 3, "October")).toContain("Fewer than 5");
    expect(levelMeaning(levelStyle("normal"), 40, "October")).toBe(levelRange("normal", "October"));
    expect(levelMeaning(displayLevel("normal", 0), 0, "October")).toContain("no level to rate");
    expect(displayLevel("normal", 0)).toBe(NO_DETECTIONS);
  });
});
