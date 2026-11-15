import type { CalendarResponse } from "../api/types";
import { cellColor, DARK_CELL_OUTLINE, NO_DATA_COLOR, needsOutline } from "../lib/colors";
import { fmtCount } from "../lib/format";
import type { MonthPick } from "../lib/monthDetail";
import { gridMax } from "../lib/stats";
import { RampLegend } from "./RampLegend";

/** Lightweight HTML calendar (last N years) for the responder view; works well on phones. */
interface Props {
  calendar: CalendarResponse;
  lastYears?: number;
  /** Mes resaltado (índices globales del calendario). */
  selected?: MonthPick | null;
  /** Si se da, cada celda es un botón que elige ese mes. */
  onSelect?: (pick: MonthPick) => void;
}

export function MiniCalendar({ calendar, lastYears = 10, selected = null, onSelect }: Props) {
  const n = calendar.years.length;
  const from = Math.max(0, n - lastYears);
  const years = calendar.years.slice(from);
  const rows = calendar.harmonized.slice(from);
  const max = gridMax(rows);
  return (
    <figure className="mini-cal">
      <figcaption className="mini-cal-head">
        <span className="heatmap-title">Last {years.length} years, month by month</span>
        <span className="mini-cal-sub">Darker = more fire · {onSelect ? "tap a month for details" : "harmonized detections"}</span>
      </figcaption>
      <div className="mini-cal-scroll">
        <table className="mini-cal-table">
          <caption className="sr-only">Harmonized fire detections per month (VIIRS-equivalent)</caption>
          <colgroup>
            <col className="year-col" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Year</span>
              </th>
              {calendar.months.map((m) => (
                <th key={m} scope="col">
                  {m.slice(0, 1)}
                  <span className="sr-only">{m.slice(1)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {rows[i].map((v, m) => {
                  const yearIndex = from + i;
                  const isSel = selected !== null && selected.yearIndex === yearIndex && selected.month === m;
                  const label = `${calendar.months[m]} ${y}: ${v === null ? "no data" : `${fmtCount(v)} detections`}`;
                  return (
                    <td
                      key={m}
                      className={isSel ? "is-selected" : undefined}
                      style={{
                        background: v === null ? NO_DATA_COLOR : cellColor(v, max),
                        boxShadow: needsOutline(v, max) ? `inset 0 0 0 1px ${DARK_CELL_OUTLINE}` : undefined,
                      }}
                      title={label}
                    >
                      {onSelect ? (
                        <button type="button" className="cell-btn" aria-label={label} aria-pressed={isSel} onClick={() => onSelect({ yearIndex, month: m })} />
                      ) : (
                        <span className="sr-only">{fmtCount(v)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RampLegend max={max} />
    </figure>
  );
}
