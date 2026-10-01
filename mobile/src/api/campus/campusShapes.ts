/**
 * campus-service → campus contract (api/campus/types.ts): the shape mapping, and the routing that
 * decides which backend answers each contract method.
 *
 * Ownership (docs/decisions/ADR-032-service-ownership.md): campus-service owns the map world (zones,
 * territory and claim / steal / defend, activities → zone eligibility, map players and presence,
 * Active now, Open to Meet, shared zones, the heatmap) and meetups with their post-meetup rating.
 * Everything else stays with the Social service (or the campus backend / "not live yet" below it).
 * User ids are the same on both (campus-service returns Social profile ids and Social names when its
 * identity bridge is on), so nothing here translates ids.
 *
 * Precedence per method: campus-service (for CAMPUS_SERVICE_METHODS, when configured) > the Social
 * adapter (for the methods it implements, when configured) > the campus backend (http.ts) or "off".
 *
 * Kept free of runtime imports so it can be unit-tested directly (api/campusService.test.mjs).
 */
import type { Capability } from '@/api/availability';
import type * as T from '@/api/campus/types';

/** Contract methods served by campus-service when it's configured. Everything else goes below it. */
export const CAMPUS_SERVICE_METHODS = [
  // the map / territory world
  'zones',
  'territories',
  'zone',
  'territoryAction',
  'submitActivity',
  'activityZones',
  'mapFeatures',
  'nearbyPlayers',
  'updatePresence',
  'activeNow',
  'setOpenToMeet',
  'sharedZones',
  'heatmap',
  'sharedContext',
  // meetups + post-meetup rating (ADR-032)
  'meetups',
  'meetup',
  'checkIn',
  'meetupRating',
  'rateMeetup',
] as const satisfies readonly (keyof T.CampusApi)[];

export type CampusServiceMethod = (typeof CAMPUS_SERVICE_METHODS)[number];

/** What the router needs from campus-service: the routed methods (already in contract shape) plus raw config / stats / Open to Meet. */
export type CampusServicePart = Pick<T.CampusApi, CampusServiceMethod> & {
  rawConfig(): Promise<CampusConfig>;
  rawStats(): Promise<CampusStats>;
  /** campus-service's own `open_to_meet` (it owns Open to Meet). */
  openToMeet(): Promise<boolean>;
};

/**
 * Capabilities a configured backend actually serves, so they count as available without an env
 * opt-in (and aren't gated): the Social service serves photo uploads; campus-service serves shared
 * zones (GET /v1/me/shared-zones) and the heatmap (GET /v1/map/heatmap).
 *
 * NOT here, on purpose: `meetupRating` — campus-service's API reference (campus-service/docs/API.md)
 * doesn't document the rating routes yet, so it stays gated even though it's routed there; and
 * `meetupCheckIn` — campus-service documents no check-in route (only `meetup.check_in` as a reserved
 * notification). Opt either in with EXPO_PUBLIC_LIVE_ENDPOINTS once campus-service serves
 * GET /v1/meetups/{id}/rating + POST /v1/meetups/{id}/ratings, and POST /v1/meetups/{id}/check-in.
 */
export function servedCapabilities(s: { social: boolean; campusService: boolean }): Set<Capability> {
  const out = new Set<Capability>();
  if (s.social) out.add('media');
  if (s.campusService) {
    out.add('sharedZones');
    out.add('heatmap');
  }
  return out;
}

/** Gate rules minus the capabilities a configured backend serves: those pass straight through. */
export function withoutServed<R extends Record<string, { capability: Capability } | undefined>>(rules: R, served: Set<Capability>): R {
  return Object.fromEntries(Object.entries(rules).filter(([, r]) => r && !served.has(r.capability))) as R;
}

/** Where a meetup screen's data comes from. */
export type MeetupPath = 'campus_service' | 'social' | 'campus';

/**
 * Meetups listed by the app (Meetups screen, notifications) come from whoever serves `meetups`. An
 * event's own check-in (Event → "Meetup check-in") is the events backend's: the Social service's
 * event check-in, never campus-service, whose meetups are a different thing (host + invitees).
 */
export function meetupPathFor(s: { fromEvent: boolean; social: boolean; campusService: boolean }): MeetupPath {
  if (s.campusService && !s.fromEvent) return 'campus_service';
  return s.social ? 'social' : 'campus';
}

// ---------------------------------------------------------------------------
// Wire shapes (only the fields read here; see campus-service/docs/API.md)
// ---------------------------------------------------------------------------

