/**
 * REST implementation of the campus contract. Every route is listed here and nowhere else, so
 * when the backend lands (or differs), this file is the only thing to adapt.
 *
 * Auth: the shared client attaches the same bearer token the Run Module uses.
 * Reads go through withRetry (429 / 5xx / network); writes that change ownership send an
 * idempotency key and are NOT blindly retried — the screen reconciles with the response.
 */
import { api } from '@/api/client';
import { CAMPUS_API_URL } from '@/api/config';
import { withRetry } from '@/api/endpoints';
import type * as T from '@/api/campus/types';

const base = CAMPUS_API_URL;
const get = <R,>(path: string) => withRetry(() => api<R>(path, { base }));
const send = <R,>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) => api<R>(path, { base, method, body });
const qs = (p: Record<string, string | number | undefined>) => {
  const s = Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
const id = encodeURIComponent;

export const httpCampusApi: T.CampusApi = {
  config: () => get<T.AppConfig>('/v1/config'),
  stats: () => get<T.LaunchStats>('/v1/campus/stats'),

  me: () => get<T.Me>('/v1/me'),
  updateMe: (patch) => send<T.Me>('/v1/me', 'PATCH', patch),
  setOpenToMeet: (enabled) => send<T.OpenToMeet>('/v1/me/open-to-meet', 'PUT', { enabled }),
  profile: (userId) => get<T.Profile>(`/v1/users/${id(userId)}`),
  sharedContext: (userId) => get<T.SharedContext>(`/v1/users/${id(userId)}/context`),
  badges: async () => (await get<{ badges: T.Badge[] }>('/v1/me/badges')).badges,

  zones: async () => (await get<{ zones: T.Zone[] }>('/v1/zones')).zones,
  territories: () => get<{ territories: T.Territory[]; as_of: string }>('/v1/territories'),
  zone: (zoneId) => get<T.ZoneDetail>(`/v1/zones/${id(zoneId)}`),
  territoryAction: (zoneId, action, idempotencyKey) => send<T.TerritoryActionResult>(`/v1/zones/${id(zoneId)}/${action}`, 'POST', { idempotency_key: idempotencyKey }),

  submitActivity: (input) => send<{ activity_id: string }>('/v1/activities', 'POST', input),
  activityZones: (activityId) => get<T.ActivityZones>(`/v1/runs/${id(activityId)}/zones`),

  crews: ({ q, scope }) => get<T.Page<T.Crew>>(`/v1/crews${qs({ q, scope })}`),
  crew: (crewId) => get<T.CrewDetail>(`/v1/crews/${id(crewId)}`),
  joinCrew: (crewId) => send<T.Crew>(`/v1/crews/${id(crewId)}/join`, 'POST'),
  leaveCrew: (crewId) => send<T.Crew>(`/v1/crews/${id(crewId)}/leave`, 'POST'),
  createCrew: (input) => send<T.Crew>('/v1/crews', 'POST', input),

  events: ({ scope }) => get<T.Page<T.EventSummary>>(`/v1/events${qs({ scope })}`),
  event: (eventId) => get<T.EventDetail>(`/v1/events/${id(eventId)}`),
  rsvp: (eventId, going) => send<T.EventDetail>(`/v1/events/${id(eventId)}/rsvp`, going ? 'PUT' : 'DELETE'),

  suggestedPeople: async (mode) => (await get<{ people: T.PersonCard[] }>(`/v1/people/suggested${qs({ mode })}`)).people,
  activeNow: () => get<T.ActiveNow>('/v1/people/active'),

  challengeTypes: async () => (await get<{ types: T.ChallengeTypeInfo[] }>('/v1/challenge-invites/types')).types,
  invites: async (box) => (await get<{ invites: T.ChallengeInvite[] }>(`/v1/challenge-invites${qs({ box })}`)).invites,
  createInvite: (input) => send<T.ChallengeInvite>('/v1/challenge-invites', 'POST', input),
  respondInvite: (inviteId, action) => send<T.ChallengeInvite>(`/v1/challenge-invites/${id(inviteId)}/${action}`, 'POST'),

  squirrelBoard: (period, limit = 10) => get<T.SquirrelBoard>(`/v1/leaderboards/squirrels${qs({ period, limit })}`),
  hostelBoard: (period) => get<T.HostelBoard>(`/v1/leaderboards/hostels${qs({ period })}`),

  meetups: async () => (await get<{ meetups: T.Meetup[] }>('/v1/meetups')).meetups,
  meetup: (meetupId) => get<T.Meetup>(`/v1/meetups/${id(meetupId)}`),
  checkIn: (meetupId, notify) => send<T.CheckInResult>(`/v1/meetups/${id(meetupId)}/check-in`, 'POST', { notify_safety_contact: notify }),
};

/** Human list of routes, for docs and the "missing endpoints" report. */
export const CAMPUS_ROUTES = [
  'GET /v1/config',
  'GET /v1/campus/stats',
  'GET /v1/me',
  'PATCH /v1/me',
  'PUT /v1/me/open-to-meet',
  'GET /v1/me/badges',
  'GET /v1/users/{id}',
  'GET /v1/users/{id}/context',
  'GET /v1/zones',
  'GET /v1/territories',
  'GET /v1/zones/{id}',
  'POST /v1/zones/{id}/claim | steal | defend',
  'GET /v1/runs/{id}/zones',
  'POST /v1/activities (dev/mock recorder only)',
  'GET /v1/crews, GET /v1/crews/{id}, POST /v1/crews, POST /v1/crews/{id}/join | leave',
  'GET /v1/events, GET /v1/events/{id}, PUT|DELETE /v1/events/{id}/rsvp',
  'GET /v1/people/suggested?mode=friends|date',
  'GET /v1/people/active',
  'GET /v1/challenge-invites/types, GET|POST /v1/challenge-invites, POST /v1/challenge-invites/{id}/accept | decline | cancel',
  'GET /v1/leaderboards/squirrels, GET /v1/leaderboards/hostels',
  'GET /v1/meetups, GET /v1/meetups/{id}, POST /v1/meetups/{id}/check-in',
  'WS realtime_url (territory.updated, stats.updated, invite.updated, event.updated, active.updated)',
] as const;
