import { useState } from "react";
import type { FireCalApi, QueryRequest } from "../api/types";
import { AsyncBlock } from "../components/AsyncBlock";
import { DownloadButtons } from "../components/DownloadButtons";
import { MiniCalendar } from "../components/MiniCalendar";
import { MonthDetail } from "../components/MonthDetail";
import { StatusCard } from "../components/StatusCard";
import { useAsync } from "../hooks/useAsync";
import { latestPick, monthDetail, type MonthPick } from "../lib/monthDetail";

interface Props {
  api: FireCalApi;
  query: QueryRequest | null;
  queryKey: string | null;
  areaName: string;
}

export function ResponderView({ api, query, queryKey, areaName }: Props) {
  const status = useAsync(queryKey && `status:${queryKey}`, () => api.status(query!));
  const calendar = useAsync(queryKey && `calendar:${queryKey}`, () => api.calendar(query!));
  const anomalies = useAsync(queryKey && `anomalies:${queryKey}`, () => api.anomalies(query!));
  // El mes elegido vale solo para el área/periodo en que se eligió; si no, se muestra el último mes con datos.
  const [picked, setPicked] = useState<{ key: string; pick: MonthPick } | null>(null);

  if (!query) {
    return (
      <div className="state state-empty">
        <p className="state-title">Choose an area to see its fire status</p>
        <p className="state-text">Pick a country, draw on the map, or enter a latitude and longitude.</p>
      </div>
    );
  }

  return (
    <div className="responder">
      <a className="skip-inline" href="#area-panel">
        Change area or period
      </a>
      <AsyncBlock state={status} what="current fire status" minHeight={280}>
        {(s) => <StatusCard status={s} areaName={areaName} />}
      </AsyncBlock>
      <DownloadButtons api={api} query={query} large />
      <section className="panel">
        <AsyncBlock state={calendar} what="calendar" isEmpty={(c) => c.total_raw_hotspots === 0}>
          {(c) => {
            const pick = picked && picked.key === queryKey ? picked.pick : latestPick(c);
            return (
              <>
                <MiniCalendar calendar={c} selected={pick} onSelect={(p) => queryKey && setPicked({ key: queryKey, pick: p })} />
                <MonthDetail detail={pick ? monthDetail(c, pick, anomalies.data) : null} />
              </>
            );
          }}
        </AsyncBlock>
      </section>
      <p className="note">
        Levels compare the latest month with the same month in past years (percentile): Normal &lt; 75th, Elevated ≥ 75th, High ≥ 90th,
        Extreme ≥ 97.5th. Months with fewer than 5 detections are always Normal. Counts are satellite hotspots, not individual fires; clouds and smoke can hide fires.
      </p>
    </div>
  );
}
