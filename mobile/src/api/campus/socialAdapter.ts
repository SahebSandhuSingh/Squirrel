/**
 * The Social service (EXPO_PUBLIC_SOCIAL_API_URL) behind the campus contract. Where the Social
 * service already implements a campus feature under its own routes, these methods translate it
 * onto the types the screens use; everything it doesn't have (zones + territory, map players,
 * heatmap, Date Mode, meetup ratings…) is left to the campus backend, or stays "not live yet".
 *
 * Translation rules: nothing is invented. A field Social doesn't track is null (the screen hides
 * it), and a Social endpoint that reports `available: false` rejects as "not live yet".
 *
 *   me / profile / badges       GET|PATCH /v1/users/me/profile, GET /v1/users/{id}/profile, /v1/me/membership
 *   config / stats              GET /v1/community/config + membership + Run /v1/live + Exercise /api/live
 *   crews                       /v1/crews…
 *   events + RSVP + create      /v1/events…
 *   meetups + check-in          your events (scope=mine) · POST /v1/events/{id}/checkin {notify_user_ids}
 *   leaderboards                /v1/leaderboards/xp | hostels (daily, weekly)
 *   notifications               /v1/notifications…
 *   uploads                     /v1/media/uploads → PUT → /v1/media/{id}/complete
 *   challenge invites           /v1/challenges (head-to-head km / workout duels)
 *   friends (poke → follow)     a poke is a follow; a poke back is the follow back; mutual = friends
 *   people search / suggestions /v1/users/search, /v1/users/suggestions
 */
import { api, ApiError } from '@/api/client';
import { ALLOWED_EMAIL_DOMAINS, API_CONFIGURED, API_URL, EXERCISE_API_CONFIGURED, EXERCISE_API_URL, SOCIAL_API_URL } from '@/api/config';
import { socialApi } from '@/api/social';
import { S_INTERESTS } from '@/api/social/types';
import type * as S from '@/api/social/types';
import type * as T from '@/api/campus/types';

const socialBase = () => SOCIAL_API_URL;
const S_INTEREST_SET = new Set<string>(S_INTERESTS);
const notLive = (what: string) => new ApiError(503, `${what} isn’t live yet`, { code: 'social_unavailable', detail: `${what} isn’t live yet` });

const lite = (u: Pick<S.SUser, 'id' | 'display_name' | 'avatar_url'>, hostel: string | null = null): T.PersonLite => ({ user_id: u.id, display_name: u.display_name, avatar_url: u.avatar_url, hostel });

/** The first time we see the signed-in user's Social id (needed for follower lists). */
let myId: string | null = null;
let myHostel: string | null = null;
async function meId(): Promise<string> {
  if (myId) return myId;
  const p = await socialApi.myProfile();
  myId = p.user.id;
  myHostel = p.user.hostel;
  return myId;
}

const badge = (b: S.SBadge): T.Badge => ({
  id: b.id === 'founding-squirrel' ? 'founding_squirrel' : b.id.replace(/-/g, '_'),
  name: b.title,
  description: b.description,
  unlocked: true,
  unlocked_at: b.awarded_at,
  progress: null,
});

const crewLite = (c: { id: string; name: string; role?: string }): T.CrewLite => ({ id: c.id, name: c.name, color: null, icon: null, role: c.role === 'owner' || c.role === 'admin' ? c.role : c.role ? 'member' : undefined });

function activity(a: S.SActivity): T.ActivityHistoryItem {
  return {
    id: a.id,
    type: a.type === 'run' || a.type === 'walk' ? a.type : a.source === 'exercise' ? 'workout' : a.type,
    started_at: a.started_at,
    distance_m: a.distance_km != null ? Math.round(a.distance_km * 1000) : null,
    duration_s: Math.round((a.duration_minutes ?? 0) * 60),
    zones_count: null,
    status: a.verified ? 'verified' : 'processing',
  };
}

function profile(p: S.SProfile, m: S.SMembership | null): T.Profile {
  const u = p.user;
  const verified = m?.email_verified ?? u.verified;
  return {
    ...lite(u, u.hostel),
    bio: u.bio || null,
    connection_mode: null,
    open_to_meet: false,
    verification: { email_verified: verified, email_domain: verified ? ALLOWED_EMAIL_DOMAINS[0] ?? null : null, student_verified: verified, phone_verified: false, selfie_verified: false },
    stats: {
      total_distance_m: null,
      month_distance_m: Math.round(p.stats.month_km * 1000),
      zones_claimed: null,
      territories_defended: null,
      territories_stolen: null,
      crew_memberships: p.crews.length,
      events_attended: null,
      streak_days: p.stats.streak_days,
      xp: p.stats.xp,
      level: p.stats.level,
      followers: p.stats.followers,
      following: p.stats.following,
      month_workouts: p.stats.month_workouts,
    },
    territories: [],
    crews: p.crews.map((c) => crewLite(c)),
    badges: p.badges.map(badge),
    recent_activities: p.recent_activities.map(activity),
    joined_at: u.created_at,
    founding_member: !!m?.founding || p.badges.some((b) => b.kind === 'founding'),
  };
}

