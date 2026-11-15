import { CALENDAR_RAMP, DARK_CELL_OUTLINE, NO_DATA_COLOR, sqrtScaleInverse, ZERO_COLOR } from "../lib/colors";
import { fmtCount } from "../lib/format";

/** Legend for the square-root-scaled Ember ramp used by all calendars. */
export function RampLegend({ max }: { max: number }) {
  const gradient = `linear-gradient(to right, ${CALENDAR_RAMP.join(", ")})`;
  const mid = Math.round(sqrtScaleInverse(0.5, max));
  return (
    <div className="legend" role="note" aria-label={`Color scale: light means few detections, dark means many, up to ${fmtCount(max)} per month (square-root scale).`}>
      <span className="legend-swatch" style={{ background: ZERO_COLOR }} aria-hidden="true" />
      <span className="legend-text">0</span>
      <span className="legend-ramp" aria-hidden="true">
        <span className="legend-bar" style={{ background: gradient, boxShadow: `inset -1px 0 0 ${DARK_CELL_OUTLINE}` }} />
        <span className="legend-ticks">
          <span>1</span>
          <span>{fmtCount(mid)}</span>
          <span>{fmtCount(max)}</span>
        </span>
      </span>
      <span className="legend-swatch" style={{ background: NO_DATA_COLOR }} aria-hidden="true" />
      <span className="legend-text">No data</span>
      <span className="legend-note">Darker = more fire · detections / month, square-root scale</span>
    </div>
  );
}
