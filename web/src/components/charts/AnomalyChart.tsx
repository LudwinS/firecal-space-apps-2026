import type { EChartsOption } from "echarts";
import { useMemo } from "react";
import type { AnomalyResponse } from "../../api/types";
import { ANOMALY_ABOVE, ANOMALY_BELOW } from "../../lib/colors";
import { fmtCount, fmtMonthShort, fmtPct } from "../../lib/format";
import { levelStyle } from "../../lib/levels";
import { Chart } from "./Chart";
import { iconSvg } from "../icons/iconSvg";
import { AXIS_LINE, AXIS_TEXT, FONT, GRID_LINE, TOOLTIP_STYLE } from "./echarts";

/** Diverging bars: detections above (red) or below (blue) the median of the same month. */
export function AnomalyChart({ data }: { data: AnomalyResponse }) {
  const { option, label } = useMemo(() => {
    const pts = data.series;
    const cats = pts.map((p) => fmtMonthShort(p.month));
    const values = pts.map((p) => ({
      value: p.anomaly ?? 0,
      itemStyle: { color: (p.anomaly ?? 0) >= 0 ? ANOMALY_ABOVE : ANOMALY_BELOW },
    }));
    const startPct = pts.length > 120 ? 100 - (120 / pts.length) * 100 : 0;
    const above = pts.filter((p) => (p.anomaly ?? 0) > 0).length;
    const lbl = `Bar chart of monthly anomalies versus the median of the same month in ${data.reference_years[0]}–${data.reference_years[1]}. ${above} of ${pts.length} months were above the median.`;

    const opt: EChartsOption = {
      animation: false,
      textStyle: { fontFamily: FONT },
      grid: { left: 56, right: 16, top: 16, bottom: 64 },
      tooltip: {
        ...TOOLTIP_STYLE,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: "rgba(237, 232, 221, 0.06)" } },
        confine: true,
        formatter: ((params: { dataIndex: number }[]) => {
          const p = pts[params[0].dataIndex];
          const lv = levelStyle(p.level);
          return [
            `<strong>${fmtMonthShort(p.month)}</strong>`,
            `Detections: <strong>${fmtCount(p.value)}</strong>`,
            `Median (same month): ${fmtCount(p.median)}`,
            `Difference: ${p.anomaly === null ? "—" : (p.anomaly > 0 ? "+" : "") + fmtCount(p.anomaly)}`,
            `Ratio: ${p.ratio === null ? "—" : p.ratio.toFixed(2) + "×"}`,
            `Percentile: ${fmtPct(p.percentile)}`,
            `Level: ${iconSvg(lv.icon, 14, lv.accent)} ${lv.label}`,
          ].join("<br/>");
        }) as never,
      },
      xAxis: {
        type: "category",
        data: cats,
        axisLabel: { color: AXIS_TEXT, fontSize: 11 },
        axisLine: { lineStyle: { color: AXIS_LINE } },
        axisTick: { alignWithLabel: true, lineStyle: { color: AXIS_LINE } },
      },
      yAxis: {
        type: "value",
        name: "vs median",
        nameTextStyle: { color: AXIS_TEXT },
        axisLabel: { color: AXIS_TEXT },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      dataZoom: [
        { type: "inside", start: startPct, end: 100 },
        {
          type: "slider",
          start: startPct,
          end: 100,
          height: 22,
          bottom: 12,
          showDetail: false,
          borderColor: "#2C3B35",
          backgroundColor: "#0E1714",
          fillerColor: "rgba(255, 106, 43, 0.18)",
          dataBackground: { lineStyle: { color: "#4A5A53" }, areaStyle: { color: "#22322C" } },
          selectedDataBackground: { lineStyle: { color: "#FF7A3D" }, areaStyle: { color: "rgba(255, 122, 61, 0.25)" } },
          handleStyle: { color: "#F2D9A6", borderColor: "#F2D9A6" },
          moveHandleStyle: { color: "#2C3B35" },
          emphasis: { handleStyle: { color: "#FF6A2B", borderColor: "#FF6A2B" } },
        },
      ],
      series: [
        {
          type: "bar",
          data: values,
          barCategoryGap: "15%",
          itemStyle: { borderRadius: 2 },
          markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: AXIS_LINE, type: "solid" }, label: { show: false } },
        },
      ],
    };
    return { option: opt, label: lbl };
  }, [data]);

  return (
    <figure className="chart-figure">
      <Chart option={option} height={300} label={label} />
      <figcaption className="chart-legend">
        <span className="dot" style={{ background: ANOMALY_ABOVE }} aria-hidden="true" /> Above median
        <span className="dot" style={{ background: ANOMALY_BELOW }} aria-hidden="true" /> Below median
        <span className="muted">· Reference: {data.reference_years[0]}–{data.reference_years[1]} · drag the slider to change the window</span>
      </figcaption>
    </figure>
  );
}
