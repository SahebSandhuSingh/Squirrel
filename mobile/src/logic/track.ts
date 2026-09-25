/**
 * Lightweight GPS track processing for the run screen: rejects inaccurate fixes and
 * teleports, accumulates distance and moving time. The Run Module's Android client does
 * this more thoroughly (Kalman smoothing, offline persistence); the server recomputes
 * distance from the uploaded points either way, so client values are only a live estimate.
 */
export type Fix = { lat: number; lon: number; t: number; accuracy?: number | null };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Fix, b: Fix) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const MAX_ACCURACY_M = 30; // ignore fixes worse than this
export const MAX_SPEED_MS = 12; // ~2'20"/km — faster than any runner; treat as a GPS jump
export const MOVING_SPEED_MS = 0.6; // below this we count the time as paused

export type TrackState = {
  points: Fix[];
  meters: number;
  movingSec: number;
  rejected: number;
  /** Set on resume after a pause: the next fix starts a new segment and adds no distance. */
  gap?: boolean;
};

export const emptyTrack = (): TrackState => ({ points: [], meters: 0, movingSec: 0, rejected: 0 });

export function addFix(s: TrackState, f: Fix): TrackState {
  if (f.accuracy == null || f.accuracy > MAX_ACCURACY_M) return { ...s, rejected: s.rejected + 1 };
  const last = s.points[s.points.length - 1];
  if (!last || s.gap) return { ...s, points: [...s.points, f], gap: false };
  const dt = (f.t - last.t) / 1000;
  if (dt <= 0) return s;
  const d = haversine(last, f);
  const v = d / dt;
  if (v > MAX_SPEED_MS) return { ...s, rejected: s.rejected + 1 };
  const moving = v >= MOVING_SPEED_MS;
  return { points: [...s.points, f], meters: s.meters + (moving ? d : 0), movingSec: s.movingSec + (moving ? dt : 0), rejected: s.rejected };
}

/** Client-side plausibility check shown before the server's verdict arrives. */
export type Verdict = 'accepted' | 'flagged' | 'rejected';

export function localVerdict(km: number, movingSec: number, rejectedRatio: number): { verdict: Verdict; reason: string } {
  if (km < 0.2) return { verdict: 'rejected', reason: 'Too short to count — runs need at least 200 m.' };
  const paceSecPerKm = movingSec / Math.max(km, 0.001);
  if (paceSecPerKm < 150) return { verdict: 'rejected', reason: 'Faster than 2\'30"/km — looks like a vehicle.' };
  if (rejectedRatio > 0.3 || paceSecPerKm < 180) return { verdict: 'flagged', reason: 'Unusual GPS or pace — sent for review.' };
  return { verdict: 'accepted', reason: 'Looks good. Every metre counted.' };
}
