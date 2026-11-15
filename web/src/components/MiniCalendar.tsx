import { t } from "../i18n";
import type { CalendarResponse } from "../api/types";
import { cellColor, DARK_CELL_OUTLINE, NO_DATA_COLOR, needsOutline } from "../lib/colors";
import { fmtCount, monthShort } from "../lib/format";
import { gridMax } from "../lib/stats";
import { RampLegend } from "./RampLegend";

/** Lightweight HTML calendar (last N years) for the responder view; works well on phones. */
export function MiniCalendar({ calendar, lastYears = 10 }: { calendar: CalendarResponse; lastYears?: number }) {
  const n = calendar.years.length;
  const from = Math.max(0, n - lastYears);
  const years = calendar.years.slice(from);
  const rows = calendar.harmonized.slice(from);
  const max = gridMax(rows);
  return (
    <figure className="mini-cal">
      <figcaption className="mini-cal-head">
        <span className="heatmap-title">{t("Last {n} years, month by month", { n: years.length })}</span>
        <span className="mini-cal-sub">{t("Darker = more fire · harmonized detections")}</span>
      </figcaption>
      <div className="mini-cal-scroll">
        <table className="mini-cal-table">
          <caption className="sr-only">{t("Harmonized fire detections per month (VIIRS-equivalent)")}</caption>
          <colgroup>
            <col className="year-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t("Year")}</span>
              </th>
              {calendar.months.map((m, i) => (
                <th key={m} scope="col">
                  {monthShort(i).slice(0, 1)}
                  <span className="sr-only">{monthShort(i).slice(1)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {rows[i].map((v, m) => (
                  <td
                    key={m}
                    style={{
                      background: v === null ? NO_DATA_COLOR : cellColor(v, max),
                      boxShadow: needsOutline(v, max) ? `inset 0 0 0 1px ${DARK_CELL_OUTLINE}` : undefined,
                    }}
                    title={t("{month} {year}: {n} detections", { month: monthShort(m), year: y, n: fmtCount(v) })}
                  >
                    <span className="sr-only">{fmtCount(v)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RampLegend max={max} />
    </figure>
  );
}
