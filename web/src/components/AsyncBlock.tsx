import { t } from "../i18n";
import { useEffect, type ReactNode } from "react";
import { errorMessage, isUnreachable } from "../api/client";
import type { AsyncState } from "../hooks/useAsync";
import { WakingIcon } from "./icons/Icon";

interface Props<T> {
  state: AsyncState<T>;
  /** What is loading, e.g. "calendar". */
  what: string;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: ReactNode;
  minHeight?: number;
  children: (data: T) => ReactNode;
}

const AUTO_RETRY_MS = 15_000;

/** Quiet landscape (trees under a cloud, no fire) for the "no detections" state. Decorative, theme colors only. */
function EmptyIllustration() {
  return (
    <svg className="empty-art" viewBox="0 0 220 120" width="220" height="120" aria-hidden="true" focusable="false">
      {/* nube */}
      <g fill="#2C3B35" stroke="#8E897E" strokeWidth="2" strokeLinejoin="round">
        <path d="M70 46a13 13 0 0 1 2-26 18 18 0 0 1 34-5 15 15 0 0 1 22 13 9 9 0 0 1-2 18z" />
      </g>
      {/* suelo */}
      <path d="M14 104h192" stroke="#4A5A53" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 111h28M96 111h44M160 111h20" stroke="#2C3B35" strokeWidth="2" strokeLinecap="round" />
      {/* árboles: troncos Sand, copas en tonos del tema */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M52 104V84" stroke="#F2D9A6" strokeWidth="3" />
        <path d="M52 52l-16 34h32z" fill="#22322C" stroke="#B9B3A6" strokeWidth="2" />
        <path d="M110 104V78" stroke="#F2D9A6" strokeWidth="3" />
        <path d="M110 34l-22 46h44z" fill="#17241F" stroke="#EDE8DD" strokeWidth="2" />
        <path d="M110 52l-14 28h28z" fill="#22322C" stroke="none" />
        <path d="M168 104V88" stroke="#F2D9A6" strokeWidth="3" />
        <circle cx="168" cy="72" r="17" fill="#22322C" stroke="#B9B3A6" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** Loading / error ("waking up the server") / empty states around a data-driven block. */
export function AsyncBlock<T>({ state, what, isEmpty, emptyMessage, minHeight = 160, children }: Props<T>) {
  const { data, error, loading, reload } = state;
  const unreachable = !!error && isUnreachable(error);

  // El servidor dormido tarda en despertar: reintento automático mientras no responda.
  useEffect(() => {
    if (!unreachable) return;
    const t = setTimeout(reload, AUTO_RETRY_MS);
    return () => clearTimeout(t);
  }, [unreachable, reload]);

  if (error) {
    return (
      <div className="state state-error" role="alert" style={{ minHeight }}>
        {unreachable ? (
          <>
            <span className="state-icon waking-pulse" aria-hidden="true">
              <WakingIcon size={32} />
            </span>
            <p className="state-title">{t("Waking up the server…")}</p>
            <p className="state-text">{t("The free server sleeps when idle and can take up to a minute to start. We will retry automatically.")}</p>
          </>
        ) : (
          <>
            <p className="state-title">{t("Could not load the {what}.", { what: t(what) })}</p>
            <p className="state-text">{errorMessage(error)}</p>
          </>
        )}
        <button type="button" className="btn btn-secondary" onClick={reload}>
          {t("Retry now")}
        </button>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="state" style={{ minHeight }} role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p className="state-text">{t("Loading {what}…", { what: t(what) })}</p>
      </div>
    );
  }

  if (isEmpty?.(data)) {
    return (
      <div className="state state-empty" style={{ minHeight }} role="status">
        <EmptyIllustration />
        <p className="state-title">{t("No fire detections here")}</p>
        <p className="state-text">
          {emptyMessage ?? t("There are no hotspots in this area for the selected period. Try a larger area, another location on land, or a longer date range.")}
        </p>
      </div>
    );
  }

  return (
    <div className={loading ? "is-refreshing" : undefined} aria-busy={loading}>
      {children(data)}
    </div>
  );
}
