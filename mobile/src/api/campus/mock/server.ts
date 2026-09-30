/**
 * DEV MOCK ONLY — an in-memory stand-in for the campus backend, used when no campus API is
 * configured in a development build (see CAMPUS_MOCKS_ENABLED). It implements the same
 * CampusApi contract as http.ts, so swapping it out is a one-line change in api/campus/index.ts.
 *
 * It simulates the *server's* rules so the UI can be exercised end to end:
 *   - eligibility: logging ≥30 s or ≥80 m inside a zone makes you eligible for 24 h
 *   - claim (unclaimed + eligible), steal (owned by someone else + eligible + shield expired),
 *     defend (yours + under challenge + eligible)
 *   - fresh claims get a 2 h shield; ownership changes bump the territory version
 *   - a rival simulation changes a zone every ~40 s and pushes realtime events
 * The UI never re-implements these rules; it only renders what this (or the real) API returns.
 *
 * Everything here is fake data for development. It is never used in a production build
 * unless EXPO_PUBLIC_DEV_MOCKS=1 is set explicitly.
 */
import { ApiError } from '@/api/client';
import { EndpointUnavailableError, type Capability } from '@/api/availability';
import { users as demoUsers } from '@/data/users';
import type * as T from '@/api/campus/types';
import { MOCK_FEATURES, MOCK_ZONES, pointInZone, toLatLng, toXY } from '@/api/campus/mock/geo';

