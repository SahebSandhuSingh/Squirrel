/**
 * Entry point for the campus social backend. Screens import `campusApi` from here and never
 * call fetch themselves.
 *
 *   live  → per method, the first of (api/campus/campusShapes.ts → composeCampusApi):
 *             1. campus-service (api/campus/campusService.ts) for the map world + meetups, when
 *                EXPO_PUBLIC_CAMPUS_SERVICE_URL is set (CAMPUS_SERVICE_METHODS)
 *             2. the Social service (api/campus/socialAdapter.ts) for the features it implements
 *             3. REST (api/campus/http.ts) against CAMPUS_API_URL — or "off" when that isn't set
 *   off   → no campus backend configured: every call rejects with "not live yet"; screens show
 *           that state, never fake data. There is no mock or simulated backend in any build.
 *
 * On top of the source, availability is decided PER ENDPOINT (api/availability.ts): campus
 * endpoints with no backend yet reject with EndpointUnavailableError in every mode, while the rest
 * of the service keeps working. One missing endpoint never takes down another.
 */
import { EndpointUnavailableError, gateEndpoints, endpointAvailability as baseEndpointAvailability, isEndpointUnavailable, type Capability, type GateRule } from '@/api/availability';
import { ApiError, getApiToken } from '@/api/client';
import { CAMPUS_API_CONFIGURED, CAMPUS_SERVICE_CONFIGURED, CAMPUS_SERVICE_URL, REALTIME_URL, SOCIAL_API_CONFIGURED } from '@/api/config';
import { composeCampusApi, meetupPathFor, servedCapabilities, withoutServed, type MeetupPath } from '@/api/campus/campusShapes';
import { makeCampusServiceApi } from '@/api/campus/campusService';
import { httpCampusApi } from '@/api/campus/http';
import { socialCampusApi } from '@/api/campus/socialAdapter';
import type { CampusApi, HeatWindow, RealtimeMessage } from '@/api/campus/types';

/**
 * 'mock' is never produced any more (the dev mock was removed); it stays in the type only so the
 * Run Module's existing `CAMPUS_SOURCE === 'mock'` check keeps compiling unchanged (it's always false).
 */
export type CampusSource = 'live' | 'mock' | 'off';

/** 'live' once any real backend serves campus features: campus-service, the campus backend and/or the Social service. */
export const CAMPUS_SOURCE: CampusSource = CAMPUS_SERVICE_CONFIGURED || CAMPUS_API_CONFIGURED || SOCIAL_API_CONFIGURED ? 'live' : 'off';

/** campus-service serves the map world and meetups (EXPO_PUBLIC_CAMPUS_SERVICE_URL is set). */
export const CAMPUS_ON_SERVICE = CAMPUS_SERVICE_CONFIGURED;

export const NOT_LIVE = 'not_live';

const offApi: CampusApi = new Proxy({} as CampusApi, {
  get: () => () => Promise.reject(new ApiError(0, 'Campus features aren’t live yet', { code: NOT_LIVE, detail: 'Campus features aren’t live yet' })),
});

const baseApi: CampusApi = CAMPUS_API_CONFIGURED ? httpCampusApi : offApi;
const socialPart = SOCIAL_API_CONFIGURED ? socialCampusApi : null;

/** Everything below campus-service: the Social adapter over the campus backend (or "off"). Events live here. */
const lowerApi: CampusApi = composeCampusApi(baseApi, socialPart, null);
const sourceApi: CampusApi = CAMPUS_SERVICE_CONFIGURED ? composeCampusApi(baseApi, socialPart, makeCampusServiceApi(CAMPUS_SERVICE_URL)) : lowerApi;

/** Capabilities a configured backend serves (Social: photo uploads; campus-service: shared zones, heatmap). */
const SERVED = servedCapabilities({ social: SOCIAL_API_CONFIGURED, campusService: CAMPUS_SERVICE_CONFIGURED });

type Rules = { [K in keyof CampusApi]?: GateRule<CampusApi[K]> };
/** Method → capability for every endpoint that isn't built yet. Everything unlisted passes through. */
const RULES: Rules = {
  sharedZones: { capability: 'sharedZones' },
  heatmap: { capability: 'heatmap' },
  dateSuggestions: { capability: 'dateSuggestions' },
  dismissDateSuggestion: { capability: 'dateSuggestions' },
  inviteFromSuggestion: { capability: 'dateSuggestions' },
  createUpload: { capability: 'media' },
  completeUpload: { capability: 'media' },
  media: { capability: 'media' },
  // Routed to campus-service when it's configured (it owns meetup rating, ADR-032), but its API
  // reference doesn't document the routes yet: campus-service must serve GET /v1/meetups/{id}/rating
  // and POST /v1/meetups/{id}/ratings before 'meetupRating' is opted in.
  meetupRating: { capability: 'meetupRating' },
  rateMeetup: { capability: 'meetupRating' },
  ambassador: { capability: 'ambassador' },
  applyAmbassador: { capability: 'ambassador' },
  // PATCH /v1/me itself is live; only the profile_details field has no backend yet.
  updateMe: { capability: 'profileDetails', when: (patch) => patch.profile_details !== undefined },
};
/** Only campus-service's check-in is gated (the Social service's event check-in is live): it must serve POST /v1/meetups/{id}/check-in. */
const CAMPUS_SERVICE_RULES: Rules = { checkIn: { capability: 'meetupCheckIn' } };

/** The rules minus what's served: a served capability passes straight through, like 'media' on Social. */
const gate = (api: CampusApi, rules: Rules): CampusApi => gateEndpoints(api, withoutServed(rules, SERVED));

export const campusApi: CampusApi = gate(sourceApi, CAMPUS_SERVICE_CONFIGURED ? { ...RULES, ...CAMPUS_SERVICE_RULES } : RULES);

/**
 * Meetups shown from an event (Event → "Meetup check-in") belong to the events backend (the Social
 * service, else the campus backend); every other meetup comes from `campusApi` (campus-service when
 * configured). `path` tells the screen whose check-in semantics apply: 'social' → tell up to five
 * friends; otherwise → notify your safety contact.
 */
const eventMeetupApi: CampusApi = CAMPUS_SERVICE_CONFIGURED ? gate(lowerApi, RULES) : campusApi;
export function meetupApiFor(fromEvent: boolean): { api: Pick<CampusApi, 'meetup' | 'checkIn'>; path: MeetupPath } {
  const path = meetupPathFor({ fromEvent, social: SOCIAL_API_CONFIGURED, campusService: CAMPUS_SERVICE_CONFIGURED });
  return { api: path === 'campus_service' ? campusApi : eventMeetupApi, path };
}

/** The heatmap window to open on: campus-service aggregates the last 7 days only. */
export const DEFAULT_HEAT_WINDOW: HeatWindow = CAMPUS_SERVICE_CONFIGURED ? '7d' : '24h';

export { EndpointUnavailableError, isEndpointUnavailable };
export { CAPABILITY_LABEL, type Capability } from '@/api/availability';

/** Availability as the campus API sees it: what a configured backend serves counts as available. */
export const endpointAvailability = (c: Capability, opted?: Set<Capability>) => (SERVED.has(c) ? ({ status: 'available' } as const) : baseEndpointAvailability(c, opted));
export const isEndpointAvailable = (c: Capability, opted?: Set<Capability>) => endpointAvailability(c, opted).status === 'available';

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
