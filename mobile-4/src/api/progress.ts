/**
 * progress-service — REST contract (source of truth: ../progress-service, routes under /v1).
 *
 * The server owns XP, levels, streaks, challenge progress/completion and leaderboards. The app
 * only *reports* activity (bounded STEP_COUNT / WORKOUT_COMPLETED events with an idempotency
 * key) and reads the results. Runs reach the service from the Run Module, never from the app.
 *
 *   GET  /v1/me                              PATCH /v1/me { displayName, avatarUrl, campus, timezone }
 *   GET  /v1/progress                         lifetime + today
 *   GET  /v1/progress/daily?date=YYYY-MM-DD
 *   GET  /v1/progress/weekly?weekStart=YYYY-MM-DD   + previous week and change ratios
 *   GET  /v1/progress/history?days=N | from&to
 *   GET  /v1/xp                               GET /v1/xp/history
 *   POST /v1/activities { events: [...] }    GET /v1/activities
 *   GET  /v1/challenges?kind&status=current|ended|mine
 *   GET  /v1/challenges/{id}  /progress        POST /join  POST /leave
 *   POST /v1/challenges/head-to-head { opponentId, metric, durationHours }
 *   GET  /v1/leaderboards/{global|friends|campus}?period=daily|weekly|alltime
 *   GET  /v1/leaderboards/{challenge|group}?challengeId=
 * Errors are `{ code, detail }` (the shared client surfaces `detail`; `code` is on ApiError.body).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError, hasApiToken } from '@/api/client';
import { PROGRESS_API_CONFIGURED, PROGRESS_API_URL } from '@/api/config';

// ---------------------------------------------------------------------------
// Types (exact response shapes)
// ---------------------------------------------------------------------------

export type LevelInfo = { level: number; currentXP: number; xpForCurrentLevel: number; xpForNextLevel: number; progress: number };
export type Streak = { current: number; longest: number; lastQualifyingDate: string | null; todayStatus: 'done' | 'at_risk' | 'none' };

export type DayRow = {
  date: string;
  xp: number;
  steps: number;
  workouts: number;
  workoutMinutes: number;
  activeMinutes: number;
  distanceKm: number;
  calories: number;
  challengesCompleted: number;
  goalsCompleted: number;
};
export type DailyGoal = { id: string; label: string; current: number; target: number; xp: number; completed: boolean };
export type DailyProgress = DayRow & { goals: DailyGoal[]; goalsTotal: number; streak: Streak; isToday: boolean };

export type WeekTotals = Omit<DayRow, 'date'> & { activeDays: number };
export type WeeklyProgress = WeekTotals & {
  weekStart: string;
  weekEnd: string;
  streak: Streak;
  previous: WeekTotals;
  /** (this − previous) / previous; null when last week was 0. */
  change: Record<'xp' | 'steps' | 'workouts' | 'workoutMinutes' | 'activeMinutes' | 'challengesCompleted', number | null>;
  days: DayRow[];
};
export type ProgressHistory = { from: string; to: string; days: DayRow[] };

export type LifetimeProgress = {
  userId: string;
  timezone: string;
  totalXp: number;
  level: LevelInfo;
  totalWorkouts: number;
  totalWorkoutMinutes: number;
  totalActiveMinutes: number;
  totalSteps: number;
  totalDistanceKm: number;
  totalCalories: number;
  challengesCompleted: number;
  streak: Streak;
  today: DailyProgress;
};

export type XpSummary = { totalXp: number; level: LevelInfo; today: number; week: number; bySource: Record<string, number> };

export type ServerChallengeKind = 'daily' | 'head_to_head' | 'group' | 'special';
export type ServerMetric = 'steps' | 'active_minutes' | 'workout_minutes' | 'workouts' | 'distance_km' | 'territory_km2';
export type ParticipantStatus = 'invited' | 'active' | 'completed' | 'left' | 'won' | 'lost' | 'tied' | 'failed' | 'cancelled';
export type ChallengeProgress = { current: number; target: number; progress: number | null; completed: boolean; status: ParticipantStatus | null };

