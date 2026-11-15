import type { MonthDetailData } from "../lib/monthDetail";
import { fmtCount } from "../lib/format";
import { levelStyle } from "../lib/levels";
import { Icon } from "./icons/Icon";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Posición del mes frente al mismo mes de otros años, dicha en el sentido que se entiende mejor. */
export function rankText(percentile: number, name: string): string {
  const p = Math.round(percentile);
  if (p >= 100) return `The highest ${name} in the reference period.`;
  if (p <= 0) return `The lowest ${name} in the reference period.`;
  if (p >= 50) return `Higher than ${p}% of past ${name} months in the reference period.`;
  return `Lower than ${100 - p}% of past ${name} months in the reference period.`;
}

/** Detalle de un mes elegido en el calendario: valor, lo típico para ese mes y su nivel de alerta. */
export function MonthDetail({ detail }: { detail: MonthDetailData | null }) {
  if (!detail) {
    return (
      <div className="month-detail month-detail-empty" aria-live="polite">
        <p className="help">Click or tap any month in the calendar to see its details here.</p>
      </div>
    );
  }
  const name = MONTH_NAMES[detail.month];
  const lv = levelStyle(detail.level);
  const hasValue = detail.harmonized !== null;
  const showRange = detail.estimated && detail.lo !== null && detail.hi !== null && (detail.lo !== detail.harmonized || detail.hi !== detail.harmonized);
  let comparison: string;
  if (!hasValue) comparison = "No data for this month yet.";
  else if (detail.median === null || detail.percentile === null) comparison = "Not enough history to compare this month.";
  else {
    const ratio = detail.median > 0 && detail.ratio !== null ? `${detail.ratio.toFixed(1)}× the usual for ${name}` : `The usual for ${name} is ${fmtCount(detail.median)}`;
    comparison = `${ratio}. ${rankText(detail.percentile, name)}`;
  }

  return (
    <section className="month-detail" aria-live="polite" aria-label={`Details for ${name} ${detail.year}`}>
      <div className="month-detail-head">
        <h3 className="month-detail-title">
          {name} {detail.year}
        </h3>
        {hasValue && detail.median !== null && (
          <span className="level-chip active" style={{ background: lv.bg, color: lv.fg, borderColor: lv.bg }}>
            <Icon name={lv.icon} size={14} strokeWidth={2} /> {lv.label}
          </span>
        )}
      </div>
      <p className="month-detail-value">
        <span className="stat-mono">{fmtCount(detail.harmonized)}</span> fire detections
        {showRange && (
          <span className="month-detail-range">
            {" "}
            (likely {fmtCount(detail.lo)}–{fmtCount(detail.hi)})
          </span>
        )}
      </p>
      <p className="month-detail-text">{comparison}</p>
      {hasValue && detail.median !== null && <p className="note">{lv.description}</p>}
      <dl className="month-detail-grid">
        <div>
          <dt>Typical {name}</dt>
          <dd>{fmtCount(detail.median)}</dd>
        </div>
        <div>
          <dt>Seen by MODIS (1 km)</dt>
          <dd>{fmtCount(detail.rawModis)}</dd>
        </div>
        <div>
          <dt>Seen by VIIRS (375 m)</dt>
          <dd>{detail.rawViirs === null ? (detail.year < 2012 ? "not in orbit yet" : "—") : fmtCount(detail.rawViirs)}</dd>
        </div>
      </dl>
      {detail.estimated && hasValue && (
        <p className="note">
          <Icon name="history" size={14} /> Estimated from MODIS: VIIRS did not exist yet, so this value is converted to what VIIRS would have seen.
        </p>
      )}
    </section>
  );
}
