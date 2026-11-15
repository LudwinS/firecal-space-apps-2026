import { afterEach, describe, expect, it } from "vitest";
import { buildArea, coverageBox, DEFAULT_AREA, outsideCoverage } from "../api/requests";
import { fmtMonthLong, fullMonthName, monthShort } from "../lib/format";
import { statusMessage } from "../lib/statusMessage";
import { ES } from "./es";
import { getLang, setLang, t } from "./index";

afterEach(() => setLang("en"));

// Código fuente de la app como texto (sin tests ni el propio diccionario).
const SOURCES = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.ts", "!../i18n/**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(",");

describe("i18n", () => {
  it("defaults to English and returns the text unchanged", () => {
    expect(getLang()).toBe("en");
    expect(t("Download PDF report")).toBe("Download PDF report");
    expect(t("Typical: {n}", { n: 12 })).toBe("Typical: 12");
  });

  it("translates to Spanish, fills placeholders and falls back to English", () => {
    setLang("es");
    expect(t("Download PDF report")).toBe("Descargar informe PDF");
    expect(t("Last {n} years, month by month", { n: 10 })).toBe("Últimos 10 años, mes a mes");
    expect(t("Guatemala")).toBe("Guatemala");
    expect(t("Belize")).toBe("Belice");
  });

  it("has a Spanish text for every literal t(\"…\") in the source", () => {
    const missing = new Set<string>();
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    for (const src of Object.values(SOURCES)) {
      for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        const key = JSON.parse(`"${m[1]}"`) as string;
        if (!(key in ES)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("keeps the same placeholders in every translation", () => {
    for (const [en, es] of Object.entries(ES)) {
      expect(es.trim(), en).not.toBe("");
      expect(placeholders(es), en).toBe(placeholders(en));
    }
  });

  it("localizes months, validation errors and the status sentence", () => {
    const status = { month: "2025-12-01", value: 50, median: 143, level: "normal" as const, message: "December 2025 (data through Dec 25): 0.3× the usual", peak_month: "Mar", most_active_year: 2015 };
    expect(statusMessage(status)).toBe(status.message);
    expect(fmtMonthLong("2025-03-01")).toBe("March 2025");
    setLang("es");
    expect(monthShort(0)).toBe("Ene");
    expect(fmtMonthLong("2025-03-01")).toBe("marzo de 2025");
    expect(fullMonthName("Mar")).toBe("Marzo");
    const r = buildArea({ ...DEFAULT_AREA, mode: "draw", drawn: null });
    expect(!r.ok && r.error).toBe("Dibuja un rectángulo o un polígono en el mapa.");
    expect(statusMessage(status)).toBe("Diciembre de 2025 (datos hasta el 25 de diciembre): 0.3× lo habitual para diciembre (50 frente a 143 detecciones típicas) — NORMAL");
  });
});

describe("coverage", () => {
  const box = coverageBox([{ bbox: [-90, 13, -87, 15] }, { bbox: [-84, 8, -77, 10] }], 0)!;

  it("is the union of the country boxes", () => {
    expect(box).toEqual([-90, 8, -77, 15]);
    expect(coverageBox([])).toBeNull();
  });

  it("flags areas with no overlap and accepts the rest", () => {
    expect(outsideCoverage({ point: [40.4, -3.7, 25] }, box)).toBe(true);
    expect(outsideCoverage({ point: [13.7, -89.2, 25] }, box)).toBe(false);
    expect(outsideCoverage({ bbox: [10, 40, 12, 42] }, box)).toBe(true);
    expect(outsideCoverage({ bbox: [-95, 12, -89, 14] }, box)).toBe(false);
    expect(outsideCoverage({ polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }, box)).toBe(true);
    expect(outsideCoverage({ country: "Atlantis" }, box)).toBe(false);
  });
});
