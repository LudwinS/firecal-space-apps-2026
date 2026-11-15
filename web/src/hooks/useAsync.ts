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

/**
 * Runs `fn` whenever `key` changes (or `reload` is called). `key = null` disables the call.
 * Loading is derived (settled key !== current key), so no setState runs synchronously inside the effect.
 * Keeps the previous data while a new request is in flight to avoid layout jumps.
 */
export function useAsync<T>(key: string | null, fn: () => Promise<T>): AsyncState<T> {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [lastData, setLastData] = useState<T | undefined>(undefined);
  const fullKey = key === null ? null : `${key}#${nonce}`;

  useEffect(() => {
    if (fullKey === null) return;
    let alive = true;
    fn().then(
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
  return {
    data: current ? current.data : lastData,
    error: current?.error,
    loading: fullKey !== null && current === null,
    reload,
  };
}
