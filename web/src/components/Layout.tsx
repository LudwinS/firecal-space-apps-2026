import { LANGS, setLang, t, useLang } from "../i18n";
import type { DataSource } from "../api/client";
import { SatelliteIcon, WakingIcon } from "./icons/Icon";
import { Logo } from "./Logo";

export type ViewMode = "responder" | "analyst";

interface HeaderProps {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  source: DataSource | "connecting";
}

export function Header({ view, onView, source }: HeaderProps) {
  const lang = useLang();
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <Logo size={40} asHeading tagline={t("26 years of satellite fire detections on one comparable scale")} />
        </div>
        <div className="header-actions">
          <span className={`source-pill source-${source}`}>
            {source === "live" ? t("Live data") : source === "mock" ? t("Demo data") : t("Connecting…")}
          </span>
          <div className="view-toggle lang-toggle" role="group" aria-label={t("Language")}>
            {LANGS.map((l) => (
              <button key={l.id} type="button" lang={l.id} title={l.name} aria-label={l.name} aria-pressed={lang === l.id} className={lang === l.id ? "active" : ""} onClick={() => setLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="view-toggle" role="group" aria-label={t("Choose view")}>
            <button type="button" aria-pressed={view === "responder"} className={view === "responder" ? "active" : ""} onClick={() => onView("responder")}>
              {t("Responder")}<span className="sr-only"> {t("view")}</span>
            </button>
            <button type="button" aria-pressed={view === "analyst"} className={view === "analyst" ? "active" : ""} onClick={() => onView("analyst")}>
              {t("Analyst")}<span className="sr-only"> {t("view")}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="app-footer">
      <p>
        {t("Data:")}{" "}
        <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
          NASA FIRMS (MODIS &amp; VIIRS)
        </a>{" "}
        · {t("Map tiles © OpenStreetMap contributors")} · {t("Team InnovaSoft")} · NASA Space Apps Challenge 2026
      </p>
      <p className="ai-note">{t("Logo, icons and parts of the code were made with AI assistance (Claude, Gemini).")}</p>
    </footer>
  );
}

interface BannerProps {
  source: DataSource | "connecting";
  forced: boolean;
  attempt: number;
  attempts: number;
  onUseDemo: () => void;
  onRetryLive: () => void;
}

export function ConnectionBanner({ source, forced, attempt, attempts, onUseDemo, onRetryLive }: BannerProps) {
  if (source === "live") return null;
  if (source === "connecting") {
    return (
      <div className="banner banner-info" role="status" aria-live="polite">
        <span className="banner-icon waking-pulse" aria-hidden="true">
          <WakingIcon size={20} />
        </span>
        <span className="banner-text">
          <strong>{t("Waking up the server…")}</strong>{" "}
          {t("The free server sleeps when idle; this can take up to a minute (attempt {a} of {n}).", { a: attempt, n: attempts })}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onUseDemo}>
          {t("Use demo data now")}
        </button>
      </div>
    );
  }
  return (
    <div className="banner banner-warn" role="status">
      <span className="banner-icon" aria-hidden="true">
        <SatelliteIcon size={20} />
      </span>
      <span className="banner-text">
        <strong>{t("Demo data.")}</strong>{" "}
        {forced
          ? t("This build runs without a server: numbers are synthetic samples that mimic the real seasonal pattern.")
          : t("The live server could not be reached, so you are seeing synthetic sample data. Do not use it for decisions.")}
      </span>
      {!forced && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryLive}>
          {t("Try the live server again")}
        </button>
      )}
    </div>
  );
}
