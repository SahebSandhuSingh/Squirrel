import { API_URL } from '@/api/config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
    /** Parsed from the Retry-After header on 429 / 503 responses (milliseconds). */
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};

/** Retry-After is either delta-seconds or an HTTP date. */
function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Pull a readable message out of an error body: `{ message }`, `{ error }`, or FastAPI's `{ detail }`. */
function errorMessage(json: unknown, fallback: string): string {
  const b = json as { message?: unknown; error?: unknown; detail?: unknown } | undefined;
  if (typeof b?.message === 'string') return b.message;
  if (typeof b?.error === 'string') return b.error;
  if (typeof b?.detail === 'string') return b.detail;
  // FastAPI validation errors: detail = [{ loc, msg }, …]
  if (Array.isArray(b?.detail)) {
    const msgs = b.detail.map((d: { msg?: unknown; loc?: unknown[] }) => (typeof d?.msg === 'string' ? `${d.loc?.slice(-1)[0] ?? 'field'}: ${d.msg}` : null)).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
}

/**
 * JSON fetch with the bearer token attached. Defaults to the Run Module backend;
 * pass `base` to reach another service (e.g. the Exercise backend) through the same client.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number; base?: string } = {}): Promise<T> {
  const base = init.base ?? API_URL;
  if (!base) throw new ApiError(0, 'API not configured (demo mode)');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    if (!res.ok) {
      throw new ApiError(res.status, errorMessage(json, res.statusText || `HTTP ${res.status}`), json, parseRetryAfter(res.headers.get('Retry-After')));
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}