const ME = 'u_aanya';
const MIN = 60_000;
const HOUR = 60 * MIN;
const now = () => Date.now();
const iso = (t: number) => new Date(t).toISOString();
const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x)) as X;
const delay = () => new Promise<void>((r) => setTimeout(r, 180 + Math.random() * 320));
const FAIL_RATE = Number(process.env.EXPO_PUBLIC_MOCK_FAIL_RATE ?? 0) || 0;
const unavailable = (c: Capability) => Promise.reject(new EndpointUnavailableError(c));
const fail = (status: number, code: string, detail: string) => new ApiError(status, detail, { code, detail });
/** Writes can be made flaky to exercise error states: EXPO_PUBLIC_MOCK_FAIL_RATE=0.3 */
const maybeFail = () => {
  if (FAIL_RATE > 0 && Math.random() < FAIL_RATE) throw new ApiError(0, 'Network error');
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

type MockPerson = T.PersonLite & {
  bio: string;
  mode: T.ConnectionMode;
  crews: string[];
  ranZones: string[];
  open: boolean;
  active: { type: T.ActivityType | 'workout'; minutesAgo: number } | null;
  proximity: T.Proximity | null;
  xpToday: number;
  distance30: number;
  runs30: number;
  usual: 'morning' | 'evening' | 'night';
};

const HOSTEL: Record<string, string> = { u_aanya: 'Narmada', u_rhea: 'Tapti', u_aarav: 'Godavari', u_meera: 'Narmada', u_kabir: 'Tapti', u_zoya: 'Godavari', u_dev: 'Narmada', u_isha: 'Tapti', u_neil: 'Godavari', u_tara: 'Narmada', u_sam: 'Tapti', u_maya: 'Godavari' };
const BIOS: Record<string, string> = {
  u_aanya: 'BS-MS ’27 · chem · sunrise loops before lab',
  u_rhea: 'Physics PhD · 5 AM Sports Loop regular',
  u_aarav: 'Bio ’26 · HIIT between lectures',
  u_meera: 'Maths ’27 · yoga on the Admin Lawn',
  u_kabir: 'Earth sci ’28 · cycling + night runs',
  u_zoya: 'Chem ’26 · will race you to the Mess',
  u_dev: 'CS ’27 · early bird, library lurker',
  u_isha: 'Bio ’27 · walks & talks',
  u_neil: 'Physics ’28 · first-year, first 5K soon',
  u_tara: 'Maths PhD · lake walks at dusk',
  u_sam: 'Exchange student · runs everywhere',
  u_maya: 'Chem ’28 · night owl, zone thief',
};
const MODES: T.ConnectionMode[] = ['friends', 'crew', 'friends', 'date', 'crew', 'friends', 'friends', 'date', 'crew', 'friends', 'date', 'friends'];
const PROX: (T.Proximity | null)[] = [null, 'very_close', 'nearby', null, 'on_campus', 'nearby', null, 'very_close', 'on_campus', null, 'nearby', null];
const RAN: Record<string, string[]> = {
  u_aanya: ['sports', 'cc1', 'admin', 'narmada', 'library', 'lhc'],
  u_rhea: ['sports', 'library', 'lake', 'tapti'],
  u_aarav: ['lhc', 'godavari', 'mess'],
  u_meera: ['admin', 'sports', 'narmada'],
  u_kabir: ['narmada', 'tapti', 'gate'],
  u_zoya: ['lhc', 'mess', 'godavari', 'sports'],
  u_dev: ['library', 'cc1', 'mess'],
  u_isha: ['lake', 'admin', 'tapti'],
  u_neil: ['gate', 'godavari'],
  u_tara: ['lake', 'narmada'],
  u_sam: ['sports', 'gate', 'lake', 'tapti'],
  u_maya: ['cc1', 'library', 'godavari'],
};

const people: MockPerson[] = demoUsers.map((u, i) => ({
  user_id: u.id,
  display_name: u.name,
  avatar_url: null,
  hostel: HOSTEL[u.id] ?? 'Narmada',
  bio: BIOS[u.id] ?? u.bio,
  mode: u.id === ME ? 'friends' : MODES[i % MODES.length],
  crews: [],
  ranZones: RAN[u.id] ?? [],
  open: u.id !== ME && i % 3 !== 0,
  active: u.id !== ME && i % 2 === 1 ? { type: i % 4 === 1 ? 'run' : i % 4 === 3 ? 'walk' : 'workout', minutesAgo: 4 + ((i * 7) % 30) } : null,
  proximity: u.id === ME ? null : PROX[i % PROX.length],
  xpToday: [180, 240, 90, 150, 210, 130, 60, 110, 40, 75, 160, 95][i % 12],
  distance30: [42000, 88000, 21000, 35000, 64000, 30000, 51000, 18000, 9000, 26000, 71000, 33000][i % 12],
  runs30: [14, 26, 8, 11, 19, 10, 17, 9, 4, 12, 22, 13][i % 12],
  usual: (['morning', 'morning', 'evening', 'evening', 'night', 'evening', 'morning', 'evening', 'morning', 'evening', 'morning', 'night'] as const)[i % 12],
}));
const person = (id: string) => people.find((p) => p.user_id === id);
const lite = (p: MockPerson): T.PersonLite => ({ user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url, hostel: p.hostel });

type MockCrew = T.Crew & { memberIds: string[]; ownerId: string | null };
const crews: MockCrew[] = [
  { id: 'crew-night-owls', name: 'Narmada Night Owls', color: '#A855F7', icon: 'weather-night', description: 'Laps after dinner. Headlamps optional, vibes mandatory.', members_count: 0, territories_count: 0, meets: 'Mon–Thu · 9:30 PM', tags: ['running', 'night'], my_membership: null, joinable: true, memberIds: [ME, 'u_meera', 'u_dev', 'u_tara'], ownerId: 'u_meera' },
  { id: 'crew-sunrise', name: 'Sunrise Squirrels', color: '#D7FF1F', icon: 'weather-sunset-up', description: 'Sports Ground Loop at 6 AM, chai at the Mess after.', members_count: 0, territories_count: 0, meets: 'Daily · 6:00 AM', tags: ['running', 'morning'], my_membership: null, joinable: true, memberIds: ['u_rhea', 'u_dev', 'u_sam'], ownerId: 'u_rhea' },
  { id: 'crew-park-street', name: 'Park Street Runners', color: '#FF2D9B', icon: 'run-fast', description: 'Weekend city runs in Kolkata — the train back is part of the plan.', members_count: 0, territories_count: 0, meets: 'Sun · 5:30 AM', tags: ['running', 'city'], my_membership: null, joinable: true, memberIds: ['u_rhea', 'u_kabir', 'u_sam', 'u_isha'], ownerId: 'u_kabir' },
  { id: 'crew-godavari-gang', name: 'Godavari Gang', color: '#5FB8FF', icon: 'shield-account', description: 'Hostel pride. We hold what we take.', members_count: 0, territories_count: 0, meets: 'Fri · 6:00 PM', tags: ['territory', 'hostel'], my_membership: null, joinable: true, memberIds: ['u_aarav', 'u_zoya', 'u_neil', 'u_maya'], ownerId: 'u_zoya' },
  { id: 'crew-lake-walkers', name: 'Lake Walk & Talk', color: '#3DF0A0', icon: 'walk', description: 'Slow loops round the lake. Talking encouraged.', members_count: 0, territories_count: 0, meets: 'Tue & Sat · 5:30 PM', tags: ['walking', 'social'], my_membership: null, joinable: true, memberIds: ['u_isha', 'u_tara', ME], ownerId: 'u_isha' },
];
for (const c of crews) for (const m of c.memberIds) person(m)?.crews.push(c.id);

type MockTerritory = T.Territory;
const territories: Record<string, MockTerritory> = {};
const history: Record<string, T.TerritoryEvent[]> = {};
const t0 = now();
const seedOwner: Record<string, { owner: string | null; crew?: string; hoursAgo: number; underChallenge?: boolean; defended?: number }> = {
  narmada: { owner: ME, crew: 'crew-night-owls', hoursAgo: 30, underChallenge: true, defended: 2 },
  tapti: { owner: 'u_kabir', crew: 'crew-park-street', hoursAgo: 20 },
  godavari: { owner: null, hoursAgo: 0 },
  mess: { owner: 'u_zoya', crew: 'crew-godavari-gang', hoursAgo: 8 },
  cc1: { owner: null, hoursAgo: 0 },
  library: { owner: 'u_rhea', crew: 'crew-sunrise', hoursAgo: 50, defended: 1 },
  lhc: { owner: 'u_maya', crew: 'crew-godavari-gang', hoursAgo: 26 },
  sports: { owner: 'u_rhea', crew: 'crew-sunrise', hoursAgo: 4 },
  admin: { owner: ME, hoursAgo: 60 },
  gate: { owner: null, hoursAgo: 0 },
  lake: { owner: 'u_isha', crew: 'crew-lake-walkers', hoursAgo: 12 },
};
const SEED_CONTROL: Record<string, number> = { narmada: 0.62, tapti: 0.74, mess: 0.52, library: 0.66, lhc: 0.58, sports: 0.81, admin: 0.9, lake: 0.47 };
const SEED_XP: Record<string, number> = { narmada: 9120, tapti: 12840, mess: 6300, library: 10450, lhc: 7210, sports: 15600, admin: 4380, lake: 5120 };
/** Zones where two sides are close enough to count as contested (the backend's call). */
const contested = new Set<string>(['mess']);
function statusOf(t: T.Territory): T.TerritoryStatus {
  if (!t.owner) return 'neutral';
  if (t.under_challenge) return 'under_attack';
  return contested.has(t.zone_id) ? 'contested' : 'controlled';
}
const crewLite = (id?: string | null): T.CrewLite | null => {
  const c = id ? crews.find((x) => x.id === id) : null;
  return c ? { id: c.id, name: c.name, color: c.color, icon: c.icon } : null;
};
for (const z of MOCK_ZONES) {
  const s = seedOwner[z.id] ?? { owner: null, hoursAgo: 0 };
  const owner = s.owner ? person(s.owner) : undefined;
  const at = t0 - s.hoursAgo * HOUR;
  territories[z.id] = {
    zone_id: z.id,
    owner: owner ? lite(owner) : null,
    crew: crewLite(s.crew),
    claimed_at: owner ? iso(at) : null,
    defended_count: s.defended ?? 0,
    last_defended_at: s.defended ? iso(at + 6 * HOUR) : null,
    under_challenge: !!s.underChallenge,
    shield_until: owner && s.hoursAgo < 2 ? iso(at + 2 * HOUR) : null,
    version: 1,
    updated_at: iso(at),
    control: owner ? SEED_CONTROL[z.id] ?? 0.6 : null,
    xp: owner ? SEED_XP[z.id] ?? 4000 : null,
  };
  territories[z.id].status = statusOf(territories[z.id]);
  history[z.id] = owner ? [{ id: `h-${z.id}-0`, type: 'claimed', actor: lite(owner), previous_owner: null, at: iso(at) }] : [];
}

/** Zones the signed-in user is eligible in (zone id → until). CC1, LHC and Narmada start eligible. */
const eligibleUntil: Record<string, number> = { cc1: t0 + 20 * HOUR, lhc: t0 + 20 * HOUR, narmada: t0 + 20 * HOUR };

const me = {
  email: 'aanya.s21@iiserkol.ac.in',
  hostel_zone_id: 'narmada' as string | null,
  date_mode_enabled: false,
  onboarding_completed: false,
  safety_contact_configured: true,
  connection_mode: null as T.ConnectionMode | null,
  bio: BIOS[ME],
  display_name: person(ME)!.display_name,
  open_to_meet: false,
  defended: 2,
  stolen: 1,
  events_attended: 3,
  distance_total: 128_400,
  distance_month: 23_600,
};
const myActivities: T.ActivityHistoryItem[] = [
  { id: 'act-1', type: 'run', started_at: iso(t0 - 26 * HOUR), distance_m: 5120, duration_s: 1936, zones_count: 3, status: 'verified' },
  { id: 'act-2', type: 'walk', started_at: iso(t0 - 50 * HOUR), distance_m: 2400, duration_s: 1680, zones_count: 2, status: 'verified' },
  { id: 'act-3', type: 'run', started_at: iso(t0 - 98 * HOUR), distance_m: 3860, duration_s: 1402, zones_count: 1, status: 'flagged' },
];
const activityResults: Record<string, T.ActivityZones> = {};

const nextDow = (dow: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  const add = (dow - d.getDay() + 7) % 7 || (d.getTime() < now() ? 7 : 0);
  d.setDate(d.getDate() + add);
  return d.getTime();
};
type MockEvent = T.EventDetail;
const ev = (e: Omit<MockEvent, 'participants_count' | 'participants' | 'my_rsvp' | 'rsvp_open'> & { going: string[]; extra: number }): MockEvent & { going: string[]; extra: number } => ({
  ...e,
  participants_count: 0,
  participants: [],
  my_rsvp: null,
  rsvp_open: true,
});
const events = [
  ev({ id: 'ev-sprint', title: 'Saturday Morning Squirrel Sprint', type: 'run', starts_at: iso(nextDow(6, 6, 30)), ends_at: iso(nextDow(6, 7, 30)), location: { name: 'Sports Ground Loop', zone_id: 'sports' }, host: { type: 'crew', id: 'crew-sunrise', name: 'Sunrise Squirrels' }, capacity: 60, territory_challenge: null, description: '3 fast laps, 1 slow one, then chai. All paces — nobody finishes alone.', meetup_id: 'mt-sprint', going: ['u_rhea', 'u_dev', 'u_sam'], extra: 21 }),
  ev({ id: 'ev-chill', title: 'Sunday Evening Chill Run', type: 'run', starts_at: iso(nextDow(0, 17, 30)), ends_at: iso(nextDow(0, 18, 30)), location: { name: 'Lake Walk', zone_id: 'lake' }, host: { type: 'crew', id: 'crew-lake-walkers', name: 'Lake Walk & Talk' }, capacity: null, territory_challenge: null, description: 'Conversational pace round the lake. Walkers welcome.', meetup_id: 'mt-chill', going: [ME, 'u_isha', 'u_tara'], extra: 14 }),
  ev({ id: 'ev-hostel-battle', title: 'Hostel Territory Battle', type: 'territory_battle', starts_at: iso(nextDow(5, 18)), ends_at: iso(nextDow(5, 20)), location: { name: 'Narmada · Tapti · Godavari', zone_id: null }, host: { type: 'squirrel', id: 'squirrel', name: 'Squirrel Social' }, capacity: null, territory_challenge: { zone_ids: ['narmada', 'tapti', 'godavari'], summary: 'Two hours. Three hostels. Most zones held at 8 PM wins.', reward_xp: 300 }, description: 'Every claim, steal and defence counts for your hostel.', meetup_id: null, going: ['u_kabir', 'u_zoya', 'u_aarav', 'u_meera'], extra: 58 }),
  ev({ id: 'ev-weekend-war', title: 'Weekend War', type: 'weekend_war', starts_at: iso(nextDow(6, 0)), ends_at: iso(nextDow(0, 23, 59)), location: { name: 'All campus zones', zone_id: null }, host: { type: 'squirrel', id: 'squirrel', name: 'Squirrel Social' }, capacity: null, territory_challenge: { zone_ids: MOCK_ZONES.map((z) => z.id), summary: 'All weekend, every zone is live. Crew with the most territory on Sunday night takes the crown.', reward_xp: 500 }, description: 'Steal shields are halved all weekend.', meetup_id: null, going: ['u_rhea', 'u_maya', 'u_zoya'], extra: 96 }),
  ev({ id: 'ev-library-walk', title: 'Study Break Walk', type: 'study_break_walk', template: 'study_break_walk', duration_min: 20, meeting_point: 'Library steps', starts_at: iso(now() + 40 * MIN), ends_at: iso(now() + 60 * MIN), location: { name: 'Library', zone_id: 'library' }, host: { type: 'user', id: 'u_dev', name: 'Dev P.' }, capacity: 10, territory_challenge: null, description: 'Need a break? Grab a few squirrels and take a quick walk.', meetup_id: null, going: ['u_dev', 'u_isha'], extra: 3 }),
  ev({ id: 'ev-sbw-lhc', title: 'Study Break Walk', type: 'study_break_walk', template: 'study_break_walk', duration_min: 20, meeting_point: 'LHC front steps', starts_at: iso(nextDow((new Date().getDay() + 1) % 7, 16, 0)), ends_at: null, location: { name: 'LHC', zone_id: 'lhc' }, host: { type: 'user', id: 'u_tara', name: 'Tara V.' }, capacity: 8, territory_challenge: null, description: 'Twenty minutes, one loop, back to the books.', meetup_id: null, going: ['u_tara'], extra: 1 }),
];
const refreshEvent = (e: (typeof events)[number]) => {
  e.participants = e.going.map((id) => person(id)).filter((p): p is MockPerson => !!p).map(lite);
  e.participants_count = e.going.length + e.extra;
  e.my_rsvp = e.going.includes(ME) ? 'going' : null;
  e.rsvp_open = Date.parse(e.starts_at) > now();
};

type MockMeetup = T.Meetup;
const meetups: MockMeetup[] = [
  { id: 'mt-lake', title: 'Lake walk with Isha & Tara', starts_at: iso(now() - 3 * HOUR), location: { name: 'Lake Walk', zone_id: 'lake' }, event_id: null, attendees: [], my_check_in_at: iso(now() - 3 * HOUR + 4 * MIN), check_in_opens_at: iso(now() - 3 * HOUR - 30 * MIN), check_in_closes_at: iso(now() - 2 * HOUR) },
  { id: 'mt-coffee', title: 'Coffee walk with Rhea', starts_at: iso(now() + 25 * MIN), location: { name: 'Main Gate Boulevard', zone_id: 'gate' }, event_id: null, attendees: [], my_check_in_at: null, check_in_opens_at: iso(now() - 5 * MIN), check_in_closes_at: iso(now() + 90 * MIN) },
];
const meetupPeople: Record<string, { id: string; checked: boolean }[]> = { 'mt-coffee': [{ id: ME, checked: false }, { id: 'u_rhea', checked: true }], 'mt-lake': [{ id: ME, checked: true }, { id: 'u_isha', checked: true }, { id: 'u_tara', checked: true }] };

const TYPES: T.ChallengeTypeInfo[] = [
  { id: 'territory', label: 'Territory challenge', description: 'Whoever logs more distance inside the zone takes it.', requires_zone: true, targets: ['user', 'crew'] },
  { id: 'zone_race', label: 'Zone race', description: 'First to complete a lap of the zone wins.', requires_zone: true, targets: ['user'] },
  { id: 'weekend_war', label: 'Weekend War', description: 'Crew vs crew, all weekend, every zone.', requires_zone: false, targets: ['crew'] },
  { id: 'group_activity', label: 'Group activity', description: 'Invite a person or crew to move together — no winner, just vibes.', requires_zone: false, targets: ['user', 'crew'] },
];
const invites: T.ChallengeInvite[] = [
  { id: 'inv-1', type: 'territory', type_label: 'Territory challenge', from: lite(person('u_kabir')!), target: { type: 'user', person: lite(person(ME)!) }, zone: { id: 'narmada', name: 'Narmada Hostel' }, starts_at: iso(now() + 20 * HOUR), message: 'Narmada looks better in Tapti colours 😏', status: 'pending', direction: 'incoming', created_at: iso(now() - 2 * HOUR), result: null },
  { id: 'inv-2', type: 'zone_race', type_label: 'Zone race', from: lite(person(ME)!), target: { type: 'user', person: lite(person('u_rhea')!) }, zone: { id: 'library', name: 'Library' }, starts_at: iso(now() + 44 * HOUR), message: null, status: 'pending', direction: 'outgoing', created_at: iso(now() - 30 * MIN), result: null },
];

const badges: T.Badge[] = [
  { id: 'founding_squirrel', name: 'Founding Squirrel', description: 'Joined in the first IISER Kolkata launch wave.', unlocked: true, unlocked_at: iso(t0 - 12 * 24 * HOUR), progress: null },
  { id: 'early_bird', name: 'Early Bird', description: '10 activities before 7 AM.', unlocked: true, unlocked_at: iso(t0 - 3 * 24 * HOUR), progress: { current: 10, target: 10 } },
  { id: 'night_owl', name: 'Night Owl', description: '5 activities after 9 PM.', unlocked: false, unlocked_at: null, progress: { current: 3, target: 5 } },
  { id: 'park_regular', name: 'Park Regular', description: '10 activities at the Sports Ground Loop.', unlocked: false, unlocked_at: null, progress: { current: 6, target: 10 } },
];

let activeJitter = 0;
const idempotent: Record<string, T.TerritoryActionResult> = {};

// ---------------------------------------------------------------------------
// Realtime (mock emitter + rival simulation)
// ---------------------------------------------------------------------------

type Listener = (m: T.RealtimeMessage) => void;
const listeners = new Set<Listener>();
let simTimer: ReturnType<typeof setInterval> | null = null;
const emit = (m: T.RealtimeMessage) => listeners.forEach((l) => l(clone(m)));

function simulateRival() {
  const r = Math.random();
  if (r < 0.2) {
    const mine = Object.values(territories).find((t) => t.owner?.user_id === ME && !t.under_challenge);
    if (mine) {
      mine.under_challenge = true;
      bump(mine);
      emit({ type: 'territory.updated', data: mine });
      return;
    }
  }
  if (r < 0.75) {
    const candidates = Object.values(territories).filter((t) => t.owner?.user_id !== ME && !(t.shield_until && Date.parse(t.shield_until) > now()));
    const t = candidates[Math.floor(Math.random() * candidates.length)];
    const rivals = people.filter((p) => p.user_id !== ME && p.user_id !== t?.owner?.user_id);
    const rival = rivals[Math.floor(Math.random() * rivals.length)];
    if (t && rival) {
      const prev = t.owner;
      t.owner = lite(rival);
      t.control = null;
      t.xp = 0;
      t.crew = crewLite(rival.crews[0]);
      t.claimed_at = iso(now());
      t.shield_until = iso(now() + 2 * HOUR);
      t.under_challenge = false;
      bump(t);
      history[t.zone_id].unshift({ id: `h-${t.zone_id}-${t.version}`, type: prev ? 'stolen' : 'claimed', actor: lite(rival), previous_owner: prev, at: iso(now()) });
      emit({ type: 'territory.updated', data: t });
      emit({ type: 'stats.updated', data: statsNow() });
      return;
    }
  }
  activeJitter = (activeJitter + (Math.random() < 0.5 ? -1 : 1) + 7) % 7;
  emit({ type: 'active.updated', data: { active_now: statsNow().users_active_now } });
  emit({ type: 'stats.updated', data: statsNow() });
}

export const mockRealtime = {
  subscribe(l: Listener) {
    listeners.add(l);
    if (!simTimer) simTimer = setInterval(simulateRival, 40_000);
    if (!surprisePokeScheduled) {
      surprisePokeScheduled = true;
      setTimeout(() => receivePoke('u_dev'), 30_000); // someone nearby pokes you
    }
    return () => {
      listeners.delete(l);
      if (!listeners.size && simTimer) {
        clearInterval(simTimer);
        simTimer = null;
      }
    };
  },
};

// ---------------------------------------------------------------------------
// Rules (the mock backend's; the app renders the results)
// ---------------------------------------------------------------------------

const zoneById = (id: string) => {
  const z = MOCK_ZONES.find((x) => x.id === id);
  if (!z) throw fail(404, 'not_found', 'Zone not found');
  return z;
};
const bump = (t: MockTerritory) => {
  t.version += 1;
  t.updated_at = iso(now());
  if (!t.owner) {
    t.control = null;
    t.xp = null;
  } else if (t.control == null) {
    t.control = 0.35;
    t.xp = t.xp ?? 0;
  }
  t.status = statusOf(t);
};
const ok = (expires: number | null = null): T.ActionAvailability => ({ allowed: true, code: null, reason: null, expires_at: expires ? iso(expires) : null });
const no = (code: string, reason: string, expires: number | null = null): T.ActionAvailability => ({ allowed: false, code, reason, expires_at: expires ? iso(expires) : null });

function actionsFor(zoneId: string): T.ZoneActions {
  const z = zoneById(zoneId);
  const t = territories[zoneId];
  const until = eligibleUntil[zoneId] ?? 0;
  const eligible = until > now();
  const mine = t.owner?.user_id === ME;
  const shield = t.shield_until ? Date.parse(t.shield_until) : 0;
  const claim = !t.owner ? (eligible ? ok(until) : no('not_eligible', `Run or walk through ${z.name} to unlock a claim.`)) : no('already_owned', mine ? 'Already your territory.' : `Held by ${t.owner.display_name}.`);
  const steal = !t.owner
    ? no('unclaimed', 'Nobody holds it — claim it instead.')
    : mine
      ? no('own_zone', 'This is your territory.')
      : shield > now()
        ? no('shielded', 'Freshly claimed — shielded for now.', shield)
        : eligible
          ? ok(until)
          : no('not_eligible', `Log activity inside ${z.name} to earn a steal.`);
  const defend = !mine
    ? no('not_owner', 'Only the owner can defend.')
    : !t.under_challenge
      ? no('not_under_attack', 'Nobody is attacking it right now.')
      : eligible
        ? ok(until)
        : no('not_eligible', `Run through ${z.name} to defend it.`);
  return { claim, steal, defend };
}

function statsNow(): T.LaunchStats {
  return {
    users_total: 347 + (me.onboarding_completed ? 1 : 0),
    users_active_now: people.filter((p) => p.active).length + 17 + activeJitter,
    zones_total: MOCK_ZONES.length,
    zones_claimed: Object.values(territories).filter((t) => t.owner).length,
    crews_total: crews.length,
    founding_spots_left: 153,
    updated_at: iso(now()),
  };
}

function sharedWith(other: MockPerson): T.SharedContext {
  const mine = person(ME)!;
  const shared_zones: T.SharedContext['shared_zones'] = [];
  const icebreakers: T.Icebreaker[] = [];
  for (const z of MOCK_ZONES) {
    const t = territories[z.id];
    const iRan = mine.ranZones.includes(z.id);
    const theyRan = other.ranZones.includes(z.id);
    if (t.owner?.user_id === other.user_id && iRan) {
      shared_zones.push({ zone_id: z.id, zone_name: z.name, relation: 'they_own_you_ran' });
      icebreakers.push({ id: `ib-${other.user_id}-own-${z.id}`, text: `They hold ${z.name} — and you run it. Challenge them for it.`, kind: 'challenge', zone_id: z.id, action: { type: 'challenge', zone_id: z.id } });
    } else if (t.owner?.user_id === ME && theyRan) {
      shared_zones.push({ zone_id: z.id, zone_name: z.name, relation: 'you_own_they_ran' });
      icebreakers.push({ id: `ib-${other.user_id}-mine-${z.id}`, text: `They’ve been running through your ${z.name}.`, kind: 'shared_zone', zone_id: z.id });
    } else if (iRan && theyRan) {
      shared_zones.push({ zone_id: z.id, zone_name: z.name, relation: 'both_ran', activity_count: 2 + ((z.id.length + other.user_id.length) % 5) });
      icebreakers.push({ id: `ib-${other.user_id}-ran-${z.id}`, text: `You’ve both run the ${z.name}.`, kind: 'shared_route', zone_id: z.id });
    }
  }
  const shared_crews = crews.filter((c) => c.memberIds.includes(ME) && c.memberIds.includes(other.user_id)).map((c) => crewLite(c.id)!);
  for (const c of shared_crews) icebreakers.push({ id: `ib-${other.user_id}-crew-${c.id}`, text: `You’re both in ${c.name}.`, kind: 'shared_crew', crew_id: c.id });
  const shared_events = events.filter((e) => e.going.includes(ME) && e.going.includes(other.user_id)).map((e) => ({ event_id: e.id, title: e.title }));
  for (const e of shared_events) icebreakers.push({ id: `ib-${other.user_id}-ev-${e.event_id}`, text: `You’re both going to ${e.title}.`, kind: 'shared_event' });
  return { shared_zones, shared_crews, shared_events, icebreakers: icebreakers.slice(0, 4) };
}

function card(p: MockPerson, withActivities = false): T.PersonCard {
  const shared = sharedWith(p);
  const first = shared.icebreakers[0];
  return {
    ...lite(p),
    connection_mode: p.mode,
    bio: p.bio,
    activity: { top_activity: p.active?.type === 'walk' ? 'walk' : 'run', runs_30d: p.runs30, distance_30d_m: p.distance30, usual_time: p.usual },
    shared,
    match_reason: first ? first.text : null,
    ...(withActivities ? { suggested_activities: ['Sunset walk round the Lake Walk', 'Chai after the Squirrel Sprint', 'Library Lap Walk between study blocks'] } : {}),
  };
}

function profileOf(p: MockPerson): T.Profile {
  const owned = Object.values(territories)
    .filter((t) => t.owner?.user_id === p.user_id)
    .map((t) => ({ zone_id: t.zone_id, zone_name: zoneById(t.zone_id).name, claimed_at: t.claimed_at!, defended_count: t.defended_count }));
  const isMe = p.user_id === ME;
  return {
    ...lite(p),
    bio: isMe ? me.bio : p.bio,
    display_name: isMe ? me.display_name : p.display_name,
    connection_mode: isMe ? me.connection_mode : p.mode,
    open_to_meet: isMe ? me.open_to_meet : p.open,
    verification: { email_verified: true, email_domain: 'iiserkol.ac.in', student_verified: true, phone_verified: isMe || p.user_id.length % 2 === 0, selfie_verified: false },
    stats: {
      total_distance_m: isMe ? me.distance_total : p.distance30 * 3,
      month_distance_m: isMe ? me.distance_month : p.distance30,
      zones_claimed: owned.length,
      territories_defended: isMe ? me.defended : Math.round(p.runs30 / 5),
      territories_stolen: isMe ? me.stolen : Math.round(p.runs30 / 8),
      crew_memberships: crews.filter((c) => c.memberIds.includes(p.user_id)).length,
      events_attended: isMe ? me.events_attended : Math.round(p.runs30 / 6),
      streak_days: isMe ? 6 : null,
    },
    territories: owned,
    crews: crews.filter((c) => c.memberIds.includes(p.user_id)).map((c) => ({ ...crewLite(c.id)!, role: c.ownerId === p.user_id ? 'owner' : 'member' })),
    badges: isMe ? clone(badges) : badges.filter((b) => b.id === 'founding_squirrel' || (b.id === 'early_bird' && p.usual === 'morning')).map((b) => ({ ...b, progress: null })),
    recent_activities: isMe ? clone(myActivities) : [],
    joined_at: iso(t0 - (isMe ? 12 : 10) * 24 * HOUR),
    founding_member: true,
  };
}

const crewView = (c: MockCrew): T.Crew => ({
  id: c.id,
  name: c.name,
  color: c.color,
  icon: c.icon,
  description: c.description,
  members_count: c.memberIds.length + (c.id === 'crew-park-street' ? 38 : 12),
  territories_count: Object.values(territories).filter((t) => t.crew?.id === c.id).length,
  meets: c.meets,
  tags: c.tags,
  my_membership: c.memberIds.includes(ME) ? (c.ownerId === ME ? 'owner' : 'member') : null,
  joinable: true,
});

const meetupView = (m: MockMeetup): T.Meetup => ({
  ...m,
  attendees: (meetupPeople[m.id] ?? []).map((a) => ({ ...lite(person(a.id)!), checked_in: a.checked })),
});

function allMeetups(): MockMeetup[] {
  const fromEvents = events
    .filter((e) => e.meetup_id && e.going.includes(ME))
    .map((e) => {
      if (!meetupPeople[e.meetup_id!]) meetupPeople[e.meetup_id!] = e.going.slice(0, 6).map((id) => ({ id, checked: false }));
      const existing = meetups.find((m) => m.id === e.meetup_id);
      if (existing) return existing;
      const m: MockMeetup = { id: e.meetup_id!, title: e.title, starts_at: e.starts_at, location: e.location, event_id: e.id, attendees: [], my_check_in_at: null, check_in_opens_at: iso(Date.parse(e.starts_at) - 30 * MIN), check_in_closes_at: iso(Date.parse(e.starts_at) + 60 * MIN) };
      meetups.push(m);
      return m;
    });
  const ids = new Set(fromEvents.map((m) => m.id));
  return [...meetups.filter((m) => !m.event_id || ids.has(m.id))].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Map world + Poke → Poke back → Friends (the mock backend's rules)
// ---------------------------------------------------------------------------

/** Extra campus people so clustering has something to do. Initial-only avatars (no photos). */
const CROWD_NAMES = ['Riya M.', 'Arjun P.', 'Sneha K.', 'Rohan D.', 'Ananya B.', 'Vikram S.', 'Pooja R.', 'Kunal T.', 'Diya G.', 'Ishaan C.', 'Meghna L.', 'Aditya V.', 'Nisha H.', 'Sahil J.', 'Tanvi A.', 'Harsh N.', 'Kavya E.', 'Yash W.', 'Aisha Q.', 'Dhruv O.', 'Shreya U.', 'Parth I.', 'Ira Z.', 'Neel X.', 'Mira Y.', 'Om F.', 'Zara B.', 'Ved K.'];
/** Where people hang out (local metres) — crowds cluster near hostels, the mess and the track. */
const HOTSPOTS: [number, number][] = [[150, 360], [300, 330], [-10, 380], [140, 232], [-390, 70], [280, 110], [55, -210], [-60, 90]];
const snap = (v: number, cell = 40) => Math.round(v / cell) * cell; // the backend's approximation grid
type PlayerSeed = { id: string; name: string; hostel: string; xp: number; at: [number, number]; activity: T.MapPlayer['activity']; proximity: T.Proximity | null; open: boolean };
const PLAYER_XP: Record<string, number> = { u_rhea: 4820, u_aarav: 2430, u_meera: 6120, u_kabir: 3310, u_zoya: 5210, u_dev: 1980, u_isha: 2750, u_neil: 640, u_tara: 3890, u_sam: 7020, u_maya: 4410 };
const levelOf = (xp: number) => 1 + Math.floor(xp / 300);
const seededPlayers: PlayerSeed[] = [
  ...people
    .filter((p) => p.user_id !== ME)
    .map((p, i) => ({ id: p.user_id, name: p.display_name, hostel: p.hostel ?? 'Narmada', xp: PLAYER_XP[p.user_id] ?? 1500, at: HOTSPOTS[i % HOTSPOTS.length], activity: p.active?.type ?? null, proximity: p.proximity, open: p.open || i % 2 === 0 })),
  ...CROWD_NAMES.map((name, i) => ({ id: `u_crowd_${i}`, name, hostel: ['Narmada', 'Tapti', 'Godavari'][i % 3], xp: 300 + ((i * 733) % 5200), at: HOTSPOTS[(i * 3) % HOTSPOTS.length], activity: (i % 5 === 0 ? 'run' : i % 7 === 0 ? 'walk' : null) as T.MapPlayer['activity'], proximity: (i % 4 === 0 ? 'nearby' : 'on_campus') as T.Proximity, open: true })),
];
/** People who blocked you or hid from the map never appear (privacy is the backend's job). */
const BLOCKED = new Set<string>(['u_neil']);
const playerLite = (s: PlayerSeed) => ({ user_id: s.id, display_name: s.name, avatar_url: null, hostel: s.hostel, level: levelOf(s.xp), xp: s.xp });
const seedById = (id: string) => seededPlayers.find((s) => s.id === id);

type Rel = { state: T.RelationshipState; poked_at: string | null; friends_since: string | null };
const rels: Record<string, Rel> = {
  u_kabir: { state: 'poked_you', poked_at: iso(t0 - 25 * MIN), friends_since: null },
  u_aarav: { state: 'poked_you', poked_at: iso(t0 - 2 * MIN), friends_since: null },
  u_isha: { state: 'friends', poked_at: iso(t0 - 3 * 24 * HOUR), friends_since: iso(t0 - 3 * 24 * HOUR) },
  u_crowd_0: { state: 'friends', poked_at: iso(t0 - 18 * MIN), friends_since: iso(t0 - 18 * MIN) },
  u_maya: { state: 'poked', poked_at: iso(t0 - 5 * HOUR), friends_since: null },
};
/** In the mock these people poke back ~10 s after you poke them (so the flow can be tested alone). */
const AUTO_POKE_BACK = new Set<string>(['u_rhea', 'u_zoya', 'u_crowd_3', 'u_crowd_8', 'u_meera']);
const relOf = (id: string): Rel => rels[id] ?? { state: 'none', poked_at: null, friends_since: null };
function relationship(id: string): T.Relationship {
  const r = relOf(id);
  const reason = r.state === 'poked' ? 'Poked — waiting for them to poke back.' : r.state === 'friends' ? 'You’re already friends.' : null;
  return { user_id: id, state: r.state, can_poke: r.state === 'none' || r.state === 'poked_you', reason, poked_at: r.poked_at, friends_since: r.friends_since };
}
const incoming: T.IncomingPoke[] = [
  { id: 'pk-aarav', from: playerLite(seedById('u_aarav')!), created_at: iso(t0 - 2 * MIN), status: 'pending' },
  { id: 'pk-kabir', from: playerLite(seedById('u_kabir')!), created_at: iso(t0 - 25 * MIN), status: 'pending' },
];
const notes: T.AppNotification[] = [
  { id: 'n-aarav', type: 'poke', actor: playerLite(seedById('u_aarav')!), text: 'Aarav M. poked you', created_at: iso(t0 - 2 * MIN), read: false, data: { user_id: 'u_aarav', poke_id: 'pk-aarav' } },
  { id: 'n-riya', type: 'friendship', actor: playerLite(seedById('u_crowd_0')!), text: 'You and Riya M. are now friends', created_at: iso(t0 - 18 * MIN), read: false, data: { user_id: 'u_crowd_0' } },
  { id: 'n-kabir', type: 'poke', actor: playerLite(seedById('u_kabir')!), text: 'Kabir R. poked you', created_at: iso(t0 - 25 * MIN), read: true, data: { user_id: 'u_kabir', poke_id: 'pk-kabir' } },
  { id: 'n-terr', type: 'territory', actor: playerLite(seedById('u_kabir')!), text: 'Narmada Hostel is under attack', created_at: iso(t0 - 40 * MIN), read: true, data: { zone_id: 'narmada' } },
  { id: 'n-sbw', type: 'study_break', actor: null, text: 'Study Break Walk starts in 40 min at the Library steps', created_at: iso(t0 - 5 * MIN), read: false, data: { event_id: 'ev-library-walk' } },
  { id: 'n-inv', type: 'invite', actor: playerLite(seedById('u_kabir')!), text: 'Kabir R. challenged you for Narmada Hostel', created_at: iso(t0 - 2 * HOUR), read: true, data: { invite_id: 'inv-1' } },
];
const pokeIdem: Record<string, T.PokeResult> = {};
let presence: T.PresenceUpdate | null = null;
let surprisePokeScheduled = false;

function addNote(n: Omit<T.AppNotification, 'id' | 'created_at' | 'read'>) {
  const note: T.AppNotification = { ...n, id: `n-${now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, created_at: iso(now()), read: false };
  notes.unshift(note);
  emit({ type: 'notification.created', data: note });
}

function becomeFriends(id: string) {
  rels[id] = { state: 'friends', poked_at: relOf(id).poked_at, friends_since: iso(now()) };
  incoming.forEach((p) => {
    if (p.from.user_id === id && p.status === 'pending') p.status = 'poked_back';
  });
}

function receivePoke(id: string) {
  const s = seedById(id);
  if (!s || BLOCKED.has(id)) return;
  const r = relOf(id);
  if (r.state === 'poked') {
    // They poked back → mutual → friends (decided here, on the "server").
    becomeFriends(id);
    const friend = playerLite(s);
    emit({ type: 'friendship.created', data: { friend, relationship: relationship(id) } });
    addNote({ type: 'friendship', actor: friend, text: `You and ${s.name} are now friends`, data: { user_id: id } });
    return;
  }
  if (r.state !== 'none') return;
  rels[id] = { state: 'poked_you', poked_at: iso(now()), friends_since: null };
  const poke: T.IncomingPoke = { id: `pk-${now().toString(36)}`, from: playerLite(s), created_at: iso(now()), status: 'pending' };
  incoming.unshift(poke);
  emit({ type: 'poke.received', data: poke });
  emit({ type: 'relationship.updated', data: relationship(id) });
  addNote({ type: 'poke', actor: playerLite(s), text: `${s.name} poked you`, data: { user_id: id, poke_id: poke.id } });
}

function doPoke(id: string, key: string, reply: boolean): T.PokeResult {
  if (pokeIdem[key]) return pokeIdem[key];
  const s = seedById(id);
  if (id === ME) throw fail(422, 'invalid_target', 'You can’t poke yourself');
  if (!s || BLOCKED.has(id)) throw fail(404, 'not_found', 'This Squirrel isn’t available');
  const r = relOf(id);
  if (r.state === 'friends') throw fail(409, 'already_friends', 'You’re already friends');
  if (r.state === 'poked') throw fail(409, 'already_poked', 'Already poked — wait for them to poke back');
  if (reply && r.state !== 'poked_you') throw fail(409, 'nothing_to_poke_back', 'They haven’t poked you');
  let result: T.PokeResult;
  if (r.state === 'poked_you') {
    becomeFriends(id);
    result = { relationship: relationship(id), friendship_created: true, friend: playerLite(s) };
    addNote({ type: 'friendship', actor: playerLite(s), text: `You and ${s.name} are now friends`, data: { user_id: id } });
  } else {
    rels[id] = { state: 'poked', poked_at: iso(now()), friends_since: null };
    result = { relationship: relationship(id), friendship_created: false, friend: null };
    if (AUTO_POKE_BACK.has(id)) setTimeout(() => receivePoke(id), 10_000);
  }
  pokeIdem[key] = result;
  return clone(result);
}

function visiblePlayers(): T.MapPlayer[] {
  return seededPlayers
    .filter((s) => s.open && !BLOCKED.has(s.id))
    .map((s, i) => {
      // Spread people around their hotspot, then snap to the approximation grid.
      const a = (i * 137.5 * Math.PI) / 180;
      const r = 18 + ((i * 29) % 70);
      const [x, y] = [snap(s.at[0] + Math.cos(a) * r), snap(s.at[1] + Math.sin(a) * r)];
      return { ...playerLite(s), position: toLatLng(x, y), precision_m: 40, proximity: s.proximity, activity: s.activity, last_seen_at: iso(now() - ((i * 3) % 20) * MIN), relationship: relOf(s.id).state };
    });
}

/** Campus people beyond the demo cast (mock crowd), shaped like the demo people for profiles. */
function crowdPerson(id: string): MockPerson | undefined {
  const s = seedById(id);
  if (!s || person(id)) return undefined;
  return { user_id: s.id, display_name: s.name, avatar_url: null, hostel: s.hostel, bio: 'IISER K · here for the runs and the people', mode: 'friends', crews: [], ranZones: ['sports', 'mess'], open: s.open, active: s.activity ? { type: s.activity, minutesAgo: 6 } : null, proximity: s.proximity, xpToday: 80, distance30: 20000, runs30: 8, usual: 'evening' };
}

function summary(s: PlayerSeed): T.PersonSummary {
  return { ...playerLite(s), proximity: s.proximity, relationship: relOf(s.id).state };
}

const DATE_MODE_ON = process.env.EXPO_PUBLIC_MOCK_DATE_MODE === 'on';

export const mockCampusApi: T.CampusApi = {
  async config() {
    await delay();
    return {
      campus: { id: 'iiser-kolkata', name: 'IISER Kolkata', short_name: 'IISER K', email_domains: ['iiserkol.ac.in'], center: MOCK_ZONES[0].centroid, launched_at: iso(t0 - 14 * 24 * HOUR) },
      features: {
        create_crew: true,
        create_event: false,
        defend: true,
        open_to_meet: true,
        date_mode: DATE_MODE_ON
          ? { available: true, reason: null, requirements: [] }
          : {
              available: false,
              reason: 'Date Mode opens once the safety features below are live on campus.',
              requirements: [
                { id: 'selfie_verification', label: 'Selfie verification', description: 'Everyone in Date Mode is a verified, real student.' },
                { id: 'report_block', label: 'Report & block', description: 'One tap, reviewed by humans.' },
                { id: 'public_meetups', label: 'Meet in public zones first', description: 'First meetups only in busy campus zones.' },
                { id: 'safety_contact', label: 'Safety contact check-ins', description: 'A friend gets notified when you check in.' },
              ],
            },
        meetup_safety_notifications: true,
      },
      realtime_url: null,
    };
  },
  async stats() {
    await delay();
    return statsNow();
  },

  async me() {
    await delay();
    const p = person(ME)!;
    return {
      ...profileOf(p),
      email: me.email,
      hostel_zone_id: me.hostel_zone_id,
      date_mode_enabled: me.date_mode_enabled,
      onboarding_completed: me.onboarding_completed,
      safety_contact_configured: me.safety_contact_configured,
    };
  },
  async updateMe(patch) {
    await delay();
    maybeFail();
    if (patch.display_name !== undefined) {
      if (!patch.display_name.trim()) throw fail(422, 'invalid_name', 'Name can’t be empty');
      me.display_name = patch.display_name.trim();
    }
    if (patch.profile_details !== undefined) throw new EndpointUnavailableError('profileDetails');
    if (patch.bio !== undefined) me.bio = patch.bio.slice(0, 160);
    if (patch.connection_mode !== undefined) me.connection_mode = patch.connection_mode;
    if (patch.hostel_zone_id !== undefined) {
      const z = zoneById(patch.hostel_zone_id);
      if (z.kind !== 'hostel') throw fail(422, 'not_a_hostel', 'Pick a hostel');
      me.hostel_zone_id = z.id;
      person(ME)!.hostel = z.hostel;
    }
    if (patch.onboarding_completed !== undefined) me.onboarding_completed = patch.onboarding_completed;
    if (patch.date_mode_enabled !== undefined) {
      if (patch.date_mode_enabled && !DATE_MODE_ON) throw fail(403, 'date_mode_unavailable', 'Date Mode isn’t available yet');
      me.date_mode_enabled = patch.date_mode_enabled;
    }
    return mockCampusApi.me();
  },
  async setOpenToMeet(enabled) {
    await delay();
    maybeFail();
    me.open_to_meet = enabled;
    return { enabled, updated_at: iso(now()), visible_until: enabled ? iso(now() + 3 * HOUR) : null };
  },
  async profile(userId) {
    await delay();
    if (BLOCKED.has(userId)) throw fail(404, 'not_found', 'Squirrel not found');
    const p = person(userId) ?? crowdPerson(userId);
    if (!p) throw fail(404, 'not_found', 'Squirrel not found');
    return profileOf(p);
  },
  async sharedContext(userId) {
    await delay();
    const p = person(userId) ?? crowdPerson(userId);
    if (!p) throw fail(404, 'not_found', 'Squirrel not found');
    return userId === ME ? { shared_zones: [], shared_crews: [], shared_events: [], icebreakers: [] } : sharedWith(p);
  },
  async badges() {
    await delay();
    return clone(badges);
  },

  async zones() {
    await delay();
    return clone(MOCK_ZONES);
  },
  async territories() {
    await delay();
    return { territories: clone(Object.values(territories)), as_of: iso(now()) };
  },
  async zone(zoneId) {
    await delay();
    const zone = zoneById(zoneId);
    const visits = person(ME)!.ranZones.includes(zoneId) ? 3 : 0;
    return {
      zone: clone(zone),
      territory: clone(territories[zoneId]),
      actions: actionsFor(zoneId),
      stats: { runs_7d: 6 + (zoneId.length * 3) % 17, visitors_7d: 4 + (zoneId.length * 5) % 13, my_visits_7d: visits, distance_7d_m: 8000 + zoneId.length * 1300 },
      history: clone(history[zoneId].slice(0, 8)),
    };
  },
  async territoryAction(zoneId, action, key) {
    await delay();
    maybeFail();
    if (idempotent[key]) return clone(idempotent[key]);
    const z = zoneById(zoneId);
    const avail = actionsFor(zoneId)[action];
    if (!avail.allowed) throw fail(409, avail.code ?? 'not_allowed', avail.reason ?? 'Not allowed right now');
    const t = territories[zoneId];
    const mePerson = lite(person(ME)!);
    let event: T.TerritoryEvent;
    if (action === 'defend') {
      t.under_challenge = false;
      t.control = Math.min(1, (t.control ?? 0.5) + 0.15);
      t.defended_count += 1;
      t.last_defended_at = iso(now());
      t.shield_until = iso(now() + 2 * HOUR);
      me.defended += 1;
      event = { id: `h-${zoneId}-${t.version + 1}`, type: 'defended', actor: mePerson, previous_owner: null, at: iso(now()) };
    } else {
      const prev = t.owner;
      t.owner = mePerson;
      t.control = null;
      t.xp = 0;
      contested.delete(zoneId);
      t.crew = crewLite(person(ME)!.crews[0]);
      t.claimed_at = iso(now());
      t.shield_until = iso(now() + 2 * HOUR);
      t.under_challenge = false;
      t.defended_count = 0;
      t.last_defended_at = null;
      if (action === 'steal') me.stolen += 1;
      event = { id: `h-${zoneId}-${t.version + 1}`, type: action === 'steal' ? 'stolen' : 'claimed', actor: mePerson, previous_owner: prev, at: iso(now()) };
      delete eligibleUntil[zoneId]; // a claim or steal spends your eligibility
    }
    bump(t);
    history[zoneId].unshift(event);
    const result = { territory: clone(t), actions: actionsFor(zoneId), event };
    idempotent[key] = result;
    emit({ type: 'territory.updated', data: t });
    emit({ type: 'stats.updated', data: statsNow() });
    void z;
    return clone(result);
  },

  async submitActivity(input) {
    await delay();
    maybeFail();
    if (input.points.length < 2) throw fail(422, 'too_short', 'Not enough GPS points to record this activity');
    const id = `act-${now().toString(36)}`;
    const zones: T.ZoneInteraction[] = [];
    for (const z of MOCK_ZONES) {
      let inside = 0;
      let dist = 0;
      let secs = 0;
      let entered = false;
      let exited = false;
      for (let i = 0; i < input.points.length; i++) {
        const p = input.points[i];
        const inZ = pointInZone([p.lat, p.lng], z);
        if (inZ) {
          inside++;
          entered = true;
          if (i > 0) {
            const q = input.points[i - 1];
            if (pointInZone([q.lat, q.lng], z)) {
              const [ax, ay] = toXY([q.lat, q.lng]);
              const [bx, by] = toXY([p.lat, p.lng]);
              dist += Math.hypot(bx - ax, by - ay);
              secs += Math.max(0, (Date.parse(p.recorded_at) - Date.parse(q.recorded_at)) / 1000);
            }
          }
        } else if (entered) exited = true;
      }
      if (!inside) continue;
      if (secs >= 30 || dist >= 80) {
        eligibleUntil[z.id] = now() + 24 * HOUR;
        const me_ = person(ME)!;
        if (!me_.ranZones.includes(z.id)) me_.ranZones.push(z.id);
      }
      zones.push({ zone_id: z.id, zone_name: z.name, interaction: dist > 300 ? 'looped' : exited ? 'passed_through' : 'visited', distance_in_zone_m: Math.round(dist), time_in_zone_s: Math.round(secs), territory: clone(territories[z.id]), actions: actionsFor(z.id) });
    }
    let total = 0;
    for (let i = 1; i < input.points.length; i++) {
      const [ax, ay] = toXY([input.points[i - 1].lat, input.points[i - 1].lng]);
      const [bx, by] = toXY([input.points[i].lat, input.points[i].lng]);
      total += Math.hypot(bx - ax, by - ay);
    }
    me.distance_total += total;
    me.distance_month += total;
    myActivities.unshift({ id, type: input.type, started_at: input.started_at, distance_m: Math.round(total), duration_s: Math.round((Date.parse(input.ended_at) - Date.parse(input.started_at)) / 1000), zones_count: zones.length, status: 'verified' });
    activityResults[id] = { activity_id: id, status: 'verified', zones };
    return { activity_id: id };
  },
  async activityZones(activityId) {
    await delay();
    const r = activityResults[activityId];
    if (!r) throw fail(404, 'not_found', 'Activity not found');
    // Territory and actions are read fresh: ownership may have changed since the run.
    return { ...clone(r), zones: r.zones.map((z) => ({ ...z, territory: clone(territories[z.zone_id]), actions: actionsFor(z.zone_id) })) };
  },

  async crews({ q, scope }) {
    await delay();
    const term = (q ?? '').trim().toLowerCase();
    const items = crews
      .filter((c) => (scope === 'mine' ? c.memberIds.includes(ME) : true))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || c.tags.some((t) => t.includes(term)))
      .map(crewView);
    return { items, next_cursor: null };
  },
  async crew(crewId) {
    await delay();
    const c = crews.find((x) => x.id === crewId);
    if (!c) throw fail(404, 'not_found', 'Crew not found');
    events.forEach(refreshEvent);
    return {
      ...crewView(c),
      members: c.memberIds.map((id) => person(id)).filter((p): p is MockPerson => !!p).map(lite),
      territories: Object.values(territories)
        .filter((t) => t.crew?.id === c.id)
        .map((t) => ({ zone_id: t.zone_id, zone_name: zoneById(t.zone_id).name, claimed_at: t.claimed_at!, defended_count: t.defended_count })),
      upcoming_events: events.filter((e) => e.host.id === c.id).map(summaryOf),
    };
  },
  async joinCrew(crewId) {
    await delay();
    maybeFail();
    const c = crews.find((x) => x.id === crewId);
    if (!c) throw fail(404, 'not_found', 'Crew not found');
    if (c.memberIds.includes(ME)) throw fail(409, 'already_member', 'You’re already in this crew');
    c.memberIds.push(ME);
    person(ME)!.crews.push(c.id);
    return crewView(c);
  },
  async leaveCrew(crewId) {
    await delay();
    maybeFail();
    const c = crews.find((x) => x.id === crewId);
    if (!c) throw fail(404, 'not_found', 'Crew not found');
    if (c.ownerId === ME) throw fail(409, 'owner_cannot_leave', 'Hand the crew to someone else before leaving');
    if (!c.memberIds.includes(ME)) throw fail(409, 'not_member', 'You’re not in this crew');
    c.memberIds = c.memberIds.filter((m) => m !== ME);
    const p = person(ME)!;
    p.crews = p.crews.filter((x) => x !== c.id);
    return crewView(c);
  },
  async createCrew(input) {
    await delay();
    maybeFail();
    const name = input.name.trim();
    if (name.length < 3) throw fail(422, 'invalid_name', 'Crew names need at least 3 characters');
    if (crews.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'name_taken', 'A crew with that name already exists');
    const c: MockCrew = { id: `crew-${now().toString(36)}`, name, color: input.color ?? '#D7FF1F', icon: input.icon ?? 'account-group', description: input.description.trim() || null, members_count: 0, territories_count: 0, meets: null, tags: [], my_membership: 'owner', joinable: true, memberIds: [ME], ownerId: ME };
    crews.unshift(c);
    person(ME)!.crews.push(c.id);
    return crewView(c);
  },

  async events({ scope }) {
    await delay();
    events.forEach(refreshEvent);
    const items = events
      .filter((e) => (scope === 'mine' ? e.going.includes(ME) : Date.parse(e.ends_at ?? e.starts_at) > now()))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map(summaryOf);
    return { items, next_cursor: null };
  },
  async event(eventId) {
    await delay();
    const e = events.find((x) => x.id === eventId);
    if (!e) throw fail(404, 'not_found', 'Event not found');
    refreshEvent(e);
    return detailOf(e);
  },
  async rsvp(eventId, going) {
    await delay();
    maybeFail();
    const e = events.find((x) => x.id === eventId);
    if (!e) throw fail(404, 'not_found', 'Event not found');
    refreshEvent(e);
    if (!e.rsvp_open) throw fail(409, 'rsvp_closed', 'RSVPs are closed for this event');
    if (going) {
      if (e.capacity != null && e.participants_count >= e.capacity && !e.going.includes(ME)) throw fail(409, 'event_full', 'This event is full');
      if (!e.going.includes(ME)) e.going.push(ME);
    } else e.going = e.going.filter((x) => x !== ME);
    refreshEvent(e);
    emit({ type: 'event.updated', data: { event_id: e.id, participants_count: e.participants_count } });
    return detailOf(e);
  },

  async suggestedPeople(mode) {
    await delay();
    if (mode === 'date') {
      if (!DATE_MODE_ON) throw fail(403, 'date_mode_unavailable', 'Date Mode isn’t available yet');
      if (!me.date_mode_enabled) throw fail(403, 'date_mode_off', 'Turn on Date Mode first');
      return people.filter((p) => p.user_id !== ME && p.mode === 'date').map((p) => card(p, true));
    }
    return people
      .filter((p) => p.user_id !== ME && p.mode !== 'date')
      .map((p) => card(p))
      .sort((a, b) => b.shared.icebreakers.length - a.shared.icebreakers.length);
  },
  async activeNow() {
    await delay();
    const act = people
      .filter((p) => p.user_id !== ME && p.active)
      .map((p) => ({ person: card(p), activity: { type: p.active!.type, started_at: iso(now() - p.active!.minutesAgo * MIN) }, proximity: me.open_to_meet || p.proximity === 'on_campus' ? p.proximity : null }));
    const nearby = people
      .filter((p) => p.user_id !== ME && p.open && (p.proximity === 'very_close' || p.proximity === 'nearby'))
      .map((p) => ({ person: card(p), activity: p.active ? { type: p.active.type, started_at: iso(now() - p.active.minutesAgo * MIN) } : null, proximity: p.proximity }));
    return { active_now: statsNow().users_active_now, active: act, nearby: me.open_to_meet ? nearby : [], as_of: iso(now()) };
  },

  async challengeTypes() {
    await delay();
    return clone(TYPES);
  },
  async invites(box) {
    await delay();
    return clone(invites.filter((i) => box === 'all' || i.direction === box).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },
  async createInvite(input) {
    await delay();
    maybeFail();
    const type = TYPES.find((t) => t.id === input.type);
    if (!type) throw fail(422, 'invalid_type', 'Unknown challenge type');
    if (!type.targets.includes(input.target.type)) throw fail(422, 'invalid_target', `${type.label} can’t target a ${input.target.type}`);
    if (type.requires_zone && !input.zone_id) throw fail(422, 'zone_required', 'Pick a zone for this challenge');
    if (Date.parse(input.starts_at) < now()) throw fail(422, 'in_the_past', 'Pick a time in the future');
    const zone = input.zone_id ? zoneById(input.zone_id) : null;
    let target: T.ChallengeInvite['target'];
    if (input.target.type === 'user') {
      const p = person(input.target.id);
      if (!p || p.user_id === ME) throw fail(422, 'invalid_target', 'Pick someone else to challenge');
      target = { type: 'user', person: lite(p) };
    } else {
      const c = crewLite(input.target.id);
      if (!c) throw fail(422, 'invalid_target', 'Crew not found');
      target = { type: 'crew', crew: c };
    }
    const inv: T.ChallengeInvite = { id: `inv-${now().toString(36)}`, type: type.id, type_label: type.label, from: lite(person(ME)!), target, zone: zone ? { id: zone.id, name: zone.name } : null, starts_at: input.starts_at, message: input.message?.trim() || null, status: 'pending', direction: 'outgoing', created_at: iso(now()), result: null };
    invites.unshift(inv);
    // Simulate the other side answering, so the realtime path is exercised in development.
    setTimeout(() => {
      if (inv.status !== 'pending') return;
      inv.status = 'accepted';
      emit({ type: 'invite.updated', data: inv });
    }, 15_000);
    return clone(inv);
  },
  async respondInvite(inviteId, action) {
    await delay();
    maybeFail();
    const inv = invites.find((i) => i.id === inviteId);
    if (!inv) throw fail(404, 'not_found', 'Invite not found');
    if (inv.status !== 'pending') throw fail(409, 'not_pending', `This invite is already ${inv.status}`);
    if (action === 'cancel' ? inv.direction !== 'outgoing' : inv.direction !== 'incoming') throw fail(403, 'forbidden', 'You can’t do that with this invite');
    inv.status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled';
    emit({ type: 'invite.updated', data: inv });
    return clone(inv);
  },

  async squirrelBoard(period, limit = 10) {
    await delay();
    const mult = period === 'daily' ? 1 : period === 'weekly' ? 5 : 22;
    const rows = people
      .filter((p) => p.user_id !== 'u_sam' || period !== 'daily')
      .map((p) => ({
        ...lite(p),
        xp: p.xpToday * mult + (p.user_id === ME ? 0 : 0),
        zones_claimed: Object.values(territories).filter((t) => t.owner?.user_id === p.user_id).length,
        distance_m: Math.round((p.distance30 / 30) * (period === 'daily' ? 1 : period === 'weekly' ? 7 : 30)),
      }))
      .sort((a, b) => b.xp - a.xp || a.user_id.localeCompare(b.user_id));
    let rank = 0;
    let prev = Infinity;
    const ranked = rows.map((r, i) => {
      if (r.xp !== prev) rank = i + 1;
      prev = r.xp;
      return { ...r, rank };
    });
    return { period, entries: ranked.slice(0, limit), me: ranked.find((r) => r.user_id === ME) ?? null, updated_at: iso(now()) };
  },
  async hostelBoard(period) {
    await delay();
    const hostels = ['Narmada', 'Tapti', 'Godavari'];
    const mult = period === 'daily' ? 1 : period === 'weekly' ? 6 : 25;
    const rows = hostels
      .map((h) => {
        const members = people.filter((p) => p.hostel === h);
        const owned = Object.values(territories).filter((t) => t.owner && members.some((m) => m.user_id === t.owner!.user_id)).length;
        const dist = members.reduce((s, m) => s + m.distance30 / 30, 0) * mult;
        const active = members.filter((m) => m.active).length;
        return { hostel_id: h.toLowerCase(), name: h, territories: owned, active_members: active, distance_m: Math.round(dist), score: owned * 100 + Math.round(dist / 100) + active * 5 };
      })
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return { period, entries: rows, my_hostel_id: (person(ME)!.hostel ?? '').toLowerCase() || null, updated_at: iso(now()) };
  },

  async mapFeatures() {
    await delay();
    return clone(MOCK_FEATURES);
  },
  async nearbyPlayers() {
    await delay();
    // You appear to others only while Open to Meet AND sharing your location.
    const visible = me.open_to_meet && presence != null;
    const hidden_reason = !me.open_to_meet ? 'You’re hidden. Turn on Open to Meet to appear to others.' : !presence ? 'Share your location to appear on the map.' : null;
    return { players: visiblePlayers(), as_of: iso(now()), visible, hidden_reason };
  },
  async zonePlayers(zoneId) {
    await delay();
    const z = zoneById(zoneId);
    return visiblePlayers()
      .filter((p) => pointInZone(p.position, z))
      .map((p) => summary(seedById(p.user_id)!));
  },
  async updatePresence(p) {
    await delay();
    presence = p;
    return { accepted: true };
  },
  async searchPeople(q) {
    await delay();
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return seededPlayers.filter((s) => !BLOCKED.has(s.id) && s.name.toLowerCase().includes(term)).slice(0, 20).map(summary);
  },

  async pokeStatus(userId) {
    await delay();
    if (!seedById(userId) || BLOCKED.has(userId)) throw fail(404, 'not_found', 'This Squirrel isn’t available');
    return relationship(userId);
  },
  async sendPoke(userId, key) {
    await delay();
    maybeFail();
    return doPoke(userId, key, false);
  },
  async pokeBack(userId, key) {
    await delay();
    maybeFail();
    return doPoke(userId, key, true);
  },
  async incomingPokes() {
    await delay();
    return clone(incoming);
  },
  async friendshipStatus(userId) {
    await delay();
    const r = relOf(userId);
    return { user_id: userId, friends: r.state === 'friends', since: r.friends_since };
  },
  async notifications() {
    await delay();
    return { items: clone(notes), unread: notes.filter((n) => !n.read).length };
  },
  async markNotificationsRead(ids) {
    await delay();
    notes.forEach((n) => {
      if (ids.includes(n.id)) n.read = true;
    });
    return { unread: notes.filter((n) => !n.read).length };
  },

  // ---- The seven endpoints with no backend yet (shared zones, heatmap, Squirrel Dates, media,
  // meetup ratings, ambassadors; profile_details is gated on PATCH /v1/me). The dev mock does NOT
  // fake them: they reject as unavailable, exactly like the live build, so the UI shows
  // "Not live yet" instead of invented data. api/campus/index.ts gates them before they get here.
  sharedZones: () => unavailable('sharedZones'),
  heatmap: () => unavailable('heatmap'),
  dateSuggestions: () => unavailable('dateSuggestions'),
  dismissDateSuggestion: () => unavailable('dateSuggestions'),
  inviteFromSuggestion: () => unavailable('dateSuggestions'),
  createUpload: () => unavailable('media'),
  completeUpload: () => unavailable('media'),
  media: () => unavailable('media'),
  meetupRating: () => unavailable('meetupRating'),
  rateMeetup: () => unavailable('meetupRating'),
  ambassador: () => unavailable('ambassador'),
  applyAmbassador: () => unavailable('ambassador'),

  async meetups() {
    await delay();
    return allMeetups().map(meetupView);
  },
  async meetup(meetupId) {
    await delay();
    const m = allMeetups().find((x) => x.id === meetupId);
    if (!m) throw fail(404, 'not_found', 'Meetup not found');
    return meetupView(m);
  },
  async checkIn(meetupId, notify) {
    await delay();
    maybeFail();
    const m = allMeetups().find((x) => x.id === meetupId);
    if (!m) throw fail(404, 'not_found', 'Meetup not found');
    if (Date.parse(m.check_in_opens_at) > now()) throw fail(409, 'check_in_not_open', 'Check-in opens 30 minutes before the start');
    if (Date.parse(m.check_in_closes_at) < now()) throw fail(409, 'check_in_closed', 'Check-in has closed for this meetup');
    if (!m.my_check_in_at) m.my_check_in_at = iso(now());
    const mine = (meetupPeople[m.id] ??= []).find((a) => a.id === ME);
    if (mine) mine.checked = true;
    else meetupPeople[m.id].push({ id: ME, checked: true });
    const safety: T.SafetyNotification = !notify
      ? { requested: false, status: 'skipped', contact_label: null }
      : me.safety_contact_configured
        ? { requested: true, status: 'sent', contact_label: 'Riya (sister)' }
        : { requested: true, status: 'not_configured', contact_label: null };
    return { meetup_id: m.id, checked_in_at: m.my_check_in_at, safety_notification: safety };
  },
};

function summaryOf(e: (typeof events)[number]): T.EventSummary {
  refreshEvent(e);
  return { id: e.id, title: e.title, type: e.type, starts_at: e.starts_at, ends_at: e.ends_at, location: e.location, host: e.host, participants_count: e.participants_count, capacity: e.capacity, my_rsvp: e.my_rsvp, territory_challenge: e.territory_challenge, template: e.template ?? null, duration_min: e.duration_min ?? null, meeting_point: e.meeting_point ?? null };
}
function detailOf(e: (typeof events)[number]): T.EventDetail {
  const { going: _g, extra: _x, ...rest } = e;
  return clone(rest);
}
