/**
 * Endpoint availability — which backend capabilities exist yet, decided PER ENDPOINT, never per
 * service. A capability that isn't built rejects with `EndpointUnavailableError` in every mode
 * (live, dev mock, off): no fake success, no fabricated arrays. Everything else in the same
 * service keeps working.
 *
 * When a backend ships a capability, flip it in `BUILT` below — or, to try it without a code
 * change, list it in EXPO_PUBLIC_LIVE_ENDPOINTS (comma-separated, e.g. "heatmap,ambassador").
 * Built endpoints that turn out to be missing on the server (404 no_route / 501) are still
 * treated as unavailable by `featureUnavailable()` at runtime.
 *
 * Kept free of app imports so it can be unit-tested directly (availability.test.mjs).
 */

/** Campus endpoints with no backend yet (the seven + the ambassador waitlist), plus the shared-workout service. */
export type Capability =
  | 'sharedZones' // GET /v1/me/shared-zones
  | 'heatmap' // GET /v1/map/heatmap
  | 'dateSuggestions' // GET /v1/dates/suggestions, POST …/{id}/dismiss | invite
  | 'media' // POST /v1/media/uploads, PUT {upload_url}, POST /v1/media/{id}/complete, GET /v1/media/{id}
  | 'meetupRating' // GET /v1/meetups/{id}/rating, POST /v1/meetups/{id}/ratings
  | 'meetupCheckIn' // POST /v1/meetups/{id}/check-in on campus-service (Social's event check-in is live)
  | 'ambassador' // GET | POST /v1/ambassador/application
  | 'ambassadorWaitlist' // POST /v1/ambassador/waitlist
  | 'profileDetails' // PATCH /v1/me with `profile_details`
  | 'sharedWorkout'; // /v1/workout-sessions/* + workout.* realtime

export const CAPABILITY_LABEL: Record<Capability, string> = {
  sharedZones: 'Shared zones',
  heatmap: 'The activity heatmap',
  dateSuggestions: 'Squirrel Dates',
  media: 'Photo uploads',
  meetupRating: 'Meetup ratings',
  meetupCheckIn: 'Meetup check-in',
  ambassador: 'Ambassador applications',
  ambassadorWaitlist: 'The ambassador waitlist',
  profileDetails: 'Saving profile details',
  sharedWorkout: 'Shared workouts',
};

const SINGULAR = new Set<Capability>(['profileDetails', 'heatmap', 'ambassadorWaitlist', 'meetupCheckIn']);

/** Backend status in code. All false today: none of these endpoints exist yet. */
const BUILT: Record<Capability, boolean> = {
  sharedZones: false,
  heatmap: false,
  dateSuggestions: false,
  media: false,
  meetupRating: false,
  meetupCheckIn: false,
  ambassador: false,
  ambassadorWaitlist: false,
  profileDetails: false,
  sharedWorkout: false,
};

export function parseLiveEndpoints(raw: string | undefined): Set<Capability> {
  const known = new Set(Object.keys(BUILT));
  return new Set((raw ?? '').split(',').map((s) => s.trim()).filter((s): s is Capability => known.has(s)));
}
const OPTED_IN = parseLiveEndpoints(process.env.EXPO_PUBLIC_LIVE_ENDPOINTS);

export type EndpointAvailability = { status: 'available' } | { status: 'unavailable'; capability: Capability; reason: string };

export function endpointAvailability(c: Capability, opted: Set<Capability> = OPTED_IN): EndpointAvailability {
  return BUILT[c] || opted.has(c) ? { status: 'available' } : { status: 'unavailable', capability: c, reason: `${CAPABILITY_LABEL[c]} ${SINGULAR.has(c) ? 'isn’t' : 'aren’t'} live yet` };
}
export const isEndpointAvailable = (c: Capability, opted?: Set<Capability>) => endpointAvailability(c, opted).status === 'available';

/** The one "this capability isn't live yet" condition. Distinct from real errors (401/403/422/5xx/network). */
export class EndpointUnavailableError extends Error {
  readonly capability: Capability;
  readonly code: string;
  constructor(capability: Capability) {
    super(`${CAPABILITY_LABEL[capability]} ${SINGULAR.has(capability) ? 'isn’t' : 'aren’t'} live yet`);
    this.name = 'EndpointUnavailableError';
    this.capability = capability;
    this.code = `${capability}_unavailable`;
  }
}
export const isEndpointUnavailable = (e: unknown): e is EndpointUnavailableError => e instanceof EndpointUnavailableError || (e instanceof Error && e.name === 'EndpointUnavailableError');

/**
 * Wraps a service object: each method mapped to a capability rejects with
 * EndpointUnavailableError while that capability is unavailable; every other method is passed
 * through untouched. `when` lets a method gate only some calls (e.g. PATCH /v1/me only when it
 * carries `profile_details`).
 */
export type GateRule<A> = { capability: Capability; when?: (...args: A extends (...a: infer P) => unknown ? P : never) => boolean };
export function gateEndpoints<S extends object>(service: S, rules: { [K in keyof S]?: GateRule<S[K]> }, opted?: Set<Capability>): S {
  // A Proxy, not a copy: the service may itself be a Proxy with no own properties (the "campus
  // off" API), which a `{ ...service }` copy would silently turn into an empty object.
  const wrapped = new Map<PropertyKey, unknown>();
  return new Proxy(service, {
    get(target, key, receiver) {
      const original = Reflect.get(target, key, receiver);
      const rule = (rules as Record<PropertyKey, { capability: Capability; when?: (...a: unknown[]) => boolean } | undefined>)[key];
      if (!rule || typeof original !== 'function') return original;
      if (!wrapped.has(key)) {
        wrapped.set(key, (...args: unknown[]) =>
          !isEndpointAvailable(rule.capability, opted) && (!rule.when || rule.when(...args))
            ? Promise.reject(new EndpointUnavailableError(rule.capability))
            : (Reflect.get(target, key, receiver) as (...a: unknown[]) => unknown).apply(target, args),
        );
      }
      return wrapped.get(key);
    },
  });
}
