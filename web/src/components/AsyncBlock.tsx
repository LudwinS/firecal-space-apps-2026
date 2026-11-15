import { t } from "../i18n";
import { useEffect, type ReactNode } from "react";
import { errorMessage, isUnreachable } from "../api/client";
import type { AsyncState } from "../hooks/useAsync";
import { HotspotIcon, WakingIcon } from "./icons/Icon";

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
        <span className="state-icon" aria-hidden="true">
          <HotspotIcon size={32} />
        </span>
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