/** GET /v1/config. Its `campus` / `features` / `realtime_url` follow the app's AppConfig. */
export type CampusConfig = {
  campus?: (Partial<T.Campus> & { max_radius_m?: number | null }) | null;
  features?: Partial<T.AppConfig['features']> | null;
  realtime_url?: string | null;
};
/** GET /v1/campus/stats (the app's LaunchStats, plus extra counters the app ignores). */
export type CampusStats = Partial<T.LaunchStats>;

type CampusPerson = { user_id: string; display_name: string; avatar_url: string | null; hostel: string | null; connection_mode?: T.ConnectionMode | null; bio?: string | null };

type CampusActiveRow = { person: CampusPerson; activity: T.ActivePerson['activity']; proximity: T.Proximity | null };
export type CampusActiveNow = { active_now: number; active: CampusActiveRow[]; nearby: CampusActiveRow[]; as_of: string };

export type CampusSharedZones = {
  zones: { zone: { id: string; name: string; kind?: string }; people: (CampusPerson & { activity?: 'sometimes' | 'often' })[] }[];
};

export type CampusHeatmap = {
  window?: string;
  grid_size_m?: number;
  suppression_threshold_users?: number;
  cells: { center: { lat: number; lng: number } | T.LatLng; intensity: 'low' | 'medium' | 'high' | (string & {}) }[];
};

type GeoPolygon = { type: string; coordinates: number[][][] };
export type CampusMapFeatures = T.MapFeatures | { type: 'FeatureCollection'; features: { id?: string | number; geometry?: GeoPolygon | null; properties?: Record<string, unknown> | null }[] };

/** A campus-service meetup (GET /v1/meetups, GET /v1/meetups/{id}). */
export type CampusMeetup = {
  id: string;
  created_by: string;
  zone_id: string | null;
  zone: { id: string; name: string } | null;
  place_text: string | null;
  starts_at: string;
  status: 'proposed' | 'confirmed' | 'cancelled' | 'completed';
  participants: { user_id: string; role: 'host' | 'guest'; status: 'invited' | 'accepted' | 'declined'; responded_at: string | null; person: (T.PersonLite & { open_to_meet?: boolean }) | null }[];
};

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const HIDDEN_REASON: Record<string, string> = {
  open_to_meet_off: 'Turn on Open to Meet to see Squirrels near you.',
};
/** campus-service sends a code (`open_to_meet_off`); the map shows the text as a banner. */
export const hiddenReasonText = (r: string | null | undefined): string | null => (r ? (HIDDEN_REASON[r] ?? r) : null);

export function nearbyPlayersFromCampus(raw: T.NearbyPlayers): T.NearbyPlayers {
  return { ...raw, players: raw.players ?? [], hidden_reason: hiddenReasonText(raw.hidden_reason) };
}

export const NOTHING_SHARED = (): T.SharedContext => ({ shared_zones: [], shared_crews: [], shared_events: [], icebreakers: [] });

function personCard(p: CampusPerson): T.PersonCard {
  return {
    user_id: p.user_id,
    display_name: p.display_name,
    avatar_url: p.avatar_url ?? null,
    hostel: p.hostel ?? null,
    connection_mode: p.connection_mode ?? null,
    bio: p.bio ?? null,
    // campus-service sends no activity summary or shared context on these cards: null / empty, never invented.
    activity: null,
    shared: NOTHING_SHARED(),
    match_reason: null,
  };
}

/** Active now: campus-service's person is a PersonLite + mode/bio; the app's card needs the rest. */
export function activeNowFromCampus(raw: CampusActiveNow): T.ActiveNow {
  const row = (a: CampusActiveRow): T.ActivePerson => ({ person: personCard(a.person), activity: a.activity ?? null, proximity: a.proximity ?? null });
  return { active_now: raw.active_now ?? 0, active: (raw.active ?? []).map(row), nearby: (raw.nearby ?? []).map(row), as_of: raw.as_of };
}

/**
 * Shared zones: campus-service groups by zone ({ zones: [{ zone, people[] }] }); the app lists
 * people ({ people: [{ person, shared_zones_count, top_zone }] }). The top zone is one where they
 * are active "often" when there is one. Most shared zones first.
 */
