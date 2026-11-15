import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  key: string;
  data?: T;
  error?: unknown;
}

// Caché en memoria compartida por todos los componentes: la misma consulta (misma `key`) se pide
// una sola vez aunque la usen dos vistas, y volver a una vista o pestaña ya visitada es instantáneo.
// Los errores no se guardan, así que reintentar siempre vuelve a llamar al servidor.
const CACHE_MAX = 80;
const inflight = new Map<string, Promise<unknown>>();
const done = new Map<string, unknown>();

function evict<V>(map: Map<string, V>): void {
  while (map.size > CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function fetchOnce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn();
  inflight.set(key, p);
  evict(inflight);
  p.then(
    (data) => {
      done.set(key, data);
      evict(done);
    },
    () => {
      if (inflight.get(key) === p) inflight.delete(key);
    },
  );
  return p;
}

/** Drops every cached result (used by tests). */
export function clearAsyncCache(): void {
  inflight.clear();
  done.clear();
}

/**
 * Runs `fn` whenever `key` changes (or `reload` is called). `key = null` disables the call.
 * Loading is derived (settled key !== current key), so no setState runs synchronously inside the effect.
 * Keeps the previous data while a new request is in flight to avoid layout jumps.
 * Results are cached by `key`, so keys must identify the request completely (including the data source).
 */
export function useAsync<T>(key: string | null, fn: () => Promise<T>): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [lastData, setLastData] = useState<T | undefined>(undefined);
  const fullKey = key === null ? null : nonce === 0 ? key : `${key}#${nonce}`;

  useEffect(() => {
    if (fullKey === null) return;
    let alive = true;
    fetchOnce(fullKey, fn).then(
      (data) => {
        if (!alive) return;
        setSettled({ key: fullKey, data });
        setLastData(data);
      },
      (error) => {
        if (alive) setSettled({ key: fullKey, error });
      },
    );
    return () => {
      alive = false;
    };
    // fn cambia en cada render; la identidad de la consulta es `fullKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = settled && settled.key === fullKey ? settled : null;
  // Resultado ya en caché: se muestra en el mismo render, sin pasar por el estado de carga.
  const cached = current === null && fullKey !== null && done.has(fullKey);
  return {
    data: current ? current.data : cached ? (done.get(fullKey) as T) : lastData,
    error: current?.error,
    loading: fullKey !== null && current === null && !cached,
    reload,
  };
}
