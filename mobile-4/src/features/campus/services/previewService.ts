/**
 * PREVIEW SEASON — the campus map without a backend.
 *
 * A seeded, deterministic starting picture on the real IISER Kolkata zones (so screenshots and
 * tests are stable), then a gentle simulation: squirrels drop into zones, battles swing, rivals
 * reinforce. Every move goes through logic/rules.ts, the same rules a backend would enforce.
 * The UI labels all of it PREVIEW SEASON; activity is per crew with anonymous ids — no people,
 * no positions. Replace with httpCampusMapService (services/index.ts) when a backend exists.
 */
import { rng } from '../../world/logic/geometry.ts';
import { CAMPUS_CREWS } from '../data/crews.ts';
import type { CampusGeography } from '../data/geography.ts';
import { applyAction, CHALLENGE_MS, HOLD_MS, reachOf, RuleError } from '../logic/rules.ts';
import type { Activity, Challenge, Player, Territory, Zone, ZoneGeometry, ZoneType } from '../types.ts';
import type { CampusMapService, LiveEvent } from './types.ts';

export const PREVIEW_PLAYER: Player = { userId: 'you', crewId: 'night-owls', xp: 1240 };

const XP: Record<ZoneType, number> = { library: 420, research: 380, academic: 360, dining: 320, hostel: 300, activity: 300, admin: 300, gate: 280, sports: 260, water: 240, ground: 220, community: 200 };
const BUSY: Partial<Record<ZoneType, number>> = { dining: 0.85, hostel: 0.7, library: 0.75, academic: 0.65, sports: 0.55, activity: 0.5, research: 0.45 };

/** Who holds what when the season opens: [owner, strength] (null = neutral). */
const OPENING: Record<string, [string | null, number]> = {
  'icv-hall': ['night-owls', 72],
  mess: ['night-owls', 58],
  lhc: ['night-owls', 81],
  library: ['ember-pack', 64],
  admin: ['ember-pack', 77],
  'material-science': ['ember-pack', 52],
  auditorium: ['ember-pack', 66],
  lake: ['tidewater', 70],
  'ajc-bose': ['tidewater', 88],
  'north-pond': ['tidewater', 45],
  'polymer-research': ['tidewater', 60],
  nivedita: ['violet-hour', 74],
  'cricket-ground': ['violet-hour', 63],
  'football-ground': ['violet-hour', 55],
  'west-ponds': ['violet-hour', 41],
};
/** Battles already running: zone → [attacker, progress]. */
const BATTLES: Record<string, [string, number]> = {
  library: ['night-owls', 38],
  mess: ['ember-pack', 27],
  'football-ground': ['tidewater', 61],
};

export type PreviewState = { zones: Zone[]; territories: Territory[]; activity: Activity[]; player: Player };

export function previewSeason(geo: CampusGeography, now: number): PreviewState {
  const r = rng('iiser-kolkata-season-1');
  const created = now - 21 * 24 * 3600_000;
  const zones: Zone[] = [];
  const territories: Territory[] = [];
  for (const g of geo.zones) {
    const [owner, strength] = g.protected ? [null, 0] : OPENING[g.id] ?? [null, 0];
    const busy = g.protected ? 0.05 : Math.min(1, (BUSY[g.type] ?? 0.3) * (0.75 + r() * 0.5));
    const capturedAt = owner ? now - Math.round((2 + r() * 70) * 3600_000) : null;
    const battle = BATTLES[g.id];
    const challenge: Challenge | null = battle && owner ? { id: `c-${g.id}`, zoneId: g.id, attackerCrewId: battle[0], defenderCrewId: owner, progress: battle[1], startedAt: now - 25 * 60_000, endsAt: now - 25 * 60_000 + CHALLENGE_MS } : null;
    zones.push(zoneOf(g, {
      ownerCrewId: owner,
      defenseStrength: strength,
      activityLevel: +busy.toFixed(2),
      activeUsers: g.protected ? 0 : Math.round(busy * (g.type === 'dining' ? 26 : 16) * (0.6 + r() * 0.6)),
      status: g.protected ? 'locked' : challenge ? 'contested' : owner ? 'owned' : 'neutral',
      lastCapturedAt: capturedAt,
      challenge,
      createdAt: created,
      updatedAt: now,
    }));
    if (owner && capturedAt) territories.push({ id: `t-${g.id}`, zoneId: g.id, crewId: owner, strength, capturedAt, expiresAt: capturedAt + HOLD_MS });
  }
  const activity: Activity[] = [];
  let n = 0;
  for (const z of zones) {
    if (!z.ownerCrewId) continue;
    const crew = CAMPUS_CREWS.find((c) => c.id === z.ownerCrewId)!;
    activity.push({ id: `a${n++}`, zoneId: z.id, userId: anon(crew.short, r), xp: z.xpValue, timestamp: z.lastCapturedAt!, kind: 'capture', crewId: crew.id });
    for (let i = 0; i < 2; i++) activity.push({ id: `a${n++}`, zoneId: z.id, userId: anon(crew.short, r), xp: 30, timestamp: now - Math.round((5 + r() * 90) * 60_000), kind: 'defend', crewId: crew.id });
    if (z.challenge) activity.push({ id: `a${n++}`, zoneId: z.id, userId: anon(CAMPUS_CREWS.find((c) => c.id === z.challenge!.attackerCrewId)!.short, r), xp: 40, timestamp: now - Math.round((1 + r() * 12) * 60_000), kind: 'attack', crewId: z.challenge.attackerCrewId });
  }
  activity.sort((a, b) => b.timestamp - a.timestamp);
  return { zones, territories, activity, player: { ...PREVIEW_PLAYER } };
}