export function sharedZonesFromCampus(raw: CampusSharedZones): T.SharedZonesIndex {
  const byPerson = new Map<string, { row: T.SharedZonesPerson; best: number }>();
  for (const z of raw.zones ?? []) {
    for (const p of z.people ?? []) {
      let e = byPerson.get(p.user_id);
      if (!e) {
        e = { row: { person: { user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url ?? null, hostel: p.hostel ?? null }, shared_zones_count: 0, top_zone: null }, best: 0 };
        byPerson.set(p.user_id, e);
      }
      e.row.shared_zones_count += 1;
      const score = p.activity === 'often' ? 2 : 1;
      if (score > e.best) {
        e.best = score;
        e.row.top_zone = { zone_id: z.zone.id, zone_name: z.zone.name };
      }
    }
  }
  const people = [...byPerson.values()].map((e) => e.row).sort((a, b) => b.shared_zones_count - a.shared_zones_count || a.person.display_name.localeCompare(b.person.display_name));
  return { people, visible: true, hidden_reason: null };
}

/** campus-service aggregates 7 days (and 30, which the app doesn't offer); the app's 1h / 24h have no data there. */
export const CAMPUS_HEAT_WINDOWS: T.HeatWindow[] = ['7d'];
export const campusSupportsHeatWindow = (w: T.HeatWindow) => CAMPUS_HEAT_WINDOWS.includes(w);

const HEAT_LEVEL: Record<string, T.HeatLevel> = { low: 'low', medium: 'active', high: 'high' };
const HEAT_INTENSITY: Record<T.HeatLevel, number> = { low: 0.33, active: 0.66, high: 1 };

/** A window campus-service doesn't aggregate: say so instead of showing another window's data. */
export function heatWindowUnavailable(window: T.HeatWindow, now = new Date().toISOString()): T.Heatmap {
  return { available: false, reason: 'Campus heat covers the last 7 days. Switch to This week.', window, generated_at: now, cells: [], min_people_per_cell: null };
}

/**
 * Heatmap: campus-service sends `{ window, grid_size_m, suppression_threshold_users, cells: [{ center: {lat,lng},
 * intensity: 'low'|'medium'|'high' }] }`; the app draws `HeatCell`s (LatLng centre, radius, 0..1 intensity, level).
 */
export function heatmapFromCampus(raw: CampusHeatmap, window: T.HeatWindow, now = new Date().toISOString()): T.Heatmap {
  const grid = raw.grid_size_m ?? 100;
  const cells = (raw.cells ?? []).map((c): T.HeatCell => {
    const center: T.LatLng = Array.isArray(c.center) ? c.center : [c.center.lat, c.center.lng];
    const level = HEAT_LEVEL[c.intensity] ?? 'low';
    // A glow that covers its grid cell (half-diagonal ≈ 0.71 × side).
    return { id: `${center[0].toFixed(5)},${center[1].toFixed(5)}`, center, radius_m: Math.round(grid * 0.75), intensity: HEAT_INTENSITY[level], level, zone_id: null };
  });
  return { available: true, reason: null, window: raw.window ?? window, generated_at: now, cells, min_people_per_cell: raw.suppression_threshold_users ?? null };
}

/**
 * Map features: campus-service's `/v1/map/features` is a GeoJSON FeatureCollection of its zones — no
 * roads, buildings, terrain or POIs. The zones themselves come from GET /v1/zones, so the base-map
 * arrays come back empty (the Map draws the live zones on plain ground). A server that already
 * speaks the contract passes through.
 */
export function mapFeaturesFromCampus(raw: CampusMapFeatures): T.MapFeatures {
  if ('roads' in raw && Array.isArray(raw.roads)) return raw;
  return { roads: [], buildings: [], terrain: [], pois: [] };
}

/** The lower layer's config with campus-service's realtime URL and the flags it owns (territory, Open to Meet, meetup safety). */
export function mergeConfig(lower: T.AppConfig, campus: CampusConfig | null): T.AppConfig {
  if (!campus) return lower;
  const f = campus.features ?? {};
  return {
    ...lower,
    features: {
      ...lower.features,
      defend: f.defend ?? lower.features.defend,
      open_to_meet: f.open_to_meet ?? lower.features.open_to_meet,
      meetup_safety_notifications: f.meetup_safety_notifications ?? lower.features.meetup_safety_notifications,
    },
    realtime_url: campus.realtime_url ?? lower.realtime_url,
  };
}

