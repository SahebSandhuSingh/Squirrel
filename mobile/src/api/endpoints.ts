/**
 * Run Module endpoints used by the app, per the compatibility assessment §3.
 *
 * ⚠️ CONFIRM AGAINST THE BACKEND: the assessment names these routes but not their
 * request/response fields. The shapes below are the app's expectation, kept in this one
 * file so they can be corrected in one place once the backend's schema is available.
 */
import { api } from '@/api/client';
import type { Fix, Verdict } from '@/logic/track';

export type RunCreated = { id: string };

export type RunResult = {
  id: string;
  /** Server-recomputed; client values are never trusted. */
  distance_m: number;
  moving_time_s: number;
  status: Verdict;
  status_reason?: string;
  xp_awarded: number;
  xp_lines?: { label: string; xp: number }[];
  territory?: { captured: boolean; district_name?: string; area_m2?: number };
};

export type XpSummary = { total: number; lines?: { label: string; xp: number; at?: string }[] };

export type LeaderboardPeriod = 'daily' | 'weekly' | 'all_time';
export type LeaderboardEntry = { rank: number; user_id: string; display_name: string; area_m2: number; is_me?: boolean };

export const runsApi = {
  create: (startedAt: string) => api<RunCreated>('/v1/runs', { body: { started_at: startedAt, source: 'squirrel-mobile' } }),
  uploadPoints: (runId: string, points: Fix[]) =>
    api<void>(`/v1/runs/${runId}/points`, { body: { points: points.map((p) => ({ lat: p.lat, lon: p.lon, t: new Date(p.t).toISOString(), accuracy_m: p.accuracy ?? null })) } }),
  finish: (runId: string) => api<RunResult>(`/v1/runs/${runId}/finish`, { method: 'POST' }),
  get: (runId: string) => api<RunResult>(`/v1/runs/${runId}`),
};

export const xpApi = {
  me: () => api<XpSummary>('/v1/users/me/xp'),
};

export const leaderboardApi = {
  get: (period: LeaderboardPeriod) => api<{ entries: LeaderboardEntry[] }>(`/v1/leaderboard?period=${period}`),
};

/** Upload a finished run: create → points (chunked) → finish → result. */
export async function submitRun(startedAt: number, points: Fix[]): Promise<RunResult> {
  const { id } = await runsApi.create(new Date(startedAt).toISOString());
  for (let i = 0; i < points.length; i += 500) await runsApi.uploadPoints(id, points.slice(i, i + 500));
  await runsApi.finish(id);
  return runsApi.get(id);
}