function me(p: S.SProfile, m: S.SMembership | null): T.Me {
  myId = p.user.id;
  myHostel = p.user.hostel;
  return {
    ...profile(p, m),
    email: null,
    profile_details: null,
    hostel_zone_id: p.user.hostel ? `hostel:${p.user.hostel}` : null,
    date_mode_enabled: false,
    // A fresh Social account is called "New Squirrel" until onboarding names it.
    onboarding_completed: p.user.display_name !== 'New Squirrel' || !!p.user.hostel,
    safety_contact_configured: false,
  };
}

const crew = (c: S.SCrew): T.Crew => ({
  id: c.id,
  name: c.name,
  color: null,
  icon: null,
  description: c.tagline || null,
  members_count: c.members_count,
  territories_count: 0,
  meets: c.meets || null,
  tags: [c.interest, c.hostel].filter((x): x is string => !!x),
  my_membership: c.my_role === 'owner' || c.my_role === 'admin' ? c.my_role : c.is_member ? 'member' : null,
  joinable: !c.is_member,
});

function eventSummary(e: S.SEvent): T.EventSummary {
  return {
    id: e.id,
    title: e.title,
    type: e.kind,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    location: { name: e.online ? 'Online' : e.venue || 'On campus', zone_id: null },
    host: e.crew ? { type: 'crew', id: e.crew.id, name: e.crew.name } : { type: 'user', id: e.host.id, name: e.host.display_name },
    participants_count: e.going_count,
    capacity: e.capacity,
    my_rsvp: e.my_rsvp === 'going' ? 'going' : null,
    territory_challenge: null,
  };
}

function eventDetail(e: S.SEvent): T.EventDetail {
  const end = new Date(e.ends_at ?? e.starts_at).getTime();
  return { ...eventSummary(e), description: e.description || null, participants: e.attendees.map((u) => lite(u)), rsvp_open: !e.cancelled && end > Date.now(), meetup_id: e.cancelled ? null : e.id };
}

/** Social opens event check-in an hour before the start and closes it six hours after the end. */
function meetup(e: S.SEvent, myUserId: string | null): T.Meetup {
  const start = new Date(e.starts_at).getTime();
  const end = new Date(e.ends_at ?? e.starts_at).getTime();
  return {
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    location: { name: e.online ? 'Online' : e.venue || 'On campus', zone_id: null },
    event_id: e.id,
    attendees: e.attendees.map((u) => ({ ...lite(u), checked_in: u.id === myUserId && e.checked_in })),
    my_check_in_at: e.checked_in ? e.starts_at : null,
    check_in_opens_at: new Date(start - 3600_000).toISOString(),
    check_in_closes_at: new Date(end + 6 * 3600_000).toISOString(),
  };
}

const CHALLENGE_TYPES: T.ChallengeTypeInfo[] = [
  { id: 'km_duel', label: 'Distance duel', description: 'Who runs and walks more km in 7 days. Counted from your recorded activities.', requires_zone: false, targets: ['user'] },
  { id: 'workout_duel', label: 'Workout duel', description: 'Who logs more workouts in 7 days. Counted from the form coach.', requires_zone: false, targets: ['user'] },
];

function invite(c: S.SChallenge): T.ChallengeInvite {
  const from = c.i_challenged ? c.me.user : c.opponent.user;
  const to = c.i_challenged ? c.opponent.user : c.me.user;
  const type = c.metric === 'workouts' ? 'workout_duel' : 'km_duel';
  const status: T.InviteStatus = c.status === 'accepted' ? 'active' : c.status === 'finished' ? 'completed' : (c.status as T.InviteStatus);
  const unit = c.metric === 'workouts' ? 'workouts' : 'km';
  const winner = c.winner_id ? [c.me.user, c.opponent.user].find((u) => u.id === c.winner_id) ?? null : null;
  return {
    id: c.id,
    type,
    type_label: CHALLENGE_TYPES.find((t) => t.id === type)!.label,
    from: lite(from),
    target: { type: 'user', person: lite(to) },
    zone: null,
    starts_at: c.starts_at ?? c.created_at,
    message: `${c.days}-day ${unit} duel · you ${c.me.score} – ${c.opponent.score} them`,
    status,
    direction: c.i_challenged ? 'outgoing' : 'incoming',
    created_at: c.created_at,
    result: c.status === 'finished' ? { winner: winner ? lite(winner) : null, summary: winner ? `${winner.display_name} won ${c.me.score}–${c.opponent.score}` : `Draw ${c.me.score}–${c.opponent.score}` } : null,
  };
}

