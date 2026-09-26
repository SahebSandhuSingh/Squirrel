/**
 * Exercise Mechanics backend — REST contract.
 *
 * Source of truth: Exercise_Mechanics--main/backend (FastAPI). Routes, from its routers:
 *   users/router.py     POST /api/users                         → { user_id, first_name, last_name }
 *                       GET  /api/users/{id}                    → profile.json
 *                       GET  /api/users/{id}/skill              → { skill_level, configured }
 *                       POST /api/users/{id}/skill              → { skill_level, configured: true }
 *   workouts/router.py  GET  /api/exercises                     → { exercises: [{ id, view, status }] }
 *   sessions/router.py  POST /api/users/{id}/sessions           → 201 SessionCreated (one exercise per session)
 *   reports/router.py   GET  /api/users/{id}/progress           → ProgressData
 *                       GET  /api/users/{id}/activity/{year}    → { dates: ['YYYY-MM-DD'] }
 *                       GET  /api/users/{id}/sessions           → { sessions: SessionListItem[] }
 *                       GET  /api/users/{id}/sessions/{sid}/overview
 *                       GET  /api/users/{id}/sessions/{sid}/report
 *                       GET  /api/users/{id}/sessions/{sid}/exercises/{ex}/report
 * Response shapes match the backend's own client (frontend-react/src/flow/storage.ts).
 *
 * Not REST: live coaching runs over /ws/setup and /ws/train and streams 33 MediaPipe pose
 * landmarks per camera frame. The mobile app has no on-device pose model, so those sockets
 * are not used here (see README).
 *
 * The backend has no auth: identity is the `user_id` minted by POST /api/users. The shared
 * client still sends the Run Module bearer token when signed in, so nothing changes once the
 * service starts checking it.
 */
import { EXERCISE_API_URL } from '@/api/config';
import { api } from '@/api/client';
import { withRetry } from '@/api/endpoints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** POST /api/users body. Field names match the backend UserProfile model one-to-one. */
export type ExerciseProfileInput = {
  first_name: string; // 1–80 chars
  last_name: string; // 1–80 chars
  gender: string;
  height_cm: number; // 0 < h < 300
  weight_kg: number; // 0 < w < 500
  date_of_birth: string; // YYYY-MM-DD
  mobile: string; // 3–32 chars
  email: string; // 3–200 chars
};
export type ExerciseUser = { user_id: string; first_name: string; last_name: string };
export type ExerciseProfile = ExerciseProfileInput & { user_id: string; created_at: string };

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export const SKILL_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced'];
export type SkillState = { skill_level: SkillLevel; configured: boolean };

export type ExerciseAvailability = { id: string; view: 'front' | 'side'; status: 'enabled' | 'planned' };

/** One exercise in POST /api/users/{id}/sessions. `value` is reps (measure 'reps') or seconds ('time'). */
export type SessionExerciseInput = {
  name: string; // 1–120
  slug: string; // ^[a-z0-9_]+$, must be an enabled catalog id
  variant?: 'single' | 'double';
  body_part: string;
  training_tag: string;
  measure: 'reps' | 'time'; // must equal the exercise's movement type
  sets: number; // 1–10
  value: number; // reps 1–50, seconds 1–300
  rest_seconds: number; // 0–300
};
export type SessionTarget = { type: 'reps'; value: number } | { type: 'time'; value_ms: number };
export type CreatedSession = {
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  variant: 'single' | 'double' | null;
  sets: number;
  target: SessionTarget;
  rest_seconds: number;
};

export type SessionListItem = { session_id: string; date: string; day: string; start_time: string; exercise: string; reps_completed: number };

export type OverviewExercise = {
  exercise_id: string;
  name: string;
  body_part: string | null;
  training_tag: string | null;
  measure: 'reps' | 'time';
  has_data: boolean;
  avg_form_score: number | null;
  planned: { sets: number; reps_per_set?: number; total?: number; duration_seconds?: number };
  actual?: { reps_completed: number; sets_completed: number };
  shallow_reps?: number;
  quality?: { good: number; borderline: number; poor: number };
};
export type SessionOverview = {
  session_id: string;
  date: string;
  day: string;
  start_time: string;
  skill_level: string;
  session_score: number | null;
  total_reps: number;
  total_time_s?: number | null;
  exercise_count: number;
  exercises: OverviewExercise[];
};

export type ReportByRule = { rule: string; issue_name: string; penalty_share: number; flagged_reps: number; avg_score: number };
export type Coaching = { rule: string; issue_name: string; reps: number[]; fix: string; text: string };

