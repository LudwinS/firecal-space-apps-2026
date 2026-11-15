import { t, useLang } from "./i18n";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { apiFor, FORCE_MOCK, wakeUp, type DataSource } from "./api/client";
import { MOCK_COUNTRIES } from "./api/mock";
import { buildCoveredQuery, coverageBox, DEFAULT_AREA, DEFAULT_TIME, describeArea, requestKey, type AreaState, type DrawnShape, type TimeState } from "./api/requests";
import type { PersistentSourcesGeoJSON } from "./api/types";
import { AreaPanel } from "./components/AreaPanel";
import { ConnectionBanner, Footer, Header, type ViewMode } from "./components/Layout";
import { WakingIcon } from "./components/icons/Icon";
import { useAsync } from "./hooks/useAsync";
import { useDebounced } from "./hooks/useDebounced";
import { ResponderView } from "./views/ResponderView";

// La vista de analista carga ECharts: se separa en otro chunk para que la vista de bombero sea ligera en celular.
const loadAnalystView = () => import("./views/AnalystView");
const AnalystView = lazy(loadAnalystView);
// El mapa (Leaflet + Geoman) también va en su propio chunk: el estado del fuego se pinta y se pide
// al servidor sin esperar a que baje el mapa.
const AreaMap = lazy(() => import("./components/map/AreaMap").then((m) => ({ default: m.AreaMap })));

const WAKE_ATTEMPTS = 5;

function initialView(): ViewMode {
  try {
    const p = new URLSearchParams(window.location.search).get("view");
    if (p === "analyst" || p === "responder") return p;
    const saved = window.localStorage.getItem("firecal:view");
    if (saved === "analyst" || saved === "responder") return saved;
  } catch {
    /* almacenamiento no disponible */
  }
  return "responder";
}

export default function App() {
  const lang = useLang(); // vuelve a pintar toda la app al cambiar de idioma
  const [view, setView] = useState<ViewMode>(initialView);
  const [source, setSource] = useState<DataSource | "connecting">(FORCE_MOCK ? "mock" : "connecting");
  const [attempt, setAttempt] = useState(1);
  const [wakeNonce, setWakeNonce] = useState(0);
  const [area, setArea] = useState<AreaState>(DEFAULT_AREA);
  const [time, setTime] = useState<TimeState>(DEFAULT_TIME);
  const [showPersistent, setShowPersistent] = useState(false);

  // Conexión: despierta el backend (el plan gratuito de Render duerme al estar inactivo) o cae a datos demo.
  useEffect(() => {
    if (FORCE_MOCK || source !== "connecting") return;
    const ctrl = new AbortController();
    wakeUp((i) => setAttempt(i), WAKE_ATTEMPTS, 4000, ctrl.signal)
      .then((ok) => {
        if (!ctrl.signal.aborted) setSource(ok ? "live" : "mock");
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSource("mock");
      });
    return () => ctrl.abort();
  }, [source, wakeNonce]);

  // Con el navegador ocioso se descarga la vista de analista (ECharts) para que el cambio de vista sea inmediato.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void loadAnalystView().catch(() => undefined));
    return () => cancel(id);
  }, []);

  const changeView = useCallback((v: ViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem("firecal:view", v);
    } catch {
      /* ignorar */
    }
  }, []);

  const ready = source !== "connecting";
  const api = apiFor(source === "live" ? "live" : "mock");
  const sourceKey = String(source);

  const areas = useAsync(ready ? `areas:${sourceKey}` : null, () => api.areas());
  const countries = areas.data ?? (source === "mock" ? MOCK_COUNTRIES : []);
  const persistent = useAsync<PersistentSourcesGeoJSON>(ready && showPersistent ? `persistent:${sourceKey}` : null, () => api.persistentSources());

  // Región con datos (unión de los países): limita el mapa y valida que el área caiga dentro.
  const coverage = coverageBox(countries);
  const coverageKey = coverage ? coverage.join(",") : "";

  const debouncedArea = useDebounced(area, 450);
  // `lang` entra en las dependencias porque los mensajes de validación se traducen al crearse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => buildCoveredQuery(debouncedArea, time, coverage), [debouncedArea, time, coverageKey, lang]);
  const query = built.ok ? built.value : null;
  const queryKey = ready && query ? `${sourceKey}:${requestKey(query)}` : null;
  const liveError = buildCoveredQuery(area, time, coverage);
  const areaName = query ? (query.area.country ? (t(countries.find((c) => c.id === query.area.country)?.name ?? describeArea(query.area))) : describeArea(query.area)) : "—";

  const onDraw = useCallback((shape: DrawnShape) => setArea((a) => ({ ...a, mode: "draw", drawn: shape })), []);
  const onPickPoint = useCallback((lat: number, lon: number) => setArea((a) => ({ ...a, lat: String(lat), lon: String(lon) })), []);

  return (
    <div className={`app view-${view}`}>
      <a className="skip-link" href="#main">
        {t("Skip to results")}
      </a>
      <Header view={view} onView={changeView} source={source} />
      <ConnectionBanner
        source={source}
        forced={FORCE_MOCK}
        attempt={attempt}
        attempts={WAKE_ATTEMPTS}
        onUseDemo={() => setSource("mock")}
        onRetryLive={() => {
          setAttempt(1);
          setSource("connecting");
          setWakeNonce((n) => n + 1);
        }}
      />
      <div className="layout">
        <aside className="sidebar" aria-label={t("Area and period selection")}>
          <AreaPanel
            area={area}
            time={time}
            countries={countries}
            countriesLoading={areas.loading}
            onArea={setArea}
            onTime={setTime}
            error={liveError.ok ? null : liveError.error}
            showPersistent={showPersistent}
            onShowPersistent={setShowPersistent}
          />
          <section className="panel map-panel" aria-label={t("Map")}>
            <Suspense
              fallback={
                <div className="map-wrap" role="status" aria-label={t("Loading map")}>
                  <div className="map" />
                </div>
              }
            >
              <AreaMap area={area} countries={countries} coverage={coverage} onDraw={onDraw} onPickPoint={onPickPoint} persistent={showPersistent ? (persistent.data ?? null) : null} />
            </Suspense>
            {showPersistent && persistent.error ? (
              <p className="form-error" role="alert">
                {t("Could not load the persistent heat sources layer.")}
              </p>
            ) : null}
          </section>
        </aside>
        <main id="main" className="content" tabIndex={-1}>
          {!ready ? (
            <div className="state" role="status">
              <span className="state-icon waking-pulse" aria-hidden="true">
                <WakingIcon size={32} />
              </span>
              <p className="state-title">{t("Waking up the server…")}</p>
              <p className="state-text">{t("This can take up to a minute the first time.")}</p>
            </div>
          ) : view === "responder" ? (
            <ResponderView api={api} query={query} queryKey={queryKey} areaName={areaName} />
          ) : (
            <Suspense
              fallback={
                <div className="state" role="status">
                  <span className="spinner" aria-hidden="true" />
                  <p className="state-text">{t("Loading analyst tools…")}</p>
                </div>
              }
            >
              <AnalystView
                api={api}
                sourceKey={sourceKey}
                query={query}
                queryKey={queryKey}
                areaName={areaName}
                countries={countries}
                currentArea={query?.area ?? null}
              />
            </Suspense>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
