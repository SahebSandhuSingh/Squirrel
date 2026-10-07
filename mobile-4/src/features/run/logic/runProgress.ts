/**
 * What a run means on the Territory Network, fed one GPS point at a time: which territory you're
 * in, the order you crossed them, how much ground you covered in each (your "influence"), km
 * splits, a crossing streak, and your rolling pace. Pure and incremental — each new fix costs one
 * point-in-polygon pass over ~100 territories (bbox-filtered), so it's cheap at 1 Hz.
 *
 * Influence is a Preview Season mechanic shown during the run. It never claims anything: claims,
 * steals and defences still happen on the Territory map (and, live, on the backend).
 */
import type { Fix } from '../../../logic/track.ts';
import { haversine, MAX_SPEED_MS } from '../../../logic/track.ts';
import type { LngLat, Territory } from '../../world/types.ts';
import { territoryAt } from '../../world/logic/camera.ts';

/** Ground to cover inside a territory to "power" it: a micro territory, or a whole zone. */
export const INFLUENCE_M = { micro: 200, zone: 500 } as const;
/** Crossings closer together than this keep the streak alive. */
export const STREAK_WINDOW_MS = 3 * 60_000;

export type TerritoryRun = { meters: number; enteredAt: number; powered: boolean };

export type RunProgress = {
  processed: number;
  meters: number;
  byTerritory: Record<string, TerritoryRun>;
  /** Territory ids in the order you first entered them. */
  order: string[];
  current: string | null;
  streak: number;
  bestStreak: number;
  lastEntryAt: number;
  /** Seconds each completed km took. */
  splits: number[];
  splitStartT: number | null;
  startT: number | null;
};

export type RunEvent =
  | { kind: 'enter'; id: string; first: boolean; streak: number; t: number }
  | { kind: 'powered'; id: string; t: number }
  | { kind: 'split'; km: number; sec: number; t: number };

export const emptyProgress = (): RunProgress => ({ processed: 0, meters: 0, byTerritory: {}, order: [], current: null, streak: 0, bestStreak: 0, lastEntryAt: 0, splits: [], splitStartT: null, startT: null });

export const influenceOf = (t: Pick<Territory, 'tier'>, meters: number) => Math.min(1, meters / (t.tier === 5 ? INFLUENCE_M.micro : INFLUENCE_M.zone));

/** Consume every point after `p.processed`. Returns the next state and what just happened. */
export function advance(p: RunProgress, points: readonly Fix[], world: Territory[]): { progress: RunProgress; events: RunEvent[] } {
  if (points.length <= p.processed) return { progress: p, events: [] };
  const events: RunEvent[] = [];
  const s: RunProgress = { ...p, byTerritory: { ...p.byTerritory }, order: [...p.order], splits: [...p.splits] };
  const byId = new Map(world.map((t) => [t.id, t]));

  for (let i = p.processed; i < points.length; i++) {
    const f = points[i];
    if (s.startT == null) {
      s.startT = f.t;
      s.splitStartT = f.t;
    }
    const at: LngLat = [f.lon, f.lat];
    const here = territoryAt(world, at, 20).territory;
    const prev = i > 0 ? points[i - 1] : null;

    // Distance from the previous point, unless it's a GPS jump.
    let d = 0;
    if (prev && f.t > prev.t) {
      const dd = haversine(prev, f);
      if (dd / ((f.t - prev.t) / 1000) <= MAX_SPEED_MS) d = dd;
    }

    if (here && here.id !== s.current) {
      const first = !s.byTerritory[here.id];
      if (first) {
        s.byTerritory[here.id] = { meters: 0, enteredAt: f.t, powered: false };
        s.order.push(here.id);
        s.streak = s.lastEntryAt && f.t - s.lastEntryAt <= STREAK_WINDOW_MS ? s.streak + 1 : 1;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        s.lastEntryAt = f.t;
      }
      s.current = here.id;
      events.push({ kind: 'enter', id: here.id, first, streak: s.streak, t: f.t });
    } else if (!here) s.current = null;

    if (d > 0) {
      s.meters += d;
      if (s.current) {
        const tr = { ...s.byTerritory[s.current] };
        tr.meters += d;
        const terr = byId.get(s.current);
        if (terr && !tr.powered && influenceOf(terr, tr.meters) >= 1) {
          tr.powered = true;
          events.push({ kind: 'powered', id: s.current, t: f.t });
        }
        s.byTerritory[s.current] = tr;
      }
      const km = Math.floor(s.meters / 1000);
      if (km > s.splits.length && s.splitStartT != null) {
        const sec = Math.round((f.t - s.splitStartT) / 1000);
        s.splits.push(sec);
        s.splitStartT = f.t;
        events.push({ kind: 'split', km, sec, t: f.t });
      }
    }
  }
  s.processed = points.length;
  return { progress: s, events };
}

/** Pace over the last `windowSec` of the route (sec per km), or NaN when too little to tell. */
export function rollingPace(points: readonly Fix[], windowSec = 30): number {
  if (points.length < 2) return NaN;
  const end = points[points.length - 1];
  let m = 0;
  let i = points.length - 1;
  for (; i > 0 && (end.t - points[i - 1].t) / 1000 <= windowSec; i--) {
    const a = points[i - 1];
    const b = points[i];
    const d = haversine(a, b);
    if (b.t > a.t && d / ((b.t - a.t) / 1000) <= MAX_SPEED_MS) m += d;
  }
  const sec = (end.t - points[i].t) / 1000;
  return m >= 15 && sec >= 5 ? (sec / m) * 1000 : NaN;
}

export type PaceZone = { index: 0 | 1 | 2 | 3; label: 'Easy' | 'Steady' | 'Tempo' | 'Fast' };
const ZONES: PaceZone['label'][] = ['Easy', 'Steady', 'Tempo', 'Fast'];
/** Upper bounds (sec/km) for Fast, Tempo, Steady; anything slower is Easy. Walks get gentler bands. */
const BANDS = { run: [270, 330, 420], walk: [540, 660, 780] } as const;

export function paceZone(secPerKm: number, kind: 'run' | 'walk'): PaceZone | null {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  const [fast, tempo, steady] = BANDS[kind];
  const index = (secPerKm <= fast ? 3 : secPerKm <= tempo ? 2 : secPerKm <= steady ? 1 : 0) as PaceZone['index'];
  return { index, label: ZONES[index] };
}
