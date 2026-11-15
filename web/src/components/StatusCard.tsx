import { t } from "../i18n";
import type { CSSProperties } from "react";
import type { StatusResponse } from "../api/types";
import { fmtCount, fmtMonthLong, fullMonthName } from "../lib/format";
import { statusMessage } from "../lib/statusMessage";
import { LEVEL_ORDER, displayLevel, levelStyle } from "../lib/levels";
import { Icon } from "./icons/Icon";

/** Big traffic-light card for responders: level is shown with color + icon + text. */
export function StatusCard({ status, areaName }: { status: StatusResponse; areaName: string }) {
  const lv = displayLevel(status.level, status.value);
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
          <h2 id="status-heading" className="status-level">
            {t(lv.label)}
            <span className="sr-only"> {t("burning activity level")}</span>
          </h2>
          <p className="status-message">{statusMessage(status)}</p>
          <p className="status-desc">{t(lv.description)}</p>
        </div>
        <ol className="level-scale" aria-label={t("Alert scale")}>
          {LEVEL_ORDER.map((l) => {
            const s = levelStyle(l);
            const active = l === lv.level;
            return (
              <li
                key={l}
                className={active ? "level-chip active" : "level-chip"}
                aria-current={active ? "true" : undefined}
                style={active ? { background: s.bg, color: s.fg, borderColor: s.bg } : undefined}
              >
                <Icon name={s.icon} size={14} strokeWidth={2} /> {t(s.label)}
              </li>
            );
          })}
        </ol>
      </section>
      <dl className="stat-tiles">
        <div className="stat-tile">
          <dt>{t("Detections this month")}</dt>
          <dd>
            <span className="stat-value stat-mono">{fmtCount(status.value)}</span>
            <span className="stat-note">{t("Typical: {n}", { n: fmtCount(status.median) })}</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>{t("Peak month of the year")}</dt>
          <dd>
            <span className="stat-value">{empty ? "—" : fullMonthName(status.peak_month)}</span>
            <span className="stat-note">{t("Highest median month")}</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>{t("Most active year")}</dt>
          <dd>
            <span className="stat-value">{empty ? "—" : status.most_active_year}</span>
            <span className="stat-note">{t("Harmonized, selected period")}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
