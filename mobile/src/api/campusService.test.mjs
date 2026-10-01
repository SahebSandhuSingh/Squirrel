import assert from 'node:assert/strict';
import test from 'node:test';
import { gateEndpoints, isEndpointUnavailable } from './availability.ts';
import {
  activeNowFromCampus,
  CAMPUS_MAX_POINTS,
  CAMPUS_SERVICE_METHODS,
  composeCampusApi,
  configFromCampus,
  heatmapFromCampus,
  heatWindowUnavailable,
  ingestAreaOf,
  mapFeaturesFromCampus,
  meetupFromCampus,
  meetupPathFor,
  meetupsFromCampus,
  mergeConfig,
  mergeStats,
  nearbyPlayersFromCampus,
  pointsForCampus,
  servedCapabilities,
  sharedZonesFromCampus,
  statsFromCampus,
  withoutServed,
} from './campus/campusShapes.ts';

const lowerConfig = {
  campus: { id: 'iiser-kolkata', name: 'IISER Kolkata', short_name: 'IISER K', email_domains: ['iiserkol.ac.in'], center: [22.96, 88.52], launched_at: null },
  features: { create_crew: true, create_event: true, defend: false, open_to_meet: false, date_mode: { available: false, reason: 'x', requirements: [] }, meetup_safety_notifications: false },
  realtime_url: null,
};
const lowerStats = { users_total: 40, users_active_now: 3, zones_total: null, zones_claimed: null, crews_total: 2, founding_spots_left: null, updated_at: 't' };

/** A stand-in layer: every method answers `<name>:<method>`. */
function fakeLayer(name, extra = {}) {
  return new Proxy({}, { get: (_t, key) => extra[key] ?? (async () => `${name}:${String(key)}`) });
}
/** A partial layer (like the Social adapter): only the listed methods. */
const partial = (name, methods) => Object.fromEntries(methods.map((m) => [m, async () => `${name}:${m}`]));
const off = new Proxy({}, { get: (_t, key) => () => Promise.reject(new Error(`off:${String(key)}`)) });

function fakeCampus(overrides = {}) {
  return {
    ...partial('campus', CAMPUS_SERVICE_METHODS),
    rawConfig: async () => ({ features: { defend: true, open_to_meet: true, meetup_safety_notifications: true, create_event: false }, realtime_url: 'wss://campus/v1/realtime' }),
    rawStats: async () => ({ zones_total: 12, zones_claimed: 5, users_total: 999 }),
    openToMeet: async () => true,
    ...overrides,
  };
}
const lowerWithMe = (name) =>
  fakeLayer(name, {
    config: async () => lowerConfig,
    stats: async () => lowerStats,
    me: async () => ({ user_id: 'u1', display_name: 'Aanya', open_to_meet: false }),
    updateMe: async () => ({ user_id: 'u1', display_name: 'Aanya', open_to_meet: false }),
  });

test('routing precedence: campus-service > Social > campus backend', async () => {
  const social = partial('social', ['crews', 'events', 'meetups', 'meetup', 'checkIn', 'zones', 'notifications']);
  const api = composeCampusApi(fakeLayer('http'), social, fakeCampus());
  // campus-service's methods win over Social's, even where Social has one (zones, meetups, checkIn).
  for (const m of CAMPUS_SERVICE_METHODS) assert.equal(await api[m](), `campus:${m}`, m);
  // Social's own methods win over the campus backend.
  for (const m of ['crews', 'events', 'notifications']) assert.equal(await api[m](), `social:${m}`, m);
  // Everything else falls through to the campus backend.
  for (const m of ['invites', 'squirrelBoard', 'zonePlayers', 'searchPeople', 'ambassador', 'dateSuggestions']) assert.equal(await api[m](), `http:${m}`, m);
});

test('routing: without campus-service, meetups and the map world stay with Social / the campus backend', async () => {
  const api = composeCampusApi(fakeLayer('http'), partial('social', ['meetups', 'checkIn']), null);
  assert.equal(await api.meetups(), 'social:meetups');
  assert.equal(await api.checkIn(), 'social:checkIn');
  assert.equal(await api.zones(), 'http:zones');
  const bare = composeCampusApi(fakeLayer('http'), null, null);
  assert.equal(await bare.meetups(), 'http:meetups');
});

test('routing over the "off" Proxy keeps every method (no spread copy)', async () => {
  const api = composeCampusApi(off, null, fakeCampus());
  assert.equal(typeof api.crews, 'function');
  await assert.rejects(api.crews(), /off:crews/);
  assert.equal(await api.zones(), 'campus:zones');
  assert.equal(await api.meetup(), 'campus:meetup');
  const withSocial = composeCampusApi(off, partial('social', ['crews']), fakeCampus());
  assert.equal(await withSocial.crews(), 'social:crews');
  await assert.rejects(withSocial.invites(), /off:invites/);
});

