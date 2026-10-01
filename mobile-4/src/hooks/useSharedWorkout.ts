/**
 * One shared workout session, as the server sees it. The screen renders `phase`; nothing here
 * decides on its own that the partner joined, got ready or did a rep — those only arrive from
 * the backend (socket or poll). Your own rep count is yours (you tap it) and is reported up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorKind, featureUnavailable } from '@/api/campus';
import type { SharedWorkoutSession, WorkoutParticipant } from '@/api/campus/types';
import { clockOffset, sharedWorkoutApi, subscribeSession } from '@/api/sharedWorkout';

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'lost';

export type SharedPhase =
  | 'loading'
  | 'unavailable'
  | 'not_found'
  | 'error'
  | 'waiting' // host: invite sent, nobody joined yet
  | 'lobby' // both here; ready up
  | 'countdown'
  | 'active'
  | 'complete'
  | 'partner_left_before_start'
  | 'partner_left_during'
  | 'you_left'
  | 'expired'
  | 'already_completed';

const LOST_AFTER_MS = 15_000;

export function derivePhase(s: SharedWorkoutSession | null, meId: string | null, serverNow: number, finishedLocally: boolean, loadError: unknown): SharedPhase {
  if (!s) {
    if (!loadError) return 'loading';
    if (featureUnavailable(loadError)) return 'unavailable';
    return errorKind(loadError) === 'not_found' ? 'not_found' : 'error';
  }
  const mine = s.host.user.user_id === meId ? s.host : s.partner?.user.user_id === meId ? s.partner : null;
  if (s.status === 'expired') return 'expired';
  if (s.status === 'cancelled') {
    const iLeft = (s.end_reason === 'host_left' && mine?.role === 'host') || (s.end_reason === 'partner_left' && mine?.role === 'partner');
    if (iLeft) return 'you_left';
    return s.starts_at && Date.parse(s.starts_at) <= serverNow ? 'partner_left_during' : 'partner_left_before_start';
  }
  if (s.status === 'completed') return finishedLocally || mine?.finished_at ? 'complete' : 'already_completed';
  if (mine?.finished_at || finishedLocally) return 'complete';
  if (s.status === 'waiting_for_partner') return 'waiting';
  if (s.status === 'lobby') return 'lobby';
  if (s.starts_at && Date.parse(s.starts_at) > serverNow) return 'countdown';
  if (s.status === 'countdown' || s.status === 'active') return 'active';
  return 'lobby';
}

export function useSharedWorkout(sessionId: string, meId: string | null, initial?: SharedWorkoutSession | null) {
  const [session, setSession] = useState<SharedWorkoutSession | null>(initial ?? null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [conn, setConn] = useState<Connection>('connecting');
  const [offset, setOffset] = useState(initial ? clockOffset(initial) : 0);
  const [now, setNow] = useState(() => Date.now());
  const failingSince = useRef<number | null>(null);

  const accept = useCallback((s: SharedWorkoutSession) => {
    setSession(s);
    setOffset(clockOffset(s));
    failingSince.current = null;
    setConn('live');
  }, []);

  const load = useCallback(async () => {
    try {
      accept(await sharedWorkoutApi.get(sessionId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
    }
  }, [accept, sessionId]);

  useEffect(() => {
    if (initial) return;
    let off = false;
    sharedWorkoutApi.get(sessionId).then(
      (x) => !off && accept(x),
      (e) => !off && setLoadError(e),
    );
    return () => {
      off = true;
    };
  }, [initial, sessionId, accept]);

  // Live updates from the server only.
  useEffect(() => {
    if (!session) return;
    return subscribeSession(
      sessionId,
      (u) => {
        if (u.kind === 'session') accept(u.session);
        else
          setSession((s) => {
            if (!s) return s;
            const patch = (p: WorkoutParticipant | null) => (p && p.user.user_id === u.userId ? { ...p, reps: Math.max(p.reps, u.reps) } : p);
            return { ...s, host: patch(s.host)!, partner: patch(s.partner) };
          });
      },
      () => {
        failingSince.current ??= Date.now();
        setConn(Date.now() - failingSince.current > LOST_AFTER_MS ? 'lost' : 'reconnecting');
      },
    );
    // Re-subscribe only when the session appears, not on every update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, !!session, accept]);

  // A 250 ms clock for the countdown (server-aligned via `offset`).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Throttled rep reports: the latest count at most every 500 ms.
  const pending = useRef<number | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportReps = useCallback(
    (reps: number) => {
      pending.current = reps;
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(async () => {
        flushTimer.current = null;
        const r = pending.current;
        pending.current = null;
        if (r == null) return;
        try {
          await sharedWorkoutApi.reportReps(sessionId, r);
          failingSince.current = null;
          setConn('live');
        } catch {
          failingSince.current ??= Date.now();
          setConn(Date.now() - failingSince.current > LOST_AFTER_MS ? 'lost' : 'reconnecting');
          pending.current ??= r; // retry with the next report
        }
      }, 500);
    },
    [sessionId],
  );
  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  const act = useCallback(async (fn: () => Promise<SharedWorkoutSession>) => {
    const s = await fn();
    accept(s);
    return s;
  }, [accept]);

  const serverNow = now + offset;
  const me = session ? (session.host.user.user_id === meId ? session.host : session.partner?.user.user_id === meId ? session.partner : null) : null;
  const partner = session && me ? (me.role === 'host' ? session.partner : session.host) : null;

  return {
    session,
    loadError,
    reload: load,
    conn,
    serverNow,
    me,
    partner,
    secondsToStart: session?.starts_at ? Math.max(0, Math.ceil((Date.parse(session.starts_at) - serverNow) / 1000)) : null,
    setReady: (ready: boolean) => act(() => sharedWorkoutApi.setReady(sessionId, ready)),
    reportReps,
    complete: (reps: number) => act(() => sharedWorkoutApi.complete(sessionId, reps)),
    leave: () => act(() => sharedWorkoutApi.leave(sessionId)),
  };
}
