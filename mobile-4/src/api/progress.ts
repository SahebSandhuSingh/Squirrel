/**
 * Progress, XP and leaderboards — the app's contract (routes under /v1).
 *
 * ADR-032 cancelled the separate progress-service. Its endpoints are moving to their owners one by
 * one; each call goes to the service that serves it now:
 *   Run Module (EXPO_PUBLIC_API_URL):  GET /v1/progress, /daily, /weekly, /history, GET /v1/xp
 *   not served yet (EXPO_PUBLIC_PROGRESS_API_URL, never set, so these stay "not connected"):
 *     leaderboards
 * Challenges left this contract: Goals call the Run Module (api/runChallenges.ts).
 * Move a method to `runBase` (and its screen to `progressReadsLive`) as its endpoint goes live.
 *
 *
 * The server owns XP, levels, streaks, challenge progress/completion and leaderboards; the app only
 * reads them. There is no activity intake from the app: a camera workout reaches the server through
 * Exercise's own session row, runs through the Run Module, and hand-tapped reps (the partner race)
 * earn nothing, so reporting workouts from the phone would double-count one and let tapping earn XP.
 *
 *   GET  /v1/me                              PATCH /v1/me { displayName, avatarUrl, campus, timezone }
 *   GET  /v1/progress                         lifetime + today
 *   GET  /v1/progress/daily?date=YYYY-MM-DD
 *   GET  /v1/progress/weekly?weekStart=YYYY-MM-DD   + previous week and change ratios
 *   GET  /v1/progress/history?days=N | from&to
 *   GET  /v1/xp                               GET /v1/xp/history
 *   GET  /v1/leaderboards/{global|friends|campus}?period=daily|weekly|alltime
 * Errors are `{ code, detail }` (the shared client surfaces `detail`; `code` is on ApiError.body).
 */
import { api, ApiError } from '@/api/client';
import { API_CONFIGURED, API_URL, PROGRESS_API_URL } from '@/api/config';

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


// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** The Run Module, which serves the progress reads and the XP summary. */
const runBase = API_URL;
/** Not served by anyone yet: leaderboards. */
const base = PROGRESS_API_URL;
const q = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const progressApi = {
  lifetime: () => api<LifetimeProgress>('/v1/progress', { base: runBase }),
  daily: (date?: string) => api<DailyProgress>(`/v1/progress/daily${q({ date })}`, { base: runBase }),
  weekly: (weekStart?: string) => api<WeeklyProgress>(`/v1/progress/weekly${q({ weekStart })}`, { base: runBase }),
  history: (days: number) => api<ProgressHistory>(`/v1/progress/history${q({ days })}`, { base: runBase }),
  xp: () => api<XpSummary>('/v1/xp', { base: runBase }),
  leaderboard: (kind: 'global' | 'friends' | 'campus', period: XpBoard['period'] = 'weekly', limit = 50) =>
    api<XpBoard>(`/v1/leaderboards/${kind}${q({ period, limit })}`, { base }),
};

/** The progress reads and XP (Run Module) are reachable in this build. */
export const PROGRESS_READS_CONFIGURED = API_CONFIGURED;
/** Progress reads and XP can be fetched: the Run Module is configured and we're signed in. */
export const progressReadsLive = (mode: string) => PROGRESS_READS_CONFIGURED && mode === 'live';

/** The `code` from a progress-service error body (`{ code, detail }`). */
export const errorCode = (e: unknown): string | null => {
  const b = e instanceof ApiError ? (e.body as { code?: unknown } | undefined) : undefined;
  return typeof b?.code === 'string' ? b.code : null;
};

