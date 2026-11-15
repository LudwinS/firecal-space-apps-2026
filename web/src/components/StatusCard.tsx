import type { CSSProperties } from "react";
import type { StatusResponse } from "../api/types";
import { fmtCount, fmtMonthLong, fullMonthName } from "../lib/format";
import { LEVEL_ORDER, levelStyle } from "../lib/levels";
import { Icon } from "./icons/Icon";

/** Big traffic-light card for responders: level is shown with color + icon + text. */
export function StatusCard({ status, areaName }: { status: StatusResponse; areaName: string }) {
  const lv = levelStyle(status.level);
  // Sin detecciones, el mes pico y el año más activo no significan nada.
  const empty = status.level === "no_data" && !status.value;
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
            {lv.label}
            <span className="sr-only"> burning activity level</span>
          </h2>
          <p className="status-message">{status.message}</p>
          <p className="status-desc">{lv.description}</p>
        </div>
        <ol className="level-scale" aria-label="Alert scale">
          {LEVEL_ORDER.map((l) => {
            const s = levelStyle(l);
            const active = l === status.level;
            return (
              <li
                key={l}
                className={active ? "level-chip active" : "level-chip"}
                aria-current={active ? "true" : undefined}
                style={active ? { background: s.bg, color: s.fg, borderColor: s.bg } : undefined}
              >
                <Icon name={s.icon} size={14} strokeWidth={2} /> {s.label}
              </li>
            );
          })}
        </ol>
      </section>
      <dl className="stat-tiles">
        <div className="stat-tile">
          <dt>Detections this month</dt>
          <dd>
            <span className="stat-value stat-mono">{fmtCount(status.value)}</span>
            <span className="stat-note">Typical: {fmtCount(status.median)}</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>Peak month of the year</dt>
          <dd>
            <span className="stat-value">{empty ? "—" : fullMonthName(status.peak_month)}</span>
            <span className="stat-note">Highest median month</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>Most active year</dt>
          <dd>
            <span className="stat-value">{empty ? "—" : status.most_active_year}</span>
            <span className="stat-note">Harmonized, selected period</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
