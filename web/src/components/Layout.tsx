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
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <Logo size={40} asHeading tagline="25 years of satellite fire detections on one comparable scale" />
        </div>
        <div className="header-actions">
          <span className={`source-pill source-${source}`}>
            {source === "live" ? "Live data" : source === "mock" ? "Demo data" : "Connecting…"}
          </span>
          <div className="view-toggle" role="group" aria-label="Choose view">
            <button type="button" aria-pressed={view === "responder"} className={view === "responder" ? "active" : ""} onClick={() => onView("responder")}>
              Responder<span className="sr-only"> view</span>
            </button>
            <button type="button" aria-pressed={view === "analyst"} className={view === "analyst" ? "active" : ""} onClick={() => onView("analyst")}>
              Analyst<span className="sr-only"> view</span>
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
        Data:{" "}
        <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">
          NASA FIRMS (MODIS &amp; VIIRS)
        </a>{" "}
        · Map tiles © OpenStreetMap contributors · Team InnovaSoft · NASA Space Apps Challenge 2026
      </p>
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
          <strong>Waking up the server…</strong> The free server sleeps when idle; this can take up to a minute (attempt {attempt} of {attempts}).
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onUseDemo}>
          Use demo data now
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
        <strong>Demo data.</strong>{" "}
        {forced
          ? "This build runs without a server: numbers are synthetic samples that mimic the real seasonal pattern."
          : "The live server could not be reached, so you are seeing synthetic sample data. Do not use it for decisions."}
      </span>
      {!forced && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryLive}>
          Try the live server again
        </button>
      )}
    </div>
  );
}
