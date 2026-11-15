import { useId, useState } from "react";
import { requestKey } from "../api/requests";
import type { AreaInfo, AreaSpec, CompareRequest, FireCalApi, QueryRequest } from "../api/types";
import { AsyncBlock } from "../components/AsyncBlock";
import { CompareIcon } from "../components/icons/Icon";
import { CalendarHeatmap } from "../components/charts/CalendarHeatmap";
import { SeasonalChart } from "../components/charts/SeasonalChart";
import { SERIES_A, SERIES_B } from "../lib/colors";
import { prettyCountry } from "../lib/format";
import { useAsync } from "../hooks/useAsync";

interface Props {
  api: FireCalApi;
  sourceKey: string;
  query: QueryRequest | null;
  countries: AreaInfo[];
  currentArea: AreaSpec | null;
  currentName: string;
}

const CURRENT = "__current__";

export function describeCorrelation(r: number | null): string {
  if (r === null) return "Not enough data to compute a correlation.";
  const a = Math.abs(r);
  const strength = a >= 0.8 ? "very strong" : a >= 0.6 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "no clear";
  return `${strength[0].toUpperCase() + strength.slice(1)} ${r >= 0 ? "positive" : "negative"} relationship: the two areas ${
    r >= 0.4 ? "tend to burn in the same months and years" : "follow different burning patterns"
  }.`;
}

export function ComparePanel({ api, sourceKey, query, countries, currentArea, currentName }: Props) {
  const id = useId();
  const [selA, setSelA] = useState<string>(CURRENT);
  const [selB, setSelB] = useState<string>("Guatemala");

  const resolve = (sel: string): { area: AreaSpec; name: string } | null => {
    if (sel === CURRENT) return currentArea ? { area: currentArea, name: currentName } : null;
    return { area: { country: sel }, name: countries.find((c) => c.id === sel)?.name ?? prettyCountry(sel) };
  };
  const a = resolve(selA);
  const b = resolve(selB);
  const req: CompareRequest | null = a && b ? { area_a: a.area, area_b: b.area, start: query?.start, end: query?.end ?? null } : null;
  const state = useAsync(req ? `compare:${sourceKey}:${requestKey(req)}` : null, () => api.compare(req!));

  const options = (
    <>
      <option value={CURRENT}>Current area ({currentName})</option>
      {countries.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  );

  return (
    <div className="stack">
      <section className="panel">
        <h2 className="panel-title">
          <CompareIcon size={22} className="title-icon" /> Compare two areas
        </h2>
        <p className="help">Same period and the same harmonization for both areas. Each calendar uses its own color scale.</p>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor={`${id}-a`}>
              <span className="dot" style={{ background: SERIES_A }} aria-hidden="true" /> Area A
            </label>
            <select id={`${id}-a`} value={selA} onChange={(e) => setSelA(e.target.value)}>
              {options}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-b`}>
              <span className="dot" style={{ background: SERIES_B }} aria-hidden="true" /> Area B
            </label>
            <select id={`${id}-b`} value={selB} onChange={(e) => setSelB(e.target.value)}>
              {options}
            </select>
          </div>
        </div>
      </section>
      {!req ? (
        <div className="state state-empty">
          <p className="state-title">Choose a valid area first</p>
          <p className="state-text">“Current area” needs a valid selection in the Area &amp; period panel.</p>
        </div>
      ) : (
        <AsyncBlock state={state} what="comparison" minHeight={360}>
          {(d) => (
            <div className="stack">
              <section className="panel">
                <div className="corr">
                  <div className="corr-value">
                    <span className="corr-label">Correlation (monthly series)</span>
                    <strong>{d.correlation === null ? "—" : d.correlation.toFixed(2)}</strong>
                  </div>
                  <p className="corr-text">{describeCorrelation(d.correlation)}</p>
                </div>
                <h3 className="sub-title">Seasonal profile (median per month)</h3>
                <SeasonalChart a={d.monthly_a} b={d.monthly_b} nameA={a!.name} nameB={b!.name} />
              </section>
              <div className="grid-2 compare-grid">
                <section className="panel">
                  <CalendarHeatmap calendar={d.a} compact title={`A · ${a!.name}`} />
                </section>
                <section className="panel">
                  <CalendarHeatmap calendar={d.b} compact title={`B · ${b!.name}`} />
                </section>
              </div>
            </div>
          )}
        </AsyncBlock>
      )}
    </div>
  );
}
