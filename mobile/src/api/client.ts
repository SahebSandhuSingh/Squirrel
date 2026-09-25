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

/**
 * Called once when the server answers 401 with the current token: the token is expired or
 * revoked, so the AuthProvider signs the user out instead of leaving the app in a "live"
 * mode where every request fails. Registered by AuthProvider.
 */
let onUnauthorized: ((err: ApiError) => void) | null = null;
export const setUnauthorizedHandler = (fn: ((err: ApiError) => void) | null) => {
  onUnauthorized = fn;
};

/** Retry-After is either delta-seconds or an HTTP date. */
function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

export type ApiInit = { method?: string; body?: unknown; timeoutMs?: number; headers?: Record<string, string> };

/** JSON fetch against the Run Module backend with the bearer token attached. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'API not configured (demo mode)');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  const sentToken = token;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
        ...(init.headers ?? {}),
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
      const msg = (json as { message?: string; error?: string } | undefined)?.message ?? (json as { error?: string } | undefined)?.error ?? res.statusText;
      const err = new ApiError(res.status, msg, json, parseRetryAfter(res.headers.get('Retry-After')));
      // Only react to a 401 for the token that's still current (a sign-out may have raced us).
      if (res.status === 401 && sentToken && sentToken === token) {
        token = null;
        onUnauthorized?.(err);
      }
      throw err;
    }
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}
