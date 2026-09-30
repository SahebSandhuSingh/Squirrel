import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small fetch hook: loading / error / data with cancellation, plus an in-memory cache so a
 * screen you come back to renders its last data instantly while it revalidates.
 * `key = null` skips the request (e.g. not configured or no user yet).
 */
const cache = new Map<string, unknown>();

export function invalidateRemote(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

type Settled<T> = { id: string; data?: T; error: string | null };

export function useRemote<T>(key: string | null, fetcher: () => Promise<T>) {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const fetchRef = useRef(fetcher);
  useEffect(() => {
    fetchRef.current = fetcher;
  });

  // One request per (key, reload tick). Loading is derived: the current id hasn't settled yet.
  const id = key ? `${key}#${tick}` : null;
  useEffect(() => {
    if (!key || !id) return;
    let cancelled = false;
    fetchRef.current().then(
      (d) => {
        if (cancelled) return;
        cache.set(key, d);
        setSettled({ id, data: d, error: null });
      },
      (e) => !cancelled && setSettled({ id, error: e instanceof Error ? e.message : 'Something went wrong' }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, id]);

  const current = settled != null && settled.id === id;
  const data = (current && settled.data !== undefined ? settled.data : key ? (cache.get(key) as T | undefined) : undefined) ?? undefined;
  const error = current ? settled.error : null;
  const loading = !!key && !current;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