export type ServerChallenge = {
  id: string;
  kind: ServerChallengeKind;
  title: string;
  description: string;
  icon: string | null;
  metric: ServerMetric;
  unit: string;
  target: number;
  xpReward: number;
  startsAt: string;
  endsAt: string;
  endsInMinutes: number;
  status: 'upcoming' | 'active' | 'completed' | 'ended' | 'cancelled';
  participants: number;
  maxParticipants: number | null;
  rules: { minLevel?: number; campus?: string; [k: string]: unknown };
  joined: boolean;
  canJoin: boolean;
  closedReason: string | null;
  /** Why you can't join although it's open (level, campus, capacity); null when you can. */
  ineligible: { code: 'not_eligible' | 'challenge_full'; detail: string } | null;
  me: ChallengeProgress;
  group?: { name: string | null; collective: number; members: number; completedAt: string | null };
  xpRewardTie?: number;
  opponent?: { userId: string; name: string | null; avatar: string | null; score: number; status: ParticipantStatus } | null;
  winnerUserId?: string | null;
  invited?: boolean;
};

export type BoardUser = { rank: number; userId: string; name: string | null; avatar: string | null; xp: number };
export type XpBoard = {
  type: 'global' | 'friends' | 'campus';
  period: 'daily' | 'weekly' | 'alltime';
  metric: 'xp';
  rank: number | null;
  me: { rank: number; xp: number } | null;
  users: BoardUser[];
  total: number;
  nextCursor: number | null;
};

export type ClientActivityType = 'STEP_COUNT' | 'WORKOUT_COMPLETED';
export type ActivityEventInput = {
  idempotencyKey: string;
  type: ClientActivityType;
  /** STEP_COUNT: today's cumulative total. WORKOUT_COMPLETED: minutes. */
  value: number;
  /** ISO-8601 with offset. */
  occurredAt: string;
  metadata?: { exercise?: string; reps?: number; calories?: number; sessionId?: string };
};
export type ActivityResult =
  | { idempotencyKey: string; status: 'accepted' | 'duplicate'; eventId?: string; xpAwarded?: number; goalsCompleted?: string[]; challengesCompleted?: string[] }
  | { idempotencyKey: string; status: 'rejected'; code: string; detail: string };
export type ActivitiesResponse = { results: ActivityResult[]; progress: DailyProgress; xp: XpSummary };

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const base = PROGRESS_API_URL;
const q = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const progressApi = {
  lifetime: () => api<LifetimeProgress>('/v1/progress', { base }),
  daily: (date?: string) => api<DailyProgress>(`/v1/progress/daily${q({ date })}`, { base }),
  weekly: (weekStart?: string) => api<WeeklyProgress>(`/v1/progress/weekly${q({ weekStart })}`, { base }),
  history: (days: number) => api<ProgressHistory>(`/v1/progress/history${q({ days })}`, { base }),
  xp: () => api<XpSummary>('/v1/xp', { base }),
  challenges: (status: 'current' | 'ended' | 'mine' = 'current') => api<{ challenges: ServerChallenge[] }>(`/v1/challenges${q({ status })}`, { base }),
  join: (id: string) => api<ServerChallenge>(`/v1/challenges/${encodeURIComponent(id)}/join`, { base, method: 'POST' }),
  leave: (id: string) => api<ServerChallenge>(`/v1/challenges/${encodeURIComponent(id)}/leave`, { base, method: 'POST' }),
  leaderboard: (kind: 'global' | 'friends' | 'campus', period: XpBoard['period'] = 'weekly', limit = 50) =>
    api<XpBoard>(`/v1/leaderboards/${kind}${q({ period, limit })}`, { base }),
  postActivities: (events: ActivityEventInput[]) => api<ActivitiesResponse>('/v1/activities', { base, body: { events } }),
};

/** Live = the service is configured and we're signed in (the service authenticates the same bearer token). */
export const progressLive = (mode: string) => PROGRESS_API_CONFIGURED && mode === 'live';

/** The `code` from a progress-service error body (`{ code, detail }`). */
export const errorCode = (e: unknown): string | null => {
  const b = e instanceof ApiError ? (e.body as { code?: unknown } | undefined) : undefined;
  return typeof b?.code === 'string' ? b.code : null;
};

