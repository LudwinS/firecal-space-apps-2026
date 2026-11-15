import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import type { CalendarResponse } from "../../api/types";
import { colorBucket, DARK_CELL_OUTLINE, heatmapPieces, needsOutline, THEME } from "../../lib/colors";
import { t, useLang } from "../../i18n";
import { fmtCount, monthShort, monthsShort } from "../../lib/format";
import { gridMax } from "../../lib/stats";
import { RampLegend } from "../RampLegend";
import { Chart } from "./Chart";
import { AXIS_TEXT, FONT, MONO, MUTED_TEXT, TOOLTIP_STYLE } from "./echarts";

export type CalendarVariable = "harmonized" | "modis" | "viirs";

export const VARIABLE_LABEL: Record<CalendarVariable, string> = {
  harmonized: "Harmonized (VIIRS-equivalent)",
  modis: "Raw MODIS",
  viirs: "Raw VIIRS",
};

export function gridFor(cal: CalendarResponse, variable: CalendarVariable): (number | null)[][] {
  if (variable === "modis") return cal.raw_modis;
  if (variable === "viirs") return cal.raw_viirs;
  return cal.harmonized;
}

interface Props {
  calendar: CalendarResponse;
  variable?: CalendarVariable;
  /** Shared color max (e.g. to compare two areas on the same scale). */
  max?: number;
  compact?: boolean;
  title?: string;
}

export function CalendarHeatmap({ calendar, variable = "harmonized", max, compact = false, title }: Props) {
  const lang = useLang();
  const grid = gridFor(calendar, variable);
  const colorMax = max ?? gridMax(grid);

  const { option, summary } = useMemo(() => {
    // Las celdas más oscuras de la rampa se pierden sobre el panel: llevan un contorno sutil.
    const data: { value: [number, number, number, number]; itemStyle?: { borderColor: string; borderWidth: number } }[] = [];
    let peak = { v: -1, y: 0, m: 0 };
    calendar.years.forEach((year, yi) => {
      grid[yi].forEach((v, m) => {
        const value: [number, number, number, number] = [m, yi, v ?? 0, colorBucket(v, colorMax)];
        data.push(needsOutline(v, colorMax) ? { value, itemStyle: { borderColor: DARK_CELL_OUTLINE, borderWidth: 1 } } : { value });
        if (v !== null && v > peak.v) peak = { v, y: year, m };
      });
    });

    const tooltip = (p: { value: [number, number, number, number] }) => {
      const [m, yi] = p.value;
      const y = calendar.years[yi];
      const h = calendar.harmonized[yi][m];
      const lo = calendar.harmonized_lo[yi][m];
      const hi = calendar.harmonized_hi[yi][m];
      const mo = calendar.raw_modis[yi][m];
      const vi = calendar.raw_viirs[yi][m];
      const range = lo !== null && hi !== null && (lo !== h || hi !== h) ? ` <span style="color:${MUTED_TEXT}">(${fmtCount(lo)}–${fmtCount(hi)})</span>` : "";
      return [
        `<strong>${monthShort(m)} ${y}</strong>`,
        `${t("Harmonized")}: <strong>${fmtCount(h)}</strong>${range}`,
        `${t("Raw MODIS")}: ${fmtCount(mo)}`,
        `${t("Raw VIIRS")}: ${vi === null ? t("not available (before 2012)") : fmtCount(vi)}`,
      ].join("<br/>");
    };

    const opt: EChartsOption = {
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 44, right: 8, top: compact ? 22 : 26, bottom: 6, containLabel: false },
      tooltip: { ...TOOLTIP_STYLE, trigger: "item", confine: true, formatter: tooltip as never },
      xAxis: {
        type: "category",
        data: monthsShort(),
        position: "top",
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 11, interval: 0, formatter: compact ? (v: string) => v.slice(0, 1) : undefined },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: calendar.years.map(String),
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        // Años previos a VIIRS (MODIS convertido) en Sand; años con VIIRS observado en blanco.
        axisLabel: {
          fontFamily: MONO,
          fontSize: 11,
          interval: compact && calendar.years.length > 15 ? 1 : 0,
          color: (variable === "harmonized" ? (v: string) => (Number(v) < 2012 ? THEME.sand : "#FFFFFF") : AXIS_TEXT) as never,
        },
      },
      // ECharts exige visualMap en heatmaps: mapeamos el "bucket" de color (dim 3), oculto; la leyenda es HTML.
      visualMap: { show: false, type: "piecewise", dimension: 3, seriesIndex: 0, pieces: heatmapPieces() },
      series: [
        {
          type: "heatmap",
          data,
          itemStyle: { borderColor: THEME.forest, borderWidth: 1.5, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: THEME.ember, borderWidth: 2 } },
        },
      ],
    };
    const s =
      peak.v >= 0
        ? t("Calendar heatmap of {what} fire detections per month, {from} to {to}. Highest month: {month} {year} with {n} detections.", {
            what: t(VARIABLE_LABEL[variable]).toLowerCase(),
            from: calendar.years[0],
            to: calendar.years[calendar.years.length - 1],
            month: monthShort(peak.m),
            year: peak.y,
            n: fmtCount(peak.v),
          })
        : t("Calendar heatmap with no data.");
    return { option: opt, summary: s };
    // `lang`: los textos del gráfico se traducen al construir la opción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, grid, colorMax, compact, variable, lang]);

  const rowH = compact ? 13 : 17;
  const height = Math.max(160, calendar.years.length * rowH + 40);
  return (
    <figure className="heatmap">
      {title && <figcaption className="heatmap-title">{title}</figcaption>}
      <Chart option={option} height={height} label={summary} />
      <RampLegend max={colorMax} />
      {variable === "harmonized" && (
        <p className="legend-note years-note">
          <span className="swatch-text sand">{t("Years in sand")}</span> = {t("MODIS converted to VIIRS-equivalent")} ·{" "}
          <span className="swatch-text white">{t("white")}</span> = {t("VIIRS observed")}
        </p>
      )}
    </figure>
  );
}
