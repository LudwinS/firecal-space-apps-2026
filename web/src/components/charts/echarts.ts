// ECharts con tree-shaking: solo lo que usamos.
import { BarChart, HeatmapChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  HeatmapChart,
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  DataZoomComponent,
  LegendComponent,
  MarkLineComponent,
  AriaComponent,
  CanvasRenderer,
]);

export { echarts };

// Colores del tema oscuro "Ember & Night" para ejes, rejilla y tooltips.
export const FONT = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const AXIS_TEXT = "#B9B3A6";
export const AXIS_LINE = "#4A5A53";
export const GRID_LINE = "#22322C";
export const MUTED_TEXT = "#B9B3A6";

/** Tooltip con fondo Night, borde del tema y texto Ash. */
export const TOOLTIP_STYLE = {
  backgroundColor: "#0E1714",
  borderColor: "#2C3B35",
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: "#EDE8DD", fontFamily: FONT, fontSize: 13 },
  extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.45);",
};
