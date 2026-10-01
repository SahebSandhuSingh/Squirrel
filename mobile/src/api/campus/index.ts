/**
 * Entry point for the campus social backend. Screens import `campusApi` from here and never
 * call fetch themselves.
 *
 *   live  → REST (api/campus/http.ts) against CAMPUS_API_URL
 *   off   → no campus backend configured: every call rejects with "not live yet"; screens show
 *           that state, never fake data. There is no mock or simulated backend in any build.
 *
 * On top of the source, availability is decided PER ENDPOINT (api/availability.ts): the seven
 * campus endpoints with no backend yet reject with EndpointUnavailableError in every mode, while
 * the rest of the service keeps working. One missing endpoint never takes down another.
 */
import { EndpointUnavailableError, gateEndpoints, isEndpointUnavailable } from '@/api/availability';
import { ApiError, getApiToken } from '@/api/client';
import { CAMPUS_API_CONFIGURED, REALTIME_URL } from '@/api/config';
import { httpCampusApi } from '@/api/campus/http';
import type { CampusApi, RealtimeMessage } from '@/api/campus/types';

/**
 * 'mock' is never produced any more (the dev mock was removed); it stays in the type only so the
 * Run Module's existing `CAMPUS_SOURCE === 'mock'` check keeps compiling unchanged (it's always false).
 */
export type CampusSource = 'live' | 'mock' | 'off';

export const CAMPUS_SOURCE: CampusSource = CAMPUS_API_CONFIGURED ? 'live' : 'off';

export const NOT_LIVE = 'not_live';

const offApi: CampusApi = new Proxy({} as CampusApi, {
  get: () => () => Promise.reject(new ApiError(0, 'Campus features aren’t live yet', { code: NOT_LIVE, detail: 'Campus features aren’t live yet' })),
});

const sourceApi: CampusApi = CAMPUS_SOURCE === 'live' ? httpCampusApi : offApi;

/** Method → capability for every endpoint that isn't built yet. Everything unlisted passes through. */
export const campusApi: CampusApi = gateEndpoints(sourceApi, {
  sharedZones: { capability: 'sharedZones' },
  heatmap: { capability: 'heatmap' },
  dateSuggestions: { capability: 'dateSuggestions' },
  dismissDateSuggestion: { capability: 'dateSuggestions' },
  inviteFromSuggestion: { capability: 'dateSuggestions' },
  createUpload: { capability: 'media' },
  completeUpload: { capability: 'media' },
  media: { capability: 'media' },
  meetupRating: { capability: 'meetupRating' },
  rateMeetup: { capability: 'meetupRating' },
  ambassador: { capability: 'ambassador' },
  applyAmbassador: { capability: 'ambassador' },
  // PATCH /v1/me itself is live; only the profile_details field has no backend yet.
  updateMe: { capability: 'profileDetails', when: (patch) => patch.profile_details !== undefined },
});

export { EndpointUnavailableError, isEndpointUnavailable };
export { CAPABILITY_LABEL, endpointAvailability, isEndpointAvailable, type Capability } from '@/api/availability';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ErrorKind = 'offline' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'not_live' | 'server';

export function errorKind(e: unknown): ErrorKind {
  if (isEndpointUnavailable(e)) return 'not_live';
  if (!(e instanceof ApiError)) return 'server';
  const code = errorCode(e);
  if (code === NOT_LIVE) return 'not_live';
  if (e.status === 0) return 'offline';
  if (e.status === 401) return 'unauthorized';
  if (e.status === 403) return 'forbidden';
  if (e.status === 404) return 'not_found';
  if (e.status === 409) return 'conflict';
  if (e.status === 422 || e.status === 400) return 'invalid';
  return 'server';
}

export function errorCode(e: unknown): string | null {
  const b = e instanceof ApiError ? (e.body as { code?: unknown } | undefined) : undefined;
  return typeof b?.code === 'string' ? b.code : null;
}

/**
 * A feature whose backend isn't there yet: campus off, the route not deployed (404 without a
 * resource code), 501, or 503 with an "unavailable" code. Screens show an unavailable state
 * for these instead of an error — and never pretend the feature works.
 */
export function featureUnavailable(e: unknown): boolean {
  const kind = errorKind(e);
  if (kind === 'not_live') return true;
  if (!(e instanceof ApiError)) return false;
  const code = errorCode(e);
  if (e.status === 404) return code == null || code === 'no_route';
  if (e.status === 501) return true;
  return e.status === 503 && !!code && code.endsWith('unavailable');
}

export function errorText(e: unknown): string {
  switch (errorKind(e)) {
    case 'offline':
      return e instanceof ApiError && e.message === 'Request timed out' ? 'That took too long. Check your connection and try again.' : 'You’re offline. Check your connection and try again.';
    case 'unauthorized':
      return 'Your session expired. Sign in again.';
    case 'not_live':
      return isEndpointUnavailable(e) ? `${e.message}.` : 'Campus features aren’t live yet.';
    default:
      return e instanceof Error && e.message ? e.message : 'Something went wrong.';
  }
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

type Handler = (m: RealtimeMessage) => void;
const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let socketUrl: string | null = REALTIME_URL || null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** How live updates arrive: a socket, or refresh-on-focus (no push channel). */
export function realtimeMode(): 'socket' | 'focus' {
  return socketUrl ? 'socket' : 'focus';
}

/** The backend's /v1/config may announce the socket URL; call this once it's known. */
export function setRealtimeUrl(url: string | null) {
  if (REALTIME_URL || !url || url === socketUrl) return;
  socketUrl = url;
  if (handlers.size) connect();
}

const dispatch = (m: RealtimeMessage) => handlers.forEach((h) => h(m));

function connect() {
  if (!socketUrl || socket || CAMPUS_SOURCE !== 'live') return;
  try {
    const ws = new WebSocket(socketUrl);
    socket = ws;
    ws.onopen = () => {
      retry = 0;
      const token = getApiToken();
      // Auth as the first frame so the token never lands in URLs or proxy logs.
      if (token) ws.send(JSON.stringify({ type: 'auth', token }));
      ws.send(JSON.stringify({ type: 'subscribe', topics: ['territories', 'stats', 'invites', 'events', 'active'] }));
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data)) as RealtimeMessage;
        if (m && typeof m.type === 'string') dispatch(m);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      socket = null;
      if (!handlers.size) return;
      // Back off 1s → 2s → … → 30s; never hammer the server.
      const wait = Math.min(30_000, 1000 * 2 ** retry++);
      retryTimer = setTimeout(connect, wait);
    };
    ws.onerror = () => ws.close();
  } catch {
    socket = null;
  }
}

function disconnect() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  socket?.close();
  socket = null;
}

/** Subscribe to live updates. The connection is shared and closes when nobody listens. */
export function subscribeRealtime(h: Handler): () => void {
  handlers.add(h);
  if (handlers.size === 1) connect();
  return () => {
    handlers.delete(h);
    if (!handlers.size) disconnect();
  };
}

export { CAMPUS_ROUTES } from '@/api/campus/http';
export type * from '@/api/campus/types';