// ---------------------------------------------------------------------------
// Offline activity queue
//
// Activity is queued first and then flushed, so a workout finished offline (or while the
// service is down) is delivered later. Every event carries its idempotency key, so a flush
// that is retried after a lost response can't double-count: the server answers "duplicate".
// Accepted, duplicate and rejected events leave the queue (a rejection is final); network
// errors, 5xx and 401 keep it for the next flush. Items are stored one per key so no single
// secure-store value grows past the platform's size guidance.
// ---------------------------------------------------------------------------

const INDEX_KEY = 'squirrel.pq.index';
const ITEM_KEY = (id: string) => `squirrel.pq.${id}`;
const MAX_QUEUE = 100;
/** The server refuses events older than its offline-sync window (7 days by default). */
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const store = {
  get: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

async function readIndex(): Promise<string[]> {
  try {
    const raw = await store.get(INDEX_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Serialise queue mutations (enqueue during a flush must not lose writes). */
let chain: Promise<unknown> = Promise.resolve();
const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
};

const shortId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newIdempotencyKey = (prefix: string) => `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function enqueueActivity(ev: ActivityEventInput): Promise<void> {
  return locked(async () => {
    const index = await readIndex();
    const id = shortId();
    await store.set(ITEM_KEY(id), JSON.stringify(ev));
    const next = [...index, id];
    for (const drop of next.slice(0, Math.max(0, next.length - MAX_QUEUE))) await store.del(ITEM_KEY(drop));
    await store.set(INDEX_KEY, JSON.stringify(next.slice(-MAX_QUEUE)));
  });
}

export type FlushResult = { sent: number; pending: number; response?: ActivitiesResponse };

/** Send everything queued. Safe to call often and concurrently (calls are serialised). */
export function flushActivities(): Promise<FlushResult> {
  return locked(async () => {
    const index = await readIndex();
    if (!index.length || !PROGRESS_API_CONFIGURED || !hasApiToken()) return { sent: 0, pending: index.length };
    const items: { id: string; ev: ActivityEventInput }[] = [];
    const stale: string[] = [];
    for (const id of index) {
      try {
        const raw = await store.get(ITEM_KEY(id));
        const ev = raw ? (JSON.parse(raw) as ActivityEventInput) : null;
        if (!ev || Date.now() - Date.parse(ev.occurredAt) > MAX_AGE_MS) stale.push(id);
        else items.push({ id, ev });
      } catch {
        stale.push(id);
      }
    }
    let response: ActivitiesResponse | undefined;
    const done = new Set(stale);
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50);
      try {
        response = await progressApi.postActivities(batch.map((b) => b.ev));
        batch.forEach((b) => done.add(b.id)); // accepted, duplicate or (finally) rejected
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) batch.forEach((b) => done.add(b.id)); // malformed: never going to succeed
        break; // offline / 5xx / 401: keep the rest for next time
      }
    }
    for (const id of done) await store.del(ITEM_KEY(id));
    const remaining = index.filter((id) => !done.has(id));
    await store.set(INDEX_KEY, JSON.stringify(remaining));
    return { sent: items.filter((b) => done.has(b.id)).length, pending: remaining.length, response };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human copy for challenge error codes (join/leave). */
export function challengeErrorText(e: unknown): string {
  const code = errorCode(e);
  switch (code) {
    case 'already_joined':
      return "You're already in this challenge";
    case 'already_completed':
      return 'Already completed';
    case 'challenge_expired':
    case 'challenge_closed':
      return 'This challenge has ended';
    case 'challenge_not_started':
      return "This challenge hasn't started yet";
    case 'challenge_full':
      return 'This challenge is full';
    case 'not_eligible':
      return e instanceof Error ? e.message : 'Not eligible for this challenge';
    default:
      if (e instanceof ApiError && e.status === 401) return 'Sign in again to take part';
      if (e instanceof ApiError && e.status === 0) return "You're offline — try again when connected";
      return e instanceof Error ? e.message : 'Something went wrong';
  }
}
