import { t } from "../i18n";
import type { MonthDetailData } from "../lib/monthDetail";
import { fmtCount, fmtMonthLong, monthLong } from "../lib/format";
import { levelStyle } from "../lib/levels";
import { Icon } from "./icons/Icon";

/** Posición del mes frente al mismo mes de otros años, dicha en el sentido que se entiende mejor. */
export function rankText(percentile: number, name: string): string {
  const p = Math.round(percentile);
  if (p >= 100) return t("The highest {month} in the reference period.", { month: name });
  if (p <= 0) return t("The lowest {month} in the reference period.", { month: name });
  if (p >= 50) return t("Higher than {p}% of past {month} months in the reference period.", { p, month: name });
  return t("Lower than {p}% of past {month} months in the reference period.", { p: 100 - p, month: name });
}

/** Detalle de un mes elegido en el calendario: valor, lo típico para ese mes y su nivel de alerta. */
export function MonthDetail({ detail }: { detail: MonthDetailData | null }) {
  if (!detail) {
    return (
      <div className="month-detail month-detail-empty" aria-live="polite">
        <p className="help">{t("Click or tap any month in the calendar to see its details here.")}</p>
      </div>
    );
  }
  const name = monthLong(detail.month);
  const when = fmtMonthLong(detail.iso);
  const title = when.charAt(0).toUpperCase() + when.slice(1);
  const lv = levelStyle(detail.level);
  const hasValue = detail.harmonized !== null;
  const showRange = detail.estimated && detail.lo !== null && detail.hi !== null && (detail.lo !== detail.harmonized || detail.hi !== detail.harmonized);
  let comparison: string;
  if (!hasValue) comparison = t("No data for this month yet.");
  else if (detail.median === null || detail.percentile === null) comparison = t("Not enough history to compare this month.");
  else {
    const ratio =
      detail.median > 0 && detail.ratio !== null
        ? t("{r}× the usual for {month}", { r: detail.ratio.toFixed(1), month: name })
        : t("The usual for {month} is {n}", { month: name, n: fmtCount(detail.median) });
    comparison = `${ratio}. ${rankText(detail.percentile, name)}`;
  }

  return (
    <section className="month-detail" aria-live="polite" aria-label={t("Details for {month}", { month: when })}>
      <div className="month-detail-head">
        <h3 className="month-detail-title">{title}</h3>
        {hasValue && detail.median !== null && (
          <span className="level-chip active" style={{ background: lv.bg, color: lv.fg, borderColor: lv.bg }}>
            <Icon name={lv.icon} size={14} strokeWidth={2} /> {t(lv.label)}
          </span>
        )}
      </div>
      <p className="month-detail-value">
        <span className="stat-mono">{fmtCount(detail.harmonized)}</span> {t("fire detections")}
        {showRange && (
          <span className="month-detail-range">
            {" "}
            {t("(likely {lo}–{hi})", { lo: fmtCount(detail.lo), hi: fmtCount(detail.hi) })}
          </span>
        )}
      </p>
      <p className="month-detail-text">{comparison}</p>
      {hasValue && detail.median !== null && <p className="note">{t(lv.description)}</p>}
      <dl className="month-detail-grid">
        <div>
          <dt>{t("Typical {month}", { month: name })}</dt>
          <dd>{fmtCount(detail.median)}</dd>
        </div>
        <div>
          <dt>{t("Seen by MODIS (1 km)")}</dt>
          <dd>{fmtCount(detail.rawModis)}</dd>
        </div>
        <div>
          <dt>{t("Seen by VIIRS (375 m)")}</dt>
          <dd>{detail.rawViirs === null ? (detail.year < 2012 ? t("not in orbit yet") : "—") : fmtCount(detail.rawViirs)}</dd>
        </div>
      </dl>
      {detail.estimated && hasValue && (
        <p className="note">
          <Icon name="history" size={14} /> {t("Estimated from MODIS: VIIRS did not exist yet, so this value is converted to what VIIRS would have seen.")}
        </p>
      )}
    </section>
  );
}