const anon = (short: string, r: () => number) => `${short.toLowerCase()}-${String(Math.floor(r() * 90) + 10)}`;

function zoneOf(g: ZoneGeometry, s: Omit<Zone, 'id' | 'name' | 'geometry' | 'center' | 'type' | 'xpValue'>): Zone {
  return { id: g.id, name: g.name, geometry: g, center: g.center, type: g.type, xpValue: g.protected ? 0 : XP[g.type], ...s };
}

/**
 * One tick of campus life. Returns the events it caused (and mutates `st`). Your own crew's zones
 * are never taken by the simulation — it raises the pressure and leaves the defending to you.
 */
export function simulate(st: PreviewState, r: () => number, now: number, myCrew: string | null): LiveEvent[] {
  const ev: LiveEvent[] = [];
  const put = (z: Zone, a?: Omit<Activity, 'id'>) => {
    const i = st.zones.findIndex((x) => x.id === z.id);
    st.zones[i] = { ...z, updatedAt: now };
    ev.push({ type: 'zone', zone: st.zones[i] });
    if (a) {
      const act = { ...a, id: `a${now}-${Math.floor(r() * 1e6)}` };
      st.activity.unshift(act);
      st.activity.length = Math.min(st.activity.length, 300);
      ev.push({ type: 'activity', activity: act });
    }
  };
  const short = (id: string) => CAMPUS_CREWS.find((c) => c.id === id)?.short ?? 'SQ';
  const playable = st.zones.filter((z) => z.status !== 'locked');
  const roll = r();
  if (roll < 0.5) {
    // Squirrels drop in (or head off).
    const z = pick(playable.filter((x) => x.activityLevel > 0.2), r) ?? pick(playable, r)!;
    const d = r() < 0.65 ? 1 + Math.floor(r() * 3) : -1 - Math.floor(r() * 2);
    const users = Math.max(0, Math.min(40, z.activeUsers + d));
    const crew = z.ownerCrewId ?? pick(CAMPUS_CREWS, r)!.id;
    put({ ...z, activeUsers: users, activityLevel: +Math.min(1, Math.max(0.05, users / 22)).toFixed(2) }, d > 0 ? { zoneId: z.id, userId: anon(short(crew), r), xp: 10 + Math.floor(r() * 20), timestamp: now, kind: 'visit', crewId: crew } : undefined);
  } else if (roll < 0.8) {
    // A battle swings.
    const z = pick(playable.filter((x) => x.challenge), r);
    if (z?.challenge) {
      const push = r() < 0.6;
      const mineDefending = z.ownerCrewId === myCrew;
      const mineAttacking = z.challenge.attackerCrewId === myCrew;
      if (mineAttacking && push) return ev; // your attack only moves when you move
      let progress = z.challenge.progress + (push ? 4 + Math.floor(r() * 8) : -(3 + Math.floor(r() * 7)));
      if (mineDefending) progress = Math.min(progress, 92);
      const by = push ? z.challenge.attackerCrewId : (z.ownerCrewId as string);
      const a = { zoneId: z.id, userId: anon(short(by), r), xp: push ? 40 : 30, timestamp: now, kind: (push ? 'attack' : 'defend') as Activity['kind'], crewId: by };
      if (progress >= 100) {
        put({ ...z, ownerCrewId: by, status: 'owned', defenseStrength: 40, challenge: null, lastCapturedAt: now }, { ...a, kind: 'capture', xp: z.xpValue });
        replaceTerritory(st, z.id, by, now);
      } else if (progress <= 0) put({ ...z, status: 'owned', challenge: null, defenseStrength: Math.min(100, z.defenseStrength + 10) }, a);
      else put({ ...z, challenge: { ...z.challenge, progress } }, a);
    }
  } else if (roll < 0.92) {
    // Rivals reinforce one of theirs.
    const z = pick(playable.filter((x) => x.ownerCrewId && x.ownerCrewId !== myCrew && x.defenseStrength < 95), r);
    if (z) put({ ...z, defenseStrength: Math.min(100, z.defenseStrength + 6) }, { zoneId: z.id, userId: anon(short(z.ownerCrewId!), r), xp: 30, timestamp: now, kind: 'defend', crewId: z.ownerCrewId });
  } else {
    // A new rival battle, if the campus is quiet.
    const battles = playable.filter((x) => x.challenge).length;
    const z = pick(playable.filter((x) => x.status === 'owned' && x.ownerCrewId !== myCrew), r);
    if (z && battles < 4) {
      const attacker = pick(CAMPUS_CREWS.filter((c) => c.id !== z.ownerCrewId && c.id !== myCrew), r)!.id;
      put({ ...z, status: 'contested', challenge: { id: `c-${z.id}-${now}`, zoneId: z.id, attackerCrewId: attacker, defenderCrewId: z.ownerCrewId!, progress: 5, startedAt: now, endsAt: now + CHALLENGE_MS } }, { zoneId: z.id, userId: anon(short(attacker), r), xp: 20, timestamp: now, kind: 'challenge', crewId: attacker });
    }
  }
  return ev;
}

