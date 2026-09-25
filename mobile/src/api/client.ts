import { API_URL } from '@/api/config';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};

/** JSON fetch against the Run Module backend with the bearer token attached. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'API not configured (demo mode)');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new ApiError(res.status, (json as { message?: string })?.message ?? res.statusText, json);
    return json as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}
