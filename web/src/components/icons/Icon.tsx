import { createElement, useId } from "react";
import { ICON_DATA, type IconName } from "./iconData";

export interface IconProps {
  /** Lado en px (el viewBox es 24×24). */
  size?: number;
  /** Texto accesible. Sin title el ícono es decorativo (aria-hidden). */
  title?: string;
  className?: string;
  strokeWidth?: number;
}

/** Ícono propio de FireCal por nombre; hereda el color del texto (currentColor). */
export function Icon({ name, size = 20, title, className, strokeWidth = 1.75 }: IconProps & { name: IconName }) {
  const titleId = useId();
  const label = title ? { role: "img", "aria-labelledby": titleId } : { "aria-hidden": true as const, focusable: "false" as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : "icon"}
      {...label}
    >
      {title && <title id={titleId}>{title}</title>}
      {ICON_DATA[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

const make = (name: IconName) => {
  const C = (p: IconProps) => <Icon name={name} {...p} />;
  C.displayName = `Icon(${name})`;
  return C;
};

// Un componente por ícono (los 20 del sistema de marca).
export const HotspotIcon = make("hotspot");
export const SatelliteIcon = make("satellite");
export const CalendarIcon = make("calendar");
export const DrawAreaIcon = make("draw-area");
export const CoordinatesIcon = make("coordinates");
export const HarmonizeIcon = make("harmonize");
export const AnomalyIcon = make("anomaly");
export const CompareIcon = make("compare");
export const HistoryIcon = make("history");
export const VolcanoIcon = make("volcano");
export const LevelNormalIcon = make("level-normal");
export const LevelElevatedIcon = make("level-elevated");
export const LevelHighIcon = make("level-high");
export const LevelExtremeIcon = make("level-extreme");
export const ValidationIcon = make("validation");
export const CsvIcon = make("csv");
export const ReportIcon = make("report");
export const DownloadIcon = make("download");
export const WakingIcon = make("waking");
export const LayersIcon = make("layers");