test('the routed methods are the 14 map-world methods plus meetups and rating', () => {
  assert.equal(CAMPUS_SERVICE_METHODS.length, 19);
  for (const m of ['meetups', 'meetup', 'checkIn', 'meetupRating', 'rateMeetup', 'sharedContext', 'heatmap', 'activityZones']) assert.ok(CAMPUS_SERVICE_METHODS.includes(m), m);
  for (const m of ['crews', 'events', 'me', 'config', 'zonePlayers', 'createUpload']) assert.ok(!CAMPUS_SERVICE_METHODS.includes(m), m);
});

test('config: lower config + campus realtime_url and the flags campus-service owns; lower values when campus is down', async () => {
  const cfg = await composeCampusApi(lowerWithMe('social'), null, fakeCampus()).config();
  assert.equal(cfg.realtime_url, 'wss://campus/v1/realtime');
  assert.equal(cfg.features.defend, true);
  assert.equal(cfg.features.open_to_meet, true);
  assert.equal(cfg.features.meetup_safety_notifications, true);
  assert.equal(cfg.features.create_event, true, 'other flags stay with the lower layer');
  assert.deepEqual(cfg.campus, lowerConfig.campus);
  const down = await composeCampusApi(lowerWithMe('social'), null, fakeCampus({ rawConfig: async () => Promise.reject(new Error('offline')) })).config();
  assert.deepEqual(down, lowerConfig);
  assert.deepEqual(mergeConfig(lowerConfig, { features: null }), { ...lowerConfig, features: { ...lowerConfig.features } });
});

test('config / stats: campus-service alone (nothing below answers) stands in only when complete', async () => {
  const full = { campus: { id: 'iiser-kolkata', name: 'IISER Kolkata', short_name: 'IISER K', email_domains: ['iiserkol.ac.in'], center: [22.9637, 88.5245], max_radius_m: 4000, launched_at: null }, features: { create_crew: true, create_event: false, defend: true, open_to_meet: true, date_mode: { available: false, reason: 'r', requirements: [] }, meetup_safety_notifications: true }, realtime_url: 'wss://c/v1/realtime' };
  const api = composeCampusApi(off, null, fakeCampus({ rawConfig: async () => full }));
  const cfg = await api.config();
  assert.equal(cfg.campus.name, 'IISER Kolkata');
  assert.equal(cfg.realtime_url, 'wss://c/v1/realtime');
  assert.equal(cfg.features.meetup_safety_notifications, true);
  assert.equal(configFromCampus({ features: {} }), null);
  // Incomplete campus config + nothing below → the lower layer's error, not a made-up config.
  await assert.rejects(composeCampusApi(off, null, fakeCampus()).config(), /off:config/);
  const stats = await api.stats();
  assert.equal(stats.zones_total, 12);
  assert.equal(stats.crews_total, null, 'missing counters are null, never 0');
  assert.deepEqual(statsFromCampus({}, 'now'), { users_total: 0, users_active_now: null, zones_total: null, zones_claimed: null, crews_total: null, founding_spots_left: null, updated_at: 'now' });
});

test('stats: lower stats with campus-service zone counts', async () => {
  const s = await composeCampusApi(lowerWithMe('social'), null, fakeCampus()).stats();
  assert.equal(s.zones_total, 12);
  assert.equal(s.zones_claimed, 5);
  assert.equal(s.users_total, 40, 'people counts stay with the lower layer');
  assert.deepEqual(mergeStats(lowerStats, null), lowerStats);
});

test('me: open_to_meet comes from campus-service (it owns Open to Meet); the lower value when it is down', async () => {
  assert.equal((await composeCampusApi(lowerWithMe('social'), null, fakeCampus()).me()).open_to_meet, true);
  assert.equal((await composeCampusApi(lowerWithMe('social'), null, fakeCampus()).updateMe({})).open_to_meet, true);
  const down = composeCampusApi(lowerWithMe('social'), null, fakeCampus({ openToMeet: async () => Promise.reject(new Error('x')) }));
  assert.equal((await down.me()).open_to_meet, false);
});

