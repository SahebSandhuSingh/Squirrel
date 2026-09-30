/**
 * Shared workout sessions ("Workout with partner") — the frontend service. Everything that
 * makes two phones agree (who's in, who's ready, when to start, each other's reps) is the
 * backend's job; this module only calls it and listens for its updates.
 *
 * Expected routes (not built yet — see README):
 *   POST /v1/workout-sessions                       { exercise_key, target, sets }
 *   GET  /v1/workout-sessions/{id}
 *   GET  /v1/workout-sessions/invites/{code}        (preview before joining)
 *   POST /v1/workout-sessions/invites/{code}/join
 *   PUT  /v1/workout-sessions/{id}/ready            { ready }
 *   POST /v1/workout-sessions/{id}/reps             { reps, client_time }
 *   POST /v1/workout-sessions/{id}/complete         { reps }
 *   POST /v1/workout-sessions/{id}/leave
 *   WS   workout.session.updated · workout.reps.updated (the campus realtime channel)
 *
 * There is NO local stand-in: until the backend ships (api/availability.ts, capability
 * 'sharedWorkout') every call rejects with EndpointUnavailableError — dev mock included — so the
 * UI shows "not live yet" instead of pretending two people are connected.
 */
import { EndpointUnavailableError, isEndpointAvailable } from '@/api/availability';
import { api } from '@/api/client';
import { CAMPUS_API_URL } from '@/api/config';
import { CAMPUS_SOURCE, realtimeMode, subscribeRealtime } from '@/api/campus';
import type { SharedWorkoutSession } from '@/api/campus/types';

const base = CAMPUS_API_URL;
/** Needs a real backend: the capability opted in AND a live campus API. Never the dev mock. */
const call = <R,>(path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<R> =>
  isEndpointAvailable('sharedWorkout') && CAMPUS_SOURCE === 'live'
    ? api<R>(path, { base, method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), body: init.body })
    : Promise.reject(new EndpointUnavailableError('sharedWorkout'));
const id = encodeURIComponent;

export const sharedWorkoutApi = {
  create: (exercise: { key: string; target: number | null; sets: number | null }) => call<SharedWorkoutSession>('/v1/workout-sessions', { body: { exercise_key: exercise.key, target: exercise.target, sets: exercise.sets } }),
  get: (sessionId: string) => call<SharedWorkoutSession>(`/v1/workout-sessions/${id(sessionId)}`),
  previewInvite: (code: string) => call<SharedWorkoutSession>(`/v1/workout-sessions/invites/${id(code)}`),
  join: (code: string) => call<SharedWorkoutSession>(`/v1/workout-sessions/invites/${id(code)}/join`, { method: 'POST', body: {} }),
  setReady: (sessionId: string, ready: boolean) => call<SharedWorkoutSession>(`/v1/workout-sessions/${id(sessionId)}/ready`, { method: 'PUT', body: { ready } }),
  reportReps: (sessionId: string, reps: number) => call<{ accepted: boolean }>(`/v1/workout-sessions/${id(sessionId)}/reps`, { body: { reps, client_time: new Date().toISOString() } }),
  complete: (sessionId: string, reps: number) => call<SharedWorkoutSession>(`/v1/workout-sessions/${id(sessionId)}/complete`, { body: { reps } }),
  leave: (sessionId: string) => call<SharedWorkoutSession>(`/v1/workout-sessions/${id(sessionId)}/leave`, { method: 'POST', body: {} }),
};

export type SessionUpdate = { kind: 'session'; session: SharedWorkoutSession } | { kind: 'reps'; userId: string; reps: number; at: string };

/**
 * Live updates for one session: the realtime socket when the backend announces one; otherwise a
 * short poll while the screen is open (2 s — enough for a lobby and a rep race, never a tight loop).
 */
export function subscribeSession(sessionId: string, onUpdate: (u: SessionUpdate) => void, onPollError: (e: unknown) => void): () => void {
  if (realtimeMode() === 'socket') {
    return subscribeRealtime((m) => {
      if (m.type === 'workout.session.updated' && m.data.session_id === sessionId) onUpdate({ kind: 'session', session: m.data });
      else if (m.type === 'workout.reps.updated' && m.data.session_id === sessionId) onUpdate({ kind: 'reps', userId: m.data.user_id, reps: m.data.reps, at: m.data.at });
    });
  }
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      onUpdate({ kind: 'session', session: await sharedWorkoutApi.get(sessionId) });
    } catch (e) {
      onPollError(e);
    }
    if (!stopped) timer = setTimeout(tick, 2000);
  };
  let timer = setTimeout(tick, 2000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Milliseconds to add to Date.now() to read the server's clock (from `server_time`). */
export const clockOffset = (s: SharedWorkoutSession) => Date.parse(s.server_time) - Date.now();