const notification = (n: S.SNotification): T.AppNotification => {
  const d = n.data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : undefined);
  const type = n.kind === 'follow' || n.kind === 'follow_request' ? 'poke' : n.kind === 'challenge' ? 'invite' : n.kind.startsWith('territory') ? 'territory' : n.kind;
  return {
    id: n.id,
    type,
    actor: n.actor ? { ...lite(n.actor), level: n.actor.level } : null,
    text: [n.title, n.body].filter(Boolean).join(' — '),
    created_at: n.created_at,
    read: n.read,
    data: { route: str('route'), user_id: str('user_id') ?? n.actor?.id, event_id: str('event_id'), invite_id: str('challenge_id'), zone_id: str('zone_id') },
  };
};

const person = (u: S.SFollowListItem): T.PersonSummary => ({
  ...lite(u),
  level: u.level,
  xp: 0,
  proximity: null,
  relationship: 'none',
});

const card = (u: S.SFollowListItem): T.PersonCard => ({
  ...lite(u),
  connection_mode: null,
  bio: null,
  activity: null,
  shared: { shared_zones: [], shared_crews: [], shared_events: [], icebreakers: [] },
  match_reason: u.interests.length ? `Into ${u.interests.slice(0, 2).join(' & ')}` : null,
});

function relationship(userId: string, f: S.SFollowStatus): T.Relationship {
  const state: T.RelationshipState = f.following && f.followed_by ? 'friends' : f.following || f.requested ? 'poked' : f.followed_by ? 'poked_you' : 'none';
  return { user_id: userId, state, can_poke: state !== 'friends' && !f.following && !f.requested, reason: null, poked_at: null, friends_since: null };
}

async function poke(userId: string): Promise<T.PokeResult> {
  const f = await socialApi.follow(userId);
  const rel = relationship(userId, f);
  let friend: T.PokeResult['friend'] = null;
  if (rel.state === 'friends') {
    const p = await socialApi.profile(userId).catch(() => null);
    if (p) friend = { ...lite(p.user, p.user.hostel), level: p.stats.level, xp: p.stats.xp };
  }
  return { relationship: rel, friendship_created: rel.state === 'friends', friend };
}

/** Live counters from the Run Module and the Exercise backend; null when that service isn't connected. */
async function liveCounts(): Promise<{ running: number | null; working: number | null }> {
  const [r, w] = await Promise.all([
    API_CONFIGURED ? api<{ running_now: number }>('/v1/live', { base: API_URL }).then((x) => x.running_now, () => null) : Promise.resolve(null),
    EXERCISE_API_CONFIGURED ? api<{ working_out_now: number }>('/api/live', { base: EXERCISE_API_URL }).then((x) => x.working_out_now, () => null) : Promise.resolve(null),
  ]);
  return { running: typeof r === 'number' ? r : null, working: typeof w === 'number' ? w : null };
}

const PERIOD = (p: T.LeaderboardPeriod) => {
  if (p === 'alltime') throw notLive('The all-time board');
  return p;
};

/** Upload results by id, so GET-style `media()` can answer from the completed upload. */
const mediaCache = new Map<string, T.MediaItem>();