/** campus-service's config on its own (nothing below it answers): only when it's complete. */
export function configFromCampus(c: CampusConfig): T.AppConfig | null {
  const campus = c.campus;
  const f = c.features;
  if (!campus?.id || !campus.name || !Array.isArray(campus.center) || !f) return null;
  return {
    campus: { id: campus.id, name: campus.name, short_name: campus.short_name ?? campus.name, email_domains: campus.email_domains ?? [], courses: campus.courses, center: campus.center, launched_at: campus.launched_at ?? null },
    features: {
      create_crew: !!f.create_crew,
      create_event: !!f.create_event,
      defend: !!f.defend,
      open_to_meet: !!f.open_to_meet,
      date_mode: f.date_mode ?? { available: false, reason: null, requirements: [] },
      meetup_safety_notifications: !!f.meetup_safety_notifications,
    },
    realtime_url: c.realtime_url ?? null,
  };
}

/** The lower layer's stats with campus-service's zone counts. */
export function mergeStats(lower: T.LaunchStats, campus: CampusStats | null): T.LaunchStats {
  if (!campus) return lower;
  return { ...lower, zones_total: campus.zones_total ?? lower.zones_total, zones_claimed: campus.zones_claimed ?? lower.zones_claimed };
}

/** campus-service's stats on their own (nothing below it answers). Missing counters are null, never 0. */
export function statsFromCampus(c: CampusStats, now = new Date().toISOString()): T.LaunchStats {
  return {
    users_total: c.users_total ?? 0,
    users_active_now: c.users_active_now ?? null,
    zones_total: c.zones_total ?? null,
    zones_claimed: c.zones_claimed ?? null,
    crews_total: c.crews_total ?? null,
    founding_spots_left: c.founding_spots_left ?? null,
    updated_at: c.updated_at ?? now,
  };
}

/** campus-service doesn't run a check-in window; the app opens it an hour before the start and closes it six hours after (as with Social). */
const CHECK_IN_OPENS_BEFORE_MS = 3600_000;
const CHECK_IN_CLOSES_AFTER_MS = 6 * 3600_000;

/**
 * A campus-service meetup → the app's Meetup. Title: who you're meeting ("Meetup with Aanya & Ravi").
 * Attendees: everyone who hasn't declined. campus-service records no check-ins, so nobody shows as
 * checked in.
 */
export function meetupFromCampus(m: CampusMeetup, meId: string | null): T.Meetup {
  const going = (m.participants ?? []).filter((p) => p.status !== 'declined');
  const others = going.filter((p) => p.user_id !== meId).map((p) => p.person?.display_name).filter((n): n is string => !!n);
  const where = m.zone?.name ?? m.place_text ?? null;
  const title = others.length ? `Meetup with ${others.length > 2 ? `${others.slice(0, 2).join(', ')} +${others.length - 2}` : others.join(' & ')}` : where ? `Meetup at ${where}` : 'Meetup';
  const start = Date.parse(m.starts_at);
  return {
    id: m.id,
    title,
    starts_at: m.starts_at,
    location: { name: where ?? 'On campus', zone_id: m.zone_id ?? m.zone?.id ?? null },
    event_id: null,
    attendees: going.map((p) => ({ user_id: p.user_id, display_name: p.person?.display_name ?? 'Squirrel', avatar_url: p.person?.avatar_url ?? null, hostel: p.person?.hostel ?? null, checked_in: false })),
    my_check_in_at: null,
    check_in_opens_at: new Date(start - CHECK_IN_OPENS_BEFORE_MS).toISOString(),
    check_in_closes_at: new Date(start + CHECK_IN_CLOSES_AFTER_MS).toISOString(),
  };
}