export type RepExerciseReport = {
  session_id: string; date: string; day: string; start_time: string; skill_level: string; exercise: string;
  exercise_id: string; measure: 'reps'; body_part: string | null; training_tag: string | null;
  planned: { sets: number; reps_per_set: number; total: number };
  actual: { reps_completed: number; sets_completed: number };
  depth_target?: number;
  summary: { avg_form_score: number | null; total_reps: number; shallow_reps: number; best: number | null; worst: number | null; avg_rep_time_s: number | null; total_time_s: number | null };
  per_rep: { rep: number; set: number; score: number; shallow: boolean; rom: number | null; time_s: number | null }[];
  per_set: { set: number; avg_score: number; reps: number; time_s: number | null }[];
  by_rule: ReportByRule[];
  coaching: Coaching[];
  insights: string[];
};
export type TimedExerciseReport = {
  session_id: string; date: string; day: string; start_time: string; skill_level: string; exercise: string;
  exercise_id: string; measure: 'time'; body_part: string | null; training_tag: string | null;
  planned: { sets: number; duration_seconds: number; total_duration_seconds: number };
  actual: { sets_completed: number; counted_lifts: number; detected_cycles: number };
  summary: { avg_form_score: number | null; total_time_s: number | null; counted_lifts: number; full_lifts: number; shallow_lifts: number; invalid_lifts: number };
  per_set: { set: number; avg_score: number; counted_lifts: number; detected_cycles: number; time_s: number | null }[];
  insights: string[];
};
export type ExerciseReport = RepExerciseReport | TimedExerciseReport;

export type ProgressSession = { session_id: string; date: string; day: string; start_time: string; score: number | null; reps: number; exercises: (string | null)[] };
export type ExerciseProgress = {
  sessions: ProgressSession[]; // oldest → newest
  totals: { sessions: number; reps: number; with_data: number };
  avg_form: number | null;
  latest_score: number | null;
  delta: number | null;
  best: { score: number; date: string; session_id: string } | null;
  streak_days: number;
  this_week: number;
  total_time_s?: number | null;
  insights: string[];
};

// ---------------------------------------------------------------------------
// Endpoints — same client, token and retry policy as the Run Module
// ---------------------------------------------------------------------------

const ex = <T>(path: string, init: { method?: string; body?: unknown } = {}) => api<T>(`/api${path}`, { ...init, base: EXERCISE_API_URL });
const u = (id: string) => `/users/${encodeURIComponent(id)}`;

export const exerciseApi = {
  // Non-idempotent creates are NOT retried: a lost response would mint a duplicate user/session.
  createUser: (profile: ExerciseProfileInput) => ex<ExerciseUser>('/users', { body: profile }),
  getProfile: (userId: string) => withRetry(() => ex<ExerciseProfile>(u(userId))),
  getSkill: (userId: string) => withRetry(() => ex<SkillState>(`${u(userId)}/skill`)),
  setSkill: (userId: string, level: SkillLevel) => withRetry(() => ex<SkillState>(`${u(userId)}/skill`, { body: { skill_level: level } })),

  catalog: () => withRetry(() => ex<{ exercises: ExerciseAvailability[] }>('/exercises')).then((r) => r.exercises ?? []),

  /** The backend accepts exactly one exercise per session (Prototype 1). */
  createSession: (userId: string, exercise: SessionExerciseInput) => ex<CreatedSession>(`${u(userId)}/sessions`, { body: { exercises: [exercise] } }),

  sessions: (userId: string) => withRetry(() => ex<{ sessions: SessionListItem[] }>(`${u(userId)}/sessions`)).then((r) => r.sessions ?? []),
  overview: (userId: string, sessionId: string) => withRetry(() => ex<SessionOverview>(`${u(userId)}/sessions/${encodeURIComponent(sessionId)}/overview`)),
  sessionReport: (userId: string, sessionId: string) => withRetry(() => ex<ExerciseReport>(`${u(userId)}/sessions/${encodeURIComponent(sessionId)}/report`)),
  exerciseReport: (userId: string, sessionId: string, exerciseId: string) =>
    withRetry(() => ex<ExerciseReport>(`${u(userId)}/sessions/${encodeURIComponent(sessionId)}/exercises/${encodeURIComponent(exerciseId)}/report`)),
  progress: (userId: string) => withRetry(() => ex<ExerciseProgress>(`${u(userId)}/progress`)),
  activity: (userId: string, year: number) => withRetry(() => ex<{ dates: string[] }>(`${u(userId)}/activity/${year}`)).then((r) => r.dates ?? []),
};

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const formScoreColor = (s: number | null | undefined, c: { good: string; mid: string; poor: string; none: string }) =>
  s == null ? c.none : s >= 80 ? c.good : s >= 60 ? c.mid : c.poor;

export const formatDuration = (s: number | null | undefined) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
};
