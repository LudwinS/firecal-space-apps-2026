// Cliente HTTP de la API FireCal (FastAPI). El backend puede estar dormido (plan gratuito de Render),
// así que distinguimos "no responde" (ApiError.unreachable) de errores con detalle.
import { t } from "../i18n";
import { mockApi } from "./mock";
import type { FireCalApi } from "./types";

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

export const API_URL = stripTrailingSlashes((import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8000");
export const FORCE_MOCK = import.meta.env.VITE_MOCK === "1" || import.meta.env.VITE_MOCK === "true";

export class ApiError extends Error {
  status: number | null;
  /** true when the server did not answer (network error, timeout, 502/503/504 while waking up) */
  unreachable: boolean;

  constructor(message: string, status: number | null, unreachable: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.unreachable = unreachable;
  }
}

const DEFAULT_TIMEOUT_MS = 45_000;

async function call(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, signal: ctrl.signal });
  } catch (e) {
    const msg = e instanceof DOMException && e.name === "AbortError" ? t("The server took too long to answer.") : t("Could not reach the server.");
    throw new ApiError(msg, null, true);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const waking = res.status === 502 || res.status === 503 || res.status === 504;
    let detail = t("Server error ({code}).", { code: res.status });
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || detail;
    } catch {
      /* cuerpo no JSON */
    }
    throw new ApiError(detail, res.status, waking);
  }
  return res;
}

const json = { "Content-Type": "application/json" };

async function getJson<T>(path: string, timeoutMs?: number): Promise<T> {
  return (await call(path, {}, timeoutMs)).json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return (await call(path, { method: "POST", headers: json, body: JSON.stringify(body) })).json() as Promise<T>;
}

async function postBlob(path: string, body: unknown): Promise<Blob> {
  return (await call(path, { method: "POST", headers: json, body: JSON.stringify(body) }, 90_000)).blob();
}

export const liveApi: FireCalApi = {
  health: () => getJson("/api/health", 12_000),
  areas: () => getJson("/api/areas"),
  calendar: (req) => postJson("/api/calendar", req),
  anomalies: (req) => postJson("/api/anomalies", req),
  status: (req) => postJson("/api/status", req),
  compare: (req) => postJson("/api/compare", req),
  methods: () => getJson("/api/methods"),
  persistentSources: () => getJson("/api/persistent-sources"),
  exportCsv: (req) => postBlob("/api/export/csv", req),
  reportPdf: (req) => postBlob("/api/report/pdf", req),
};

export type DataSource = "live" | "mock";

export function apiFor(source: DataSource): FireCalApi {
  return source === "mock" ? mockApi : liveApi;
}

/**
 * Pings /api/health a few times (a sleeping free Render service can take ~1 min to wake up).
 * Resolves true as soon as it answers; false after all attempts fail.
 */
export async function wakeUp(
  onAttempt: (attempt: number, total: number) => void,
  attempts = 5,
  pauseMs = 4000,
  signal?: AbortSignal,
): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    if (signal?.aborted) return false;
    onAttempt(i, attempts);
    try {
      await liveApi.health();
      return true;
    } catch (e) {
      // Un 4xx/5xx "real" significa que el servidor sí está despierto.
      if (e instanceof ApiError && !e.unreachable) return true;
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return false;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return t("Unexpected error.");
}

export function isUnreachable(e: unknown): boolean {
  return e instanceof ApiError && e.unreachable;
}

/** Triggers a browser download for a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
