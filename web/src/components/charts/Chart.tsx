import ReactEChartsCore from "echarts-for-react/esm/core";
import type { EChartsOption } from "echarts";
import { echarts } from "./echarts";

interface Props {
  option: EChartsOption;
  height: number | string;
  /** Text alternative for screen readers (the canvas itself is not readable). */
  label: string;
  className?: string;
  /** Eventos de ECharts, p. ej. { click: fn }. */
  onEvents?: Record<string, (params: unknown) => void>;
}

export function Chart({ option, height, label, className, onEvents }: Props) {
  return (
    <div role="img" aria-label={label} className={className}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
      />
    </div>
  );
}