test('capability gates: campus-service serves shared zones + heatmap; meetup rating / check-in stay gated', async () => {
  const served = servedCapabilities({ social: false, campusService: true });
  assert.deepEqual([...served].sort(), ['heatmap', 'sharedZones']);
  assert.deepEqual([...servedCapabilities({ social: true, campusService: false })], ['media']);
  assert.equal(servedCapabilities({ social: false, campusService: false }).size, 0);
  const rules = { sharedZones: { capability: 'sharedZones' }, heatmap: { capability: 'heatmap' }, meetupRating: { capability: 'meetupRating' }, checkIn: { capability: 'meetupCheckIn' } };
  const api = gateEndpoints(composeCampusApi(off, null, fakeCampus()), withoutServed(rules, served), new Set());
  assert.equal(await api.sharedZones(), 'campus:sharedZones');
  assert.equal(await api.heatmap(), 'campus:heatmap');
  await assert.rejects(api.meetupRating(), (e) => isEndpointUnavailable(e) && e.capability === 'meetupRating');
  await assert.rejects(api.checkIn(), (e) => isEndpointUnavailable(e) && e.capability === 'meetupCheckIn');
  // Opted in once campus-service serves them: routed straight there.
  const opted = gateEndpoints(composeCampusApi(off, null, fakeCampus()), withoutServed(rules, served), new Set(['meetupRating', 'meetupCheckIn']));
  assert.equal(await opted.meetupRating(), 'campus:meetupRating');
  assert.equal(await opted.checkIn(), 'campus:checkIn');
});

test('meetup path: campus-service meetups, except an event’s own check-in (Social)', () => {
  assert.equal(meetupPathFor({ fromEvent: false, social: true, campusService: true }), 'campus_service');
  assert.equal(meetupPathFor({ fromEvent: true, social: true, campusService: true }), 'social');
  assert.equal(meetupPathFor({ fromEvent: false, social: true, campusService: false }), 'social');
  assert.equal(meetupPathFor({ fromEvent: false, social: false, campusService: false }), 'campus');
  assert.equal(meetupPathFor({ fromEvent: true, social: false, campusService: true }), 'campus');
});

const person = (id, name) => ({ user_id: id, display_name: name, avatar_url: null, hostel: 'Tapti', open_to_meet: false });
const campusMeetup = (over = {}) => ({
  id: 'm1',
  created_by: 'u1',
  zone_id: 'cc1',
  zone: { id: 'cc1', name: 'CC1' },
  place_text: null,
  starts_at: '2026-10-02T12:00:00.000Z',
  status: 'confirmed',
  participants: [
    { user_id: 'u1', role: 'host', status: 'accepted', responded_at: 't', person: person('u1', 'Aanya') },
    { user_id: 'u2', role: 'guest', status: 'accepted', responded_at: 't', person: person('u2', 'Ravi') },
    { user_id: 'u3', role: 'guest', status: 'declined', responded_at: 't', person: person('u3', 'Meera') },
  ],
  ...over,
});

test('meetups: campus-service host + invitees → the app’s Meetup', () => {
  const m = meetupFromCampus(campusMeetup(), 'u1');
  assert.equal(m.title, 'Meetup with Ravi');
  assert.deepEqual(m.location, { name: 'CC1', zone_id: 'cc1' });
  assert.equal(m.event_id, null);
  assert.deepEqual(m.attendees.map((a) => [a.user_id, a.checked_in]), [['u1', false], ['u2', false]], 'declined people are not coming; nobody is checked in');
  assert.equal(m.my_check_in_at, null);
  assert.equal(m.check_in_opens_at, '2026-10-02T11:00:00.000Z');
  assert.equal(m.check_in_closes_at, '2026-10-02T18:00:00.000Z');
  assert.equal(meetupFromCampus(campusMeetup({ zone_id: null, zone: null, place_text: 'Gate 2', participants: [] }), 'u1').title, 'Meetup at Gate 2');
  assert.equal(meetupFromCampus(campusMeetup({ zone_id: null, zone: null, place_text: 'Gate 2', participants: [] }), 'u1').location.name, 'Gate 2');
  const list = meetupsFromCampus([campusMeetup(), campusMeetup({ id: 'm2', status: 'cancelled' }), campusMeetup({ id: 'm3' })], 'u3');
  assert.deepEqual(list.map((x) => x.id), [], 'cancelled ones and ones you declined are hidden');
  assert.deepEqual(meetupsFromCampus([campusMeetup(), campusMeetup({ id: 'm2', status: 'cancelled' })], 'u2').map((x) => x.id), ['m1']);
});

test('nearby players: hidden_reason code → text', () => {
  const r = nearbyPlayersFromCampus({ players: [], as_of: 't', visible: false, hidden_reason: 'open_to_meet_off' });
  assert.match(r.hidden_reason, /Open to Meet/);
  assert.equal(nearbyPlayersFromCampus({ players: [], as_of: 't', visible: true, hidden_reason: null }).hidden_reason, null);
});