/** Meetups list: not cancelled, and not ones you declined or left. */
export function meetupsFromCampus(list: CampusMeetup[], meId: string | null): T.Meetup[] {
  return (list ?? []).filter((m) => m.status !== 'cancelled' && !(meId && m.participants?.some((p) => p.user_id === meId && p.status === 'declined'))).map((m) => meetupFromCampus(m, meId));
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * `top`'s methods over `base`'s (a Proxy, never a spread copy: `base` may be the "off" Proxy, which
 * has no own keys).
 */
export function overlayApi(base: T.CampusApi, top: Partial<T.CampusApi>): T.CampusApi {
  return new Proxy(base, { get: (t, k: string) => (top as Record<string, unknown>)[k] ?? (t as unknown as Record<string, unknown>)[k] });
}

/**
 * campus-service over the lower layer: CAMPUS_SERVICE_METHODS go to campus-service, everything else to
 * `lower`. Config / stats / me are the lower layer's with what campus-service owns merged in (its
 * realtime URL and flags, zone counts, Open to Meet); when nothing below answers, campus-service's own
 * config / stats stand in. Built with Object.create, never a spread copy (see overlayApi).
 */
export function makeHybridCampusApi(lower: T.CampusApi, campus: CampusServicePart): T.CampusApi {
  const out = Object.create(lower) as T.CampusApi;
  const own = out as unknown as Record<string, unknown>;
  for (const key of CAMPUS_SERVICE_METHODS) own[key] = campus[key];
  out.config = async () => {
    const [l, c] = await Promise.allSettled([lower.config(), campus.rawConfig()]);
    const cc = c.status === 'fulfilled' ? c.value : null;
    if (l.status === 'fulfilled') return mergeConfig(l.value, cc);
    const alone = cc && configFromCampus(cc);
    if (alone) return alone;
    throw l.reason;
  };
  out.stats = async () => {
    const [l, c] = await Promise.allSettled([lower.stats(), campus.rawStats()]);
    const cs = c.status === 'fulfilled' ? c.value : null;
    if (l.status === 'fulfilled') return mergeStats(l.value, cs);
    if (cs) return statsFromCampus(cs);
    throw l.reason;
  };
  // Open to Meet lives on campus-service, so the profile's switch reads it from there.
  const withOpenToMeet = async (me: Promise<T.Me>): Promise<T.Me> => {
    const [m, open] = await Promise.all([me, campus.openToMeet().catch(() => null)]);
    return open == null ? m : { ...m, open_to_meet: open };
  };
  out.me = () => withOpenToMeet(lower.me());
  out.updateMe = (patch) => withOpenToMeet(lower.updateMe(patch));
  return out;
}

/**
 * The whole precedence in one place: campus-service (its methods, when configured) > the Social
 * adapter (its methods, when configured) > `base` (the campus backend over REST, or "off").
 */
export function composeCampusApi(base: T.CampusApi, social: Partial<T.CampusApi> | null, campus: CampusServicePart | null): T.CampusApi {
  const lower = social ? overlayApi(base, social) : base;
  return campus ? makeHybridCampusApi(lower, campus) : lower;
}

// ---------------------------------------------------------------------------
// GPS upload: honour campus-service's ingest rules (campus-service/docs/API.md → GPS validation)
// ---------------------------------------------------------------------------

/**
 * campus-service rejects a WHOLE upload (422 invalid_gps) for one fix it can't accept: an
 * "impossible jump" (> 30 m/s between consecutive points), a point outside the campus area, or
 * timestamps going backwards. Before uploading, drop exactly those fixes; keep everything else.
 * The server's checks are its anti-cheat and are not relaxed.
 */
export const CAMPUS_MAX_POINTS = 20_000;
const SAFE_SPEED_MS = 25; // the server's hard limit is 30 m/s
const SAFE_EDGE_M = 50; // stay this far inside the announced radius
const MAX_ACCURACY_M = 100;

export type IngestArea = { center: [number, number]; maxRadiusM: number } | null;

export function ingestAreaOf(c: CampusConfig | null | undefined): IngestArea {
  const center = c?.campus?.center;
  const r = c?.campus?.max_radius_m;
  return Array.isArray(center) && center.length === 2 && typeof r === 'number' && r > SAFE_EDGE_M ? { center: [center[0], center[1]], maxRadiusM: r } : null;
}

const distanceM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

/** The points campus-service will accept, in order, and how many were dropped. */
export function pointsForCampus(points: readonly T.ActivityPoint[], area: IngestArea): { points: T.ActivityPoint[]; dropped: number } {
  const kept: T.ActivityPoint[] = [];
  let lastT = -Infinity;
  for (const p of points) {
    const t = Date.parse(p.recorded_at);
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !Number.isFinite(t) || !(p.accuracy_m <= MAX_ACCURACY_M)) continue;
    if (area && distanceM(area.center[0], area.center[1], p.lat, p.lng) > area.maxRadiusM - SAFE_EDGE_M) continue;
    if (t <= lastT) continue;
    const prev = kept[kept.length - 1];
    if (prev && distanceM(prev.lat, prev.lng, p.lat, p.lng) / ((t - lastT) / 1000) > SAFE_SPEED_MS) continue;
    kept.push(p);
    lastT = t;
  }
  let out = kept;
  if (out.length > CAMPUS_MAX_POINTS) {
    // Evenly thin a very long recording, always keeping the last fix.
    const step = out.length / CAMPUS_MAX_POINTS;
    out = Array.from({ length: CAMPUS_MAX_POINTS - 1 }, (_, i) => kept[Math.floor(i * step)]!).concat(kept[kept.length - 1]!);
  }
  return { points: out, dropped: points.length - out.length };
}