export const socialCampusApi: Partial<T.CampusApi> = {
  async config() {
    const c = await socialApi.communityConfig();
    return {
      campus: { id: 'iiser-kolkata', name: 'IISER Kolkata', short_name: 'IISER K', email_domains: ALLOWED_EMAIL_DOMAINS, center: [22.9636, 88.5245], launched_at: null, courses: undefined },
      features: {
        create_crew: true,
        create_event: true,
        defend: false,
        open_to_meet: false,
        date_mode: { available: false, reason: 'Date Mode switches on once its safety checks are live.', requirements: [] },
        meetup_safety_notifications: true,
      },
      realtime_url: null,
      hostels: c.hostels,
    };
  },

  async stats() {
    const [m, live, crews] = await Promise.all([socialApi.membership().catch(() => null), liveCounts(), socialApi.crews().catch(() => null)]);
    const cfg = await socialApi.communityConfig().catch(() => null);
    const total = m?.members_total ?? 0;
    const moving = live.running == null && live.working == null ? null : (live.running ?? 0) + (live.working ?? 0);
    return {
      users_total: total,
      users_active_now: moving,
      running_now: live.running,
      working_out_now: live.working,
      zones_total: null,
      zones_claimed: null,
      crews_total: crews ? crews.items.length : null,
      founding_spots_left: cfg ? Math.max(0, cfg.founding_total - total) : null,
      updated_at: new Date().toISOString(),
    };
  },

  async me() {
    const [p, m] = await Promise.all([socialApi.myProfile(), socialApi.membership().catch(() => null)]);
    return me(p, m);
  },
  async updateMe(patch) {
    const body: S.SProfilePatch = {};
    if (patch.display_name !== undefined) body.display_name = patch.display_name;
    if (patch.bio !== undefined) body.bio = patch.bio;
    if (patch.hostel_zone_id !== undefined) {
      const h = patch.hostel_zone_id.replace(/^hostel:/, '');
      const cfg = await socialApi.communityConfig().catch(() => null);
      const match = cfg?.hostels.find((x) => x.toLowerCase() === h.toLowerCase() || h.toLowerCase().includes(x.toLowerCase()));
      if (match) body.hostel = match;
    }
    // connection_mode / onboarding / date mode have no Social field; they're kept on the device.
    const p = Object.keys(body).length ? await socialApi.updateMyProfile(body) : await socialApi.myProfile();
    const m = await socialApi.membership().catch(() => null);
    return me(p, m);
  },
  async profile(userId) {
    return profile(await socialApi.profile(userId), null);
  },
  async badges() {
    return (await socialApi.myProfile()).badges.map(badge);
  },

  async crews({ q, scope }) {
    const r = await socialApi.crews(scope === 'mine', q);
    return { items: r.items.map(crew), next_cursor: r.next_cursor };
  },
  async crew(crewId) {
    const c = await socialApi.crew(crewId);
    const meta: Record<string, T.CrewMemberMeta> = {};
    for (const m of c.members) meta[m.user.id] = { role: m.role, vouches: m.vouches, vouched_by_me: m.vouched_by_me, is_me: m.is_me };
    return { ...crew(c), members: c.members.map((m) => lite(m.user)), member_meta: meta, territories: [], upcoming_events: c.upcoming_events.map(eventSummary) };
  },
  async joinCrew(crewId) {
    return crew(await socialApi.joinCrew(crewId));
  },
  async leaveCrew(crewId) {
    await socialApi.leaveCrew(crewId);
    return crew(await socialApi.crew(crewId));
  },
  async createCrew(input) {
    const interest = (S_INTEREST_SET.has(input.interest ?? '') ? input.interest : 'running') as S.SInterest;
    return crew(await socialApi.createCrew({ name: input.name, tagline: input.description, interest, meets: input.meets, scope: 'campus', hostel: myHostel }));
  },

  async events({ scope }) {
    const r = await socialApi.events(scope ?? 'upcoming');
    return { items: r.items.filter((e) => !e.cancelled).map(eventSummary), next_cursor: r.next_cursor };
  },
  async event(eventId) {
    return eventDetail(await socialApi.event(eventId));
  },
  async rsvp(eventId, going) {
    return eventDetail(going ? await socialApi.rsvp(eventId, 'going') : await socialApi.cancelRsvp(eventId));
  },
  async createEvent(input) {
    const kind = (S_INTEREST_SET.has(String(input.type)) ? input.type : input.type === 'run' ? 'running' : input.type === 'walk' || input.type === 'study_break_walk' ? 'walking' : 'other') as S.SInterest;
    return eventDetail(
      await socialApi.createEvent({ title: input.title, description: input.description, kind, venue: input.venue, starts_at: input.starts_at, ends_at: input.ends_at ?? null, capacity: input.capacity ?? null, crew_id: input.crew_id ?? null }),
    );
  },

  async meetups() {
    const [r, id] = await Promise.all([socialApi.events('mine'), meId().catch(() => null)]);
    return r.items.filter((e) => !e.cancelled).map((e) => meetup(e, id));
  },
  async meetup(meetupId) {
    const [e, id] = await Promise.all([socialApi.event(meetupId), meId().catch(() => null)]);
    return meetup(e, id);
  },
  async checkIn(meetupId, notify, notifyUserIds = []) {
    const ids = notify ? notifyUserIds.slice(0, 5) : [];
    const c = await socialApi.eventCheckIn(meetupId, ids);
    return {
      meetup_id: meetupId,
      checked_in_at: c.created_at,
      safety_notification: {
        requested: ids.length > 0,
        status: !ids.length ? 'skipped' : c.notified > 0 ? 'sent' : 'failed',
        contact_label: c.notified > 0 ? `${c.notified} friend${c.notified === 1 ? '' : 's'}` : null,
      },
    };
  },

  async squirrelBoard(period, limit = 10) {
    const b = await socialApi.xpBoard(PERIOD(period), limit);
    if (!b.available) throw notLive('The XP leaderboard');
    const row = (e: S.SXpEntry): T.SquirrelRow => ({ ...lite(e.user, e.hostel), rank: e.rank, xp: e.xp, zones_claimed: null, distance_m: null });
    return { period, entries: b.entries.map(row), me: b.me ? row(b.me) : null, updated_at: new Date().toISOString() };
  },
  async hostelBoard(period) {
    const b = await socialApi.hostelBoard(PERIOD(period));
    if (!b.enabled || !b.available) throw notLive('Hostel vs Hostel');
    const mine = b.entries.find((e) => e.is_mine);
    return {
      period,
      entries: b.entries.map((e) => ({ rank: e.rank, hostel_id: e.hostel, name: e.hostel, score: e.xp, territories: null, active_members: e.active, distance_m: null })),
      my_hostel_id: mine?.hostel ?? null,
      updated_at: new Date().toISOString(),
    };
  },

  async notifications() {
    const r = await socialApi.notifications();
    return { items: r.items.map(notification), unread: r.unread };
  },
  async markNotificationsRead(ids) {
    return socialApi.markRead(ids.length ? ids : null);
  },

  async createUpload(input) {
    return socialApi.createUpload(input.purpose === 'avatar' ? 'avatar' : 'post', input.content_type, input.byte_size);
  },
  async completeUpload(mediaId) {
    const m = await socialApi.completeUpload(mediaId);
    const item: T.MediaItem = { media_id: m.media_id, status: m.status, url: m.url, moderation: m.status === 'ready' ? 'approved' : 'pending' };
    mediaCache.set(mediaId, item);
    return item;
  },
  async media(mediaId) {
    const m = mediaCache.get(mediaId);
    if (!m) throw new ApiError(404, 'Photo not found', { code: 'media_not_found', detail: 'Photo not found' });
    return m;
  },

  async challengeTypes() {
    return CHALLENGE_TYPES;
  },
  async invites(box) {
    const r = await socialApi.challenges();
    const all = r.items.map(invite);
    return box === 'all' ? all : all.filter((i) => i.direction === box);
  },
  async createInvite(input) {
    if (input.target.type !== 'user') throw new ApiError(422, 'Duels are one-on-one', { code: 'invalid', detail: 'Duels are one-on-one. Pick a person.' });
    return invite(await socialApi.createChallenge(input.target.id, input.type === 'workout_duel' ? 'workouts' : 'km', 7));
  },
  async respondInvite(inviteId, action) {
    return invite(await socialApi.respondChallenge(inviteId, action));
  },

  async suggestedPeople(mode) {
    if (mode === 'date') throw notLive('Date Mode');
    const r = await api<S.SUserPage>('/v1/users/suggestions?limit=20', { base: socialBase() });
    return r.items.filter((u) => !u.is_me).map(card);
  },
  async searchPeople(q) {
    const r = await socialApi.searchUsers(q);
    return r.items.filter((u) => !u.is_me).map(person);
  },

  async pokeStatus(userId) {
    return relationship(userId, await api<S.SFollowStatus>(`/v1/users/${encodeURIComponent(userId)}/follow-status`, { base: socialBase() }));
  },
  sendPoke: (userId) => poke(userId),
  pokeBack: (userId) => poke(userId),
  async incomingPokes() {
    const id = await meId();
    const r = await api<S.SUserPage>(`/v1/users/${encodeURIComponent(id)}/followers?limit=50`, { base: socialBase() });
    return r.items
      .filter((u) => !u.following && !u.is_me)
      .map((u) => ({ id: u.id, from: { ...lite(u), level: u.level, xp: 0 }, created_at: u.followed_at ?? new Date().toISOString(), status: 'pending' as const }));
  },
  async friendshipStatus(userId) {
    const rel = await socialCampusApi.pokeStatus!(userId);
    return { user_id: userId, friends: rel.state === 'friends', since: null };
  },
};