test('active now: lite person → PersonCard with no invented activity', () => {
  const r = activeNowFromCampus({ active_now: 2, active: [{ person: { user_id: 'u2', display_name: 'Ravi', avatar_url: null, hostel: null, bio: 'hi' }, activity: { type: 'run', started_at: 't' }, proximity: null }], nearby: [], as_of: 't' });
  assert.equal(r.active[0].person.bio, 'hi');
  assert.equal(r.active[0].person.activity, null);
  assert.deepEqual(r.active[0].person.shared.shared_zones, []);
});

test('shared zones: by zone → by person, most shared first, "often" zone on top', () => {
  const r = sharedZonesFromCampus({
    zones: [
      { zone: { id: 'cc1', name: 'CC1' }, people: [{ user_id: 'u2', display_name: 'Ravi', avatar_url: null, hostel: null, activity: 'sometimes' }] },
      { zone: { id: 'lib', name: 'Library' }, people: [{ user_id: 'u2', display_name: 'Ravi', avatar_url: null, hostel: null, activity: 'often' }, { user_id: 'u3', display_name: 'Meera', avatar_url: null, hostel: null, activity: 'often' }] },
    ],
  });
  assert.deepEqual(r.people.map((p) => [p.person.user_id, p.shared_zones_count, p.top_zone.zone_id]), [['u2', 2, 'lib'], ['u3', 1, 'lib']]);
  assert.equal(r.visible, true);
});

test('heatmap: {lat,lng} + low/medium/high → HeatCell; windows campus-service does not aggregate say so', () => {
  const h = heatmapFromCampus({ window: '7d', grid_size_m: 100, suppression_threshold_users: 3, cells: [{ center: { lat: 22.96, lng: 88.52 }, intensity: 'medium' }] }, '7d', 'now');
  assert.deepEqual(h.cells[0].center, [22.96, 88.52]);
  assert.equal(h.cells[0].level, 'active');
  assert.equal(h.min_people_per_cell, 3);
  const off24 = heatWindowUnavailable('24h', 'now');
  assert.equal(off24.available, false);
  assert.deepEqual(off24.cells, []);
});

test('map features: GeoJSON zones only → empty base-map arrays; a contract response passes through', () => {
  assert.deepEqual(mapFeaturesFromCampus({ type: 'FeatureCollection', features: [{ id: 'cc1', geometry: null, properties: { name: 'CC1' } }] }), { roads: [], buildings: [], terrain: [], pois: [] });
  const contract = { roads: [{ id: 'r', kind: 'road', points: [] }], buildings: [], terrain: [], pois: [] };
  assert.equal(mapFeaturesFromCampus(contract), contract);
});

test('GPS upload: drops the fixes campus-service would refuse, keeps the rest', () => {
  const area = ingestAreaOf({ campus: { center: [22.9637, 88.5245], max_radius_m: 4000 } });
  assert.ok(area);
  assert.equal(ingestAreaOf({ campus: { center: [1, 2] } }), null);
  const t0 = Date.parse('2026-10-01T06:00:00Z');
  const at = (s) => new Date(t0 + s * 1000).toISOString();
  const pts = [
    { lat: 22.9637, lng: 88.5245, recorded_at: at(0), accuracy_m: 5 },
    { lat: 22.9638, lng: 88.5245, recorded_at: at(5), accuracy_m: 5 },
    { lat: 22.99, lng: 88.5245, recorded_at: at(6), accuracy_m: 5 }, // a 2.9 km jump in 1 s
    { lat: 22.9639, lng: 88.5245, recorded_at: at(4), accuracy_m: 5 }, // backwards in time
    { lat: 22.964, lng: 88.5245, recorded_at: at(15), accuracy_m: 500 }, // too inaccurate
    { lat: 23.2, lng: 88.5245, recorded_at: at(20), accuracy_m: 5 }, // off campus
    { lat: 22.9641, lng: 88.5245, recorded_at: at(30), accuracy_m: 5 },
  ];
  const r = pointsForCampus(pts, area);
  assert.deepEqual(r.points.map((p) => p.recorded_at), [at(0), at(5), at(30)]);
  assert.equal(r.dropped, 4);
  const many = Array.from({ length: CAMPUS_MAX_POINTS + 10 }, (_, i) => ({ lat: 22.9637 + i * 1e-7, lng: 88.5245, recorded_at: at(i), accuracy_m: 5 }));
  const thin = pointsForCampus(many, area);
  assert.equal(thin.points.length, CAMPUS_MAX_POINTS);
  assert.equal(thin.points.at(-1), many.at(-1));
});
