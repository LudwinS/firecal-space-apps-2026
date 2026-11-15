import { useState } from "react";
import type { AreaInfo, AreaSpec, FireCalApi, QueryRequest } from "../api/types";
import { AsyncBlock } from "../components/AsyncBlock";
import { CalendarHeatmap, VARIABLE_LABEL, type CalendarVariable } from "../components/charts/CalendarHeatmap";
import { AnomalyChart } from "../components/charts/AnomalyChart";
import { DownloadButtons } from "../components/DownloadButtons";
import { MonthDetail } from "../components/MonthDetail";
import { AnomalyIcon, CalendarIcon, DownloadIcon } from "../components/icons/Icon";
import { Tabs } from "../components/Tabs";
import { useAsync } from "../hooks/useAsync";
import { fmtCount } from "../lib/format";
import { latestPick, monthDetail, type MonthPick } from "../lib/monthDetail";
import { ComparePanel } from "./ComparePanel";
import { MethodsPanel } from "./MethodsPanel";

interface Props {
  api: FireCalApi;
  sourceKey: string;
  query: QueryRequest | null;
  queryKey: string | null;
  areaName: string;
  countries: AreaInfo[];
  currentArea: AreaSpec | null;
}

type Tab = "calendar" | "compare" | "method";

const VARIABLES: CalendarVariable[] = ["harmonized", "modis", "viirs"];

export default function AnalystView({ api, sourceKey, query, queryKey, areaName, countries, currentArea }: Props) {
  const [tab, setTab] = useState<Tab>("calendar");
  const [variable, setVariable] = useState<CalendarVariable>("harmonized");
  const calendar = useAsync(tab === "calendar" && queryKey ? `calendar:${queryKey}` : null, () => api.calendar(query!));
  const anomalies = useAsync(tab === "calendar" && queryKey ? `anomalies:${queryKey}` : null, () => api.anomalies(query!));
  const [picked, setPicked] = useState<{ key: string; pick: MonthPick } | null>(null);

  return (
    <Tabs
      label="Analyst sections"
      active={tab}
      onChange={setTab}
      tabs={[
        { id: "calendar", label: "Calendar & anomalies", icon: "calendar" },
        { id: "compare", label: "Compare two areas", icon: "compare" },
        { id: "method", label: "Method & validation", icon: "validation" },
      ]}
    >
      {tab === "calendar" &&
        (query ? (
          <div className="stack">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2 className="panel-title">
                    <CalendarIcon size={22} className="title-icon" /> Burning activity calendar · {areaName}
                  </h2>
                  <p className="help">Each cell is one month; darker means more fire. Click or tap a month to see how it compares with the usual for that month.</p>
                </div>
                <div className="segmented segmented-pill" role="radiogroup" aria-label="Values shown in the calendar">
                  {VARIABLES.map((v) => (
                    <label key={v} className={variable === v ? "seg active" : "seg"}>
                      <input type="radio" name="cal-variable" value={v} checked={variable === v} onChange={() => setVariable(v)} />
                      {v === "harmonized" ? "Harmonized" : VARIABLE_LABEL[v]}
                    </label>
                  ))}
                </div>
              </div>
              <AsyncBlock state={calendar} what="calendar" minHeight={420} isEmpty={(c) => c.total_raw_hotspots === 0}>
                {(c) => (
                  <>
                    <dl className="kpis">
                      <div>
                        <dt>Raw hotspots (MODIS + VIIRS)</dt>
                        <dd>{fmtCount(c.total_raw_hotspots)}</dd>
                      </div>
                      <div>
                        <dt>Years</dt>
                        <dd>
                          {c.years[0]}–{c.years[c.years.length - 1]}
                        </dd>
                      </div>
                      <div>
                        <dt>Harmonization method</dt>
                        <dd className="mono method-chip">{c.method}</dd>
                      </div>
                    </dl>
                    {variable === "viirs" && <p className="help">VIIRS (375 m) starts in January 2012; earlier years are shown as “no data”.</p>}
                    {variable === "modis" && <p className="help">Raw MODIS (1 km) counts are lower because MODIS misses many small fires that VIIRS sees.</p>}
                    {(() => {
                      const pick = picked && picked.key === queryKey ? picked.pick : latestPick(c);
                      return (
                        <>
                          <CalendarHeatmap
                            calendar={c}
                            variable={variable}
                            selected={pick}
                            onSelect={(p) => queryKey && setPicked({ key: queryKey, pick: p })}
                          />
                          <MonthDetail detail={pick ? monthDetail(c, pick, anomalies.data) : null} />
                        </>
                      );
                    })()}
                  </>
                )}
              </AsyncBlock>
            </section>
            <section className="panel">
              <h2 className="panel-title">
                <AnomalyIcon size={22} className="title-icon" /> Monthly anomalies vs. the historical median
              </h2>
              <p className="help">How far each month is above (ember) or below (sky blue) the median of the same calendar month in the reference period.</p>
              <AsyncBlock state={anomalies} what="anomalies" minHeight={300} isEmpty={(a) => a.series.length === 0}>
                {(a) => <AnomalyChart data={a} />}
              </AsyncBlock>
            </section>
            <section className="panel">
              <h2 className="panel-title">
                <DownloadIcon size={22} className="title-icon" /> Downloads
              </h2>
              <p className="help">CSV with every hotspot in the selection (with its harmonization weight), or a short PDF report.</p>
              <DownloadButtons api={api} query={query} />
            </section>
          </div>
        ) : (
          <div className="state state-empty">
            <p className="state-title">Choose an area first</p>
          </div>
        ))}
      {tab === "compare" && <ComparePanel api={api} sourceKey={sourceKey} query={query} countries={countries} currentArea={currentArea} currentName={areaName} />}
      {tab === "method" && <MethodsPanel api={api} sourceKey={sourceKey} />}
    </Tabs>
  );
}
