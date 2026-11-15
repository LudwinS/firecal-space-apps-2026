import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import { t, useLang } from "../../i18n";
import { SERIES_A, SERIES_B } from "../../lib/colors";
import { fmtCount, monthShort, monthsShort } from "../../lib/format";
import { Chart } from "./Chart";
import { AXIS_LINE, AXIS_TEXT, FONT, GRID_LINE, TOOLTIP_STYLE } from "./echarts";

interface Props {
  a: number[];
  b: number[];
  nameA: string;
  nameB: string;
}

/** Overlaid seasonal profiles (median detections per calendar month). */
export function SeasonalChart({ a, b, nameA, nameB }: Props) {
  const lang = useLang();
  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 56, right: 56, top: 40, bottom: 28 },
      legend: { top: 0, textStyle: { color: "#EDE8DD" }, inactiveColor: "#5C6B64" },
      tooltip: { ...TOOLTIP_STYLE, trigger: "axis", valueFormatter: (v) => fmtCount(v as number) },
      xAxis: { type: "category", data: monthsShort(), axisLabel: { color: AXIS_TEXT }, axisLine: { lineStyle: { color: AXIS_LINE } }, axisTick: { lineStyle: { color: AXIS_LINE } } },
      yAxis: [
        { type: "value", name: nameA.length > 18 ? "A" : nameA, nameTextStyle: { color: SERIES_A }, axisLabel: { color: AXIS_TEXT }, splitLine: { lineStyle: { color: GRID_LINE } } },
        { type: "value", name: nameB.length > 18 ? "B" : nameB, nameTextStyle: { color: SERIES_B }, axisLabel: { color: AXIS_TEXT }, splitLine: { show: false } },
      ],
      series: [
        { name: `A · ${nameA}`, type: "line", data: a, color: SERIES_A, symbol: "circle", symbolSize: 7, lineStyle: { width: 3 } },
        // B con línea discontinua y otro marcador: distinguible sin color.
        { name: `B · ${nameB}`, type: "line", yAxisIndex: 1, data: b, color: SERIES_B, symbol: "diamond", symbolSize: 9, lineStyle: { width: 3, type: "dashed" } },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, b, nameA, nameB, lang],
  );
  const peakA = monthShort(a.indexOf(Math.max(...a)));
  const peakB = monthShort(b.indexOf(Math.max(...b)));
  return (
    <Chart
      option={option}
      height={300}
      label={t("Seasonal profile: median detections per month. Area A peaks in {a}, area B peaks in {b}. Each area uses its own vertical axis.", { a: peakA, b: peakB })}
    />
  );
}