function replaceTerritory(st: PreviewState, zoneId: string, crewId: string, now: number) {
  st.territories = st.territories.filter((t) => t.zoneId !== zoneId);
  st.territories.push({ id: `t-${zoneId}-${now}`, zoneId, crewId, strength: 40, capturedAt: now, expiresAt: now + HOLD_MS });
}

const pick = <T,>(a: T[], r: () => number): T | undefined => (a.length ? a[Math.floor(r() * a.length)] : undefined);

type Options = { now?: () => number; latencyMs?: number; tickMs?: [number, number] };

export function previewCampusMapService(geo: CampusGeography, opts: Options = {}): CampusMapService {
  const now = opts.now ?? Date.now;
  const latency = opts.latencyMs ?? 260;
  const st = previewSeason(geo, now());
  const r = rng(`iiser-live-${Math.floor(now() / 60_000)}`);
  const listeners = new Set<(e: LiveEvent) => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const [lo, hi] = opts.tickMs ?? [3500, 7000];
  const schedule = () => {
    timer = setTimeout(() => {
      for (const e of simulate(st, r, now(), st.player.crewId)) listeners.forEach((l) => l(e));
      if (listeners.size) schedule();
      else timer = null;
    }, lo + r() * (hi - lo));
  };
  const later = <T,>(v: () => T) => new Promise<T>((res, rej) => setTimeout(() => {
    try {
      res(v());
    } catch (e) {
      rej(e);
    }
  }, latency * (0.7 + Math.random() * 0.6)));
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    mode: 'preview',
    getZones: () => later(() => st.zones.map((z) => ({ ...z }))),
    getTerritories: () => later(() => copy(st.territories)),
    getTerritory: (id) => later(() => st.territories.find((t) => t.id === id) ?? null),
    getCrews: () => later(() => copy(CAMPUS_CREWS)),
    getZoneActivity: (id) => later(() => st.activity.filter((a) => a.zoneId === id).slice(0, 20)),
    getPlayer: () => later(() => ({ ...st.player })),
    act: (zoneId, action, position) =>
      later(() => {
        const z = st.zones.find((x) => x.id === zoneId);
        if (!z) throw new RuleError('not_allowed', 'Unknown zone.');
        const t = st.territories.find((x) => x.zoneId === zoneId) ?? null;
        const ts = now();
        const res = applyAction(z, t, action, st.player, reachOf(z, position), ts, `a${ts}`);
        st.zones = st.zones.map((x) => (x.id === zoneId ? res.zone : x));
        st.territories = st.territories.filter((x) => x.zoneId !== zoneId).concat(res.territory && res.zone.ownerCrewId ? [res.territory] : []);
        st.activity.unshift(res.activity);
        st.player = res.player;
        return { zone: res.zone, territory: res.territory, outcome: res.outcome, xpGained: res.xpGained, player: res.player };
      }),
    subscribe: (l) => {
      listeners.add(l);
      if (!timer) schedule();
      return () => listeners.delete(l);
    },
  };
}
