import type { AlertLevel } from "../api/types";
import type { IconName } from "../components/icons/iconData";

export interface LevelStyle {
  level: AlertLevel;
  label: string;
  /** Own icon shown next to the label so meaning never depends on color alone. */
  icon: IconName;
  /** Chip / icon tile background (light-to-dark by severity, so it reads in grayscale too). */
  bg: string;
  /** Text and icon color on `bg` (>= 4.5:1). */
  fg: string;
  /** Icon / line color on the dark theme (>= 3:1 against Night, as a graphic). */
  accent: string;
  /** Big status card on the dark theme. */
  card: { bg: string; border: string; kicker: string; title: string; text: string };
  description: string;
}

export const LEVELS: Record<AlertLevel, LevelStyle> = {
  normal: {
    level: "normal",
    label: "Normal",
    icon: "level-normal",
    bg: "#DCEBF7",
    fg: "#0B3A5E",
    accent: "#4F9BE0",
    card: { bg: "#10273A", border: "#23557F", kicker: "#A9CDEE", title: "#FFFFFF", text: "#DCEBF7" },
    description: "Activity is within the usual range for this month.",
  },
  elevated: {
    level: "elevated",
    label: "Elevated",
    icon: "level-elevated",
    bg: "#FBE3A8",
    fg: "#5A3B00",
    accent: "#F2C35E",
    card: { bg: "#2A2110", border: "#7A5C17", kicker: "#F2D9A6", title: "#FFFFFF", text: "#FBE3A8" },
    description: "Above the typical level for this month. Stay alert.",
  },
  high: {
    level: "high",
    label: "High",
    icon: "level-high",
    bg: "#E2632B",
    fg: "#1A0700",
    accent: "#FF7A3D",
    card: { bg: "#2E150B", border: "#A8461C", kicker: "#FFB37A", title: "#FFFFFF", text: "#FFD7B3" },
    description: "Well above normal for this month. Prepare resources.",
  },
  extreme: {
    level: "extreme",
    label: "Extreme",
    icon: "level-extreme",
    bg: "#6E1F35",
    fg: "#FFE9EE",
    accent: "#F28AA5",
    card: { bg: "#2A0D18", border: "#8A2B47", kicker: "#F5B3C4", title: "#FFFFFF", text: "#FFE9EE" },
    description: "Among the highest ever recorded for this month.",
  },
  no_data: {
    level: "no_data",
    label: "No data",
    icon: "history",
    bg: "#2C3B35",
    fg: "#EDE8DD",
    accent: "#B9B3A6",
    card: { bg: "#17241F", border: "#2C3B35", kicker: "#B9B3A6", title: "#EDE8DD", text: "#D9D3C6" },
    description: "Not enough detections to compare against history.",
  },
};

export const LEVEL_ORDER: AlertLevel[] = ["normal", "elevated", "high", "extreme"];

export function levelStyle(level: AlertLevel | null | undefined): LevelStyle {
  return LEVELS[level ?? "no_data"] ?? LEVELS.no_data;
}

/**
 * Cero detecciones no es "Normal": no hay actividad que calificar (mar, ciudad, mes sin fuego).
 * Estilo neutro, fuera de la escala de alerta (ninguna ficha queda activa).
 */
export const NO_DETECTIONS: LevelStyle = {
  ...LEVELS.no_data,
  label: "No detections",
  description: "No fire was detected here in this month, so there is no activity level to rate.",
};

/** Estilo que se muestra para un nivel y su valor: cero detecciones se distingue de "Normal". */
export function displayLevel(level: AlertLevel | null | undefined, value: number | null | undefined): LevelStyle {
  if (value === 0) return NO_DETECTIONS;
  return levelStyle(level);
}

/**
 * Same thresholds the mock uses (the API decides its own level; this is only a fallback).
 * percentile is 0-100 vs the same calendar month in the reference period.
 */
export function levelFromStats(value: number, median: number | null, percentile: number | null): AlertLevel {
  if (median === null || percentile === null) return "no_data";
  if (value <= 0 && median <= 0) return "normal";
  if (percentile >= 97.5) return "extreme";
  if (percentile >= 90) return "high";
  if (percentile >= 75) return "elevated";
  return "normal";
}
