import { t } from "../i18n";
import { useId, useState, type CSSProperties } from "react";
import type { AlertLevel, StatusResponse } from "../api/types";
import { fmtCount, fmtMonthLong, fullMonthName, monthLong } from "../lib/format";
import { statusMessage } from "../lib/statusMessage";
import { LEVEL_ORDER, NO_DETECTIONS, displayLevel, levelStyle, type LevelStyle } from "../lib/levels";
import { InfoTip } from "./InfoTip";
import { Icon } from "./icons/Icon";

/** Below this many detections a month is always Normal (same rule as the API and the note in ResponderView). */
export const MIN_RATED_DETECTIONS = 5;

/** Percentile band of each level, as one plain sentence about past months with the same name. */
export function levelRange(level: AlertLevel, month: string): string {
  switch (level) {
    case "normal":
      return t("Below the 75th percentile of past {month} months: no unusual burning.", { month });
    case "elevated":
      return t("Between the 75th and 90th percentile of past {month} months: more burning than usual.", { month });
    case "high":
      return t("Between the 90th and 97.5th percentile of past {month} months: well above usual.", { month });
    case "extreme":
      return t("Above the 97.5th percentile of past {month} months: among the highest on record.", { month });
    default:
      return t("Not enough past years to compare this month.");
  }
}

/** "What does this mean?" for the level actually shown (zero detections and tiny counts have their own wording). */
export function levelMeaning(shown: LevelStyle, value: number | null | undefined, month: string): string {
  if (shown === NO_DETECTIONS) return t("No fire was detected, so there is no level to rate.");
  if (shown.level === "normal" && typeof value === "number" && value > 0 && value < MIN_RATED_DETECTIONS) {
    return t("Fewer than 5 detections: too few to rate against past years, so it counts as Normal.");
  }
  return levelRange(shown.level, month);
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Big traffic-light card for responders: level is shown with color + icon + text. */
export function StatusCard({ status, areaName }: { status: StatusResponse; areaName: string }) {
  const scaleId = useId();
  const [scaleOpen, setScaleOpen] = useState(false);
  const lv = displayLevel(status.level, status.value);
  const month = monthLong(Number(status.month.split("-")[1] || 1) - 1);
  // Sin detecciones (ni ahora ni lo típico), el mes pico y el año más activo no significan nada.
  const empty = !status.value && !status.median;
  // Colores del nivel como variables CSS: el resto del estilo vive en styles.css.
  const vars = {
    "--card-bg": lv.card.bg,
    "--card-border": lv.card.border,
    "--card-kicker": lv.card.kicker,
    "--card-title": lv.card.title,
    "--card-text": lv.card.text,
    "--tile-bg": lv.bg,
    "--tile-fg": lv.fg,
  } as CSSProperties;
  return (
    <div className="status-block">
      <section className={`status-card level-${lv.level}`} style={vars} aria-labelledby="status-heading" aria-live="polite">
        <span className="status-icon" aria-hidden="true">
          <Icon name={lv.icon} size={48} strokeWidth={2} />
        </span>
        <div className="status-main">
          <p className="status-kicker">
            {areaName} · {fmtMonthLong(status.month)}
          </p>
          <div className="status-level-row">
            <h2 id="status-heading" className="status-level">
              {t(lv.label)}
              <span className="sr-only"> {t("burning activity level")}</span>
            </h2>
            <button
              type="button"
              className="scale-toggle"
              aria-expanded={scaleOpen}
              aria-controls={scaleId}
              aria-label={scaleOpen ? t("Hide the full alert scale") : t("Show the full alert scale")}
              onClick={() => setScaleOpen((o) => !o)}
            >
              <span aria-hidden="true">i</span>
            </button>
          </div>
          <p className="status-message">{statusMessage(status)}</p>
          <p className="status-desc">{t(lv.description)}</p>
        </div>
        <aside className="level-meaning">
          <h3 className="level-meaning-title">{t("What does this mean?")}</h3>
          <p className="level-meaning-text">{levelMeaning(lv, status.value, month)}</p>
        </aside>
        <ol className="level-scale" aria-label={t("Alert scale")}>
          {LEVEL_ORDER.map((l) => {
            const s = levelStyle(l);
            const active = l === lv.level;
            // Inactiva: tinte suave del color del nivel + su ícono. Activa: relleno sólido, borde grueso y check.
            const style: CSSProperties = active
              ? { background: s.bg, color: s.fg, borderColor: s.fg }
              : { background: hexAlpha(s.accent, 0.16), borderColor: hexAlpha(s.accent, 0.55) };
            return (
              <li key={l} className={active ? "level-chip level-chip-lg active" : "level-chip level-chip-lg"} aria-current={active ? "true" : undefined} style={style}>
                <span className="level-chip-icon" style={active ? undefined : { color: s.accent }}>
                  <Icon name={s.icon} size={18} strokeWidth={2} />
                </span>
                {t(s.label)}
                {active && (
                  <>
                    <svg className="level-chip-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="sr-only"> ({t("current level")})</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <div id={scaleId} className="scale-panel" hidden={!scaleOpen}>
          <h3 className="scale-panel-title">{t("How the alert scale works")}</h3>
          <p className="scale-panel-text">{t("Each month is compared with the same month in past years. The percentile says how many of those past months had fewer detections.")}</p>
          <dl className="scale-rows">
            {LEVEL_ORDER.map((l) => {
              const s = levelStyle(l);
              return (
                <div key={l} className="scale-row">
                  <dt>
                    <span className="scale-swatch" style={{ background: s.bg, color: s.fg }}>
                      <Icon name={s.icon} size={16} strokeWidth={2} />
                    </span>
                    {t(s.label)}
                  </dt>
                  <dd>{levelRange(l, month)}</dd>
                </div>
              );
            })}
          </dl>
          <p className="scale-panel-text">{t("Months with 1–4 detections are always Normal, and months with none show No detections instead of a level.")}</p>
        </div>
      </section>
      <dl className="stat-tiles">
        <div className="stat-tile">
          <dt>{t("Detections this month")}</dt>
          <dd>
            <span className="stat-value stat-mono">{fmtCount(status.value)}</span>
            <span className="stat-note">
              {t("Typical: {n}", { n: fmtCount(status.median) })}{" "}
              <InfoTip term={t("Typical")} text={t("The middle value for this month in past years: half of them had more detections and half had fewer.")} />
            </span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>
            {t("Peak month of the year")} <InfoTip term={t("Peak month of the year")} text={t("The month that usually has the most fire detections in this area.")} />
          </dt>
          <dd>
            <span className="stat-value">{empty ? "—" : fullMonthName(status.peak_month)}</span>
            <span className="stat-note">{t("Highest median month")}</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>
            {t("Most active year")}{" "}
            <InfoTip term={t("Most active year")} align="end" text={t("The year with the most fire detections in the period you selected.")} />
          </dt>
          <dd>
            <span className="stat-value">{empty ? "—" : status.most_active_year}</span>
            <span className="stat-note">
              {t("Harmonized, selected period")}{" "}
              <InfoTip term={t("Harmonized")} align="end" text={t("Counts from both satellite sensors put on one scale, so years before and after 2012 can be compared.")} />
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
