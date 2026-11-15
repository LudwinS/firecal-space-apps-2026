import { useId } from "react";
import {
  CURRENT_YEAR,
  FIRST_YEAR,
  LAST_ARCHIVE_YEAR,
  MAX_RADIUS_KM,
  type AreaMode,
  type AreaState,
  type RefPreset,
  type TimeState,
} from "../api/requests";
import type { AreaInfo } from "../api/types";
import { Icon, VolcanoIcon } from "./icons/Icon";
import type { IconName } from "./icons/iconData";

interface Props {
  area: AreaState;
  time: TimeState;
  countries: AreaInfo[];
  countriesLoading: boolean;
  onArea: (a: AreaState) => void;
  onTime: (t: TimeState) => void;
  error: string | null;
  showPersistent: boolean;
  onShowPersistent: (v: boolean) => void;
}

const MODES: { id: AreaMode; label: string; icon: IconName }[] = [
  { id: "country", label: "Country", icon: "layers" },
  { id: "draw", label: "Draw", icon: "draw-area" },
  { id: "point", label: "Lat / Lon", icon: "coordinates" },
];

const YEARS = Array.from({ length: CURRENT_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

export function AreaPanel({ area, time, countries, countriesLoading, onArea, onTime, error, showPersistent, onShowPersistent }: Props) {
  const id = useId();
  const set = (patch: Partial<AreaState>) => onArea({ ...area, ...patch });
  const setT = (patch: Partial<TimeState>) => onTime({ ...time, ...patch });

  return (
    <section className="panel area-panel" aria-labelledby={`${id}-h`} id="area-panel">
      <h2 id={`${id}-h`} className="panel-title">
        Area &amp; period
      </h2>

      <fieldset className="field">
        <legend className="label">Where? Choose the area</legend>
        <div className="mode-grid" role="radiogroup" aria-label="Area selection mode">
          {MODES.map((m) => (
            <label key={m.id} className={area.mode === m.id ? "mode-btn active" : "mode-btn"}>
              <input type="radio" name={`${id}-mode`} value={m.id} checked={area.mode === m.id} onChange={() => set({ mode: m.id })} />
              <Icon name={m.icon} size={20} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {area.mode === "country" && (
        <div className="field">
          <label className="label" htmlFor={`${id}-country`}>
            Country
          </label>
          <select id={`${id}-country`} value={area.country} onChange={(e) => set({ country: e.target.value })} disabled={countriesLoading && countries.length === 0}>
            {countries.length === 0 && <option value={area.country}>{countriesLoading ? "Loading countries…" : area.country.replace(/_/g, " ")}</option>}
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {area.mode === "draw" && (
        <div className="field">
          <p className="help">
            {area.drawn
              ? area.drawn.kind === "bbox"
                ? `Rectangle: ${area.drawn.bbox.map((v) => v.toFixed(2)).join(", ")} (W, S, E, N).`
                : `Polygon with ${area.drawn.polygon.type === "Polygon" ? area.drawn.polygon.coordinates[0].length - 1 : "several"} vertices.`
              : "Pick the rectangle or polygon tool in the map toolbar, then draw. Drawing again replaces the area."}
          </p>
          {area.drawn && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ drawn: null })}>
              Clear drawing
            </button>
          )}
        </div>
      )}

      {area.mode === "point" && (
        <div className="grid-3">
          <div className="field">
            <label className="label" htmlFor={`${id}-lat`}>
              Latitude
            </label>
            <input id={`${id}-lat`} inputMode="decimal" value={area.lat} onChange={(e) => set({ lat: e.target.value })} placeholder="13.70" />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-lon`}>
              Longitude
            </label>
            <input id={`${id}-lon`} inputMode="decimal" value={area.lon} onChange={(e) => set({ lon: e.target.value })} placeholder="-89.20" />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-r`}>
              Radius (km)
            </label>
            <input
              id={`${id}-r`}
              type="number"
              min={1}
              max={MAX_RADIUS_KM}
              step={1}
              inputMode="decimal"
              value={area.radiusKm}
              onChange={(e) => set({ radiusKm: e.target.value })}
            />
          </div>
          <p className="help span-3">Tip: click the map to set the center.</p>
        </div>
      )}

      <div className="grid-2">
        <div className="field">
          <label className="label" htmlFor={`${id}-y0`}>
            From year
          </label>
          <select id={`${id}-y0`} value={time.startYear} onChange={(e) => setT({ startYear: Number(e.target.value) })}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-y1`}>
            To year
          </label>
          <select id={`${id}-y1`} value={time.endYear} onChange={(e) => setT({ endYear: Number(e.target.value) })}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y === CURRENT_YEAR ? `${y} (latest)` : y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${id}-ref`}>
          Compare against (reference period)
        </label>
        <select id={`${id}-ref`} value={time.refPreset} onChange={(e) => setT({ refPreset: e.target.value as RefPreset })}>
          <option value="all">All years</option>
          <option value="modis">2001–2011 (MODIS era)</option>
          <option value="viirs">2012–{LAST_ARCHIVE_YEAR} (VIIRS era)</option>
          <option value="custom">Custom…</option>
        </select>
      </div>
      {time.refPreset === "custom" && (
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor={`${id}-r0`}>
              Reference from
            </label>
            <select id={`${id}-r0`} value={time.refFrom} onChange={(e) => setT({ refFrom: Number(e.target.value) })}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-r1`}>
              Reference to
            </label>
            <select id={`${id}-r1`} value={time.refTo} onChange={(e) => setT({ refTo: Number(e.target.value) })}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <label className="check">
        <input type="checkbox" checked={showPersistent} onChange={(e) => onShowPersistent(e.target.checked)} />
        <VolcanoIcon size={18} className="check-icon" />
        <span>Show excluded persistent heat sources (volcanoes, industry)</span>
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
