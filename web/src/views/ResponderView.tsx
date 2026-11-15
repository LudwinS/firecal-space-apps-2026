import { t } from "../i18n";
import type { FireCalApi, QueryRequest } from "../api/types";
import { AsyncBlock } from "../components/AsyncBlock";
import { DownloadButtons } from "../components/DownloadButtons";
import { MiniCalendar } from "../components/MiniCalendar";
import { StatusCard } from "../components/StatusCard";
import { useAsync } from "../hooks/useAsync";

interface Props {
  api: FireCalApi;
  query: QueryRequest | null;
  queryKey: string | null;
  areaName: string;
}

export function ResponderView({ api, query, queryKey, areaName }: Props) {
  const status = useAsync(queryKey && `status:${queryKey}`, () => api.status(query!));
  const calendar = useAsync(queryKey && `calendar:${queryKey}`, () => api.calendar(query!));

  if (!query) {
    return (
      <div className="state state-empty">
        <p className="state-title">{t("Choose an area to see its fire status")}</p>
        <p className="state-text">{t("Pick a country, draw on the map, or enter a latitude and longitude.")}</p>
      </div>
    );
  }

  return (
    <div className="responder">
      <a className="skip-inline" href="#area-panel">
        {t("Change area or period")}
      </a>
      <AsyncBlock state={status} what="current fire status" minHeight={280}>
        {(s) => <StatusCard status={s} areaName={areaName} />}
      </AsyncBlock>
      <DownloadButtons api={api} query={query} large />
      <section className="panel">
        <AsyncBlock state={calendar} what="calendar" isEmpty={(c) => c.total_raw_hotspots === 0}>
          {(c) => <MiniCalendar calendar={c} />}
        </AsyncBlock>
      </section>
      <p className="note">
        {t("Levels compare the latest month with the same month in past years (percentile): Normal < 75th, Elevated ≥ 75th, High ≥ 90th, Extreme ≥ 97.5th. Months with fewer than 5 detections are always Normal. Counts are satellite hotspots, not individual fires; clouds and smoke can hide fires.")}
      </p>
    </div>
  );
}
