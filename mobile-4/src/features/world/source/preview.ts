/**
 * PREVIEW SEASON — the territory network's game state before the territory backend exists.
 *
 * Squirrel Social's rule is that no build passes invented data off as real, so everything this
 * file produces is labelled "Preview Season" in the UI. It is deterministic (seeded from territory
 * ids), so the city looks the same on every launch, and it's the only place that invents state:
 * a live source implements the same `WorldSource` contract (source/types.ts) and replaces it.
 *
 * Privacy: activity is aggregated per territory ("12 squirrels ran through…"). Nothing here,
 * or in the live contract, carries a person's position.
 */
import type { ActivityItem, ActivityKind, Territory, TerritoryState } from '../types.ts';
import { CREWS, MY_CREW_ID, crewOf } from '../data/crews.ts';
import { levelFromXp, withState, type TerritoryShape } from '../logic/buildWorld.ts';
import { rng } from '../logic/geometry.ts';

// ---------------------------------------------------------------------------
// Who holds what (home turf per crew)
// ---------------------------------------------------------------------------

const HOME: Record<string, string[]> = {
  'north-kings': ['dakshineswar', 'baranagar', 'cossipore', 'shyambazar', 'sovabazar', 'ultadanga', 'maniktala', 'dum-dum', 'lake-town', 'airport-gate', 'baguiati'],
  'night-owls': ['college-street', 'rajabazar', 'sealdah', 'bbd-bag', 'burrabazar', 'esplanade', 'park-street', 'entally', 'park-circus'],
  'south-side': ['dhakuria', 'jadavpur', 'gariahat', 'ballygunge', 'kasba', 'tollygunge', 'regent-park', 'santoshpur', 'garia', 'new-alipore', 'kalighat', 'bhowanipore', 'behala', 'thakurpukur', 'joka', 'mukundapur', 'ruby'],
  'sector-five': ['beleghata', 'phoolbagan', 'science-city', 'tangra', 'sl-'],
  nomads: ['nt-'],
  hawks: ['hw-', 'kidderpore', 'garden-reach', 'alipore'],
  mavericks: ['kl-'],
};

function homeCrew(t: TerritoryShape): string | null {
  const key = t.parentId ?? t.id;
  for (const [crew, ids] of Object.entries(HOME)) if (ids.some((id) => (id.endsWith('-') ? key.startsWith(id) : key === id))) return crew;
  return null;
}

/** Hand-placed moments that make the opening view tell a story. */
const AUTHORED: Record<string, Partial<TerritoryState>> = {
  'college-street': { ownerCrewId: 'night-owls', challengerCrewId: 'south-side', status: 'contested', xp: 8420, control: 74, defence: 78, activity: 0.95, activeUsers: 32 },
  'cs-coffee-house': { ownerCrewId: 'night-owls', status: 'owned', xp: 5240, control: 88, defence: 82, activity: 0.9 },
  'cs-presidency': { ownerCrewId: 'night-owls', status: 'owned', xp: 6110, control: 81, defence: 70, activity: 0.8 },
  'cs-calcutta-university': { ownerCrewId: 'night-owls', status: 'owned', xp: 4470, control: 69, defence: 58, activity: 0.7 },
  'cs-boi-para-south': { ownerCrewId: 'night-owls', challengerCrewId: 'south-side', status: 'contested', xp: 2980, control: 59, defence: 44, activity: 0.85 },
  'cs-boi-para-north': { ownerCrewId: 'north-kings', status: 'owned', xp: 2210, control: 66, defence: 49, activity: 0.55 },
  'cs-college-square': { ownerCrewId: null, status: 'unclaimed', xp: 180, control: 0, defence: 0, activity: 0.45 },
  'cs-medical-college': { ownerCrewId: null, status: 'unclaimed', xp: 90, control: 0, defence: 0, activity: 0.3 },
  'cs-hindu-hare': { ownerCrewId: 'night-owls', challengerCrewId: 'north-kings', status: 'under_attack', xp: 1890, control: 52, defence: 38, activity: 0.75 },
  'sl5-college-more': { ownerCrewId: 'sector-five', challengerCrewId: 'nomads', status: 'under_attack', xp: 7150, control: 55, defence: 61, activity: 0.92 },
  'sl2-central-park': { ownerCrewId: 'sector-five', status: 'owned', xp: 9860, control: 91, defence: 88, activity: 0.88 },
  'nt2-eco-park': { ownerCrewId: 'nomads', status: 'owned', xp: 11200, control: 84, defence: 80, activity: 0.86 },
  'jp-jadavpur-university': { ownerCrewId: 'south-side', status: 'owned', xp: 12400, control: 89, defence: 90, activity: 0.94 },
  'dh-rabindra-sarobar': { ownerCrewId: 'south-side', challengerCrewId: 'night-owls', status: 'contested', xp: 9300, control: 63, defence: 66, activity: 0.9 },
  'park-street': { ownerCrewId: 'night-owls', status: 'owned', xp: 6900, control: 77, defence: 64, activity: 0.8 },
  'esplanade': { ownerCrewId: 'night-owls', challengerCrewId: 'north-kings', status: 'contested', xp: 5600, control: 57, defence: 50, activity: 0.78 },
  'park-circus': { ownerCrewId: null, status: 'unclaimed', xp: 240, control: 0, defence: 0, activity: 0.4 },
  'hw-iiest': { ownerCrewId: 'hawks', status: 'owned', xp: 8800, control: 86, defence: 79, activity: 0.8 },
  'maidan': { ownerCrewId: null, status: 'locked', xp: 0, control: 0, defence: 100, activity: 0.5, lockedReason: 'Season finale zone. Opens when Season 1 begins — the crew holding the most of Kolkata gets first strike.' },
  'kl-iiser-kolkata': { ownerCrewId: 'mavericks', status: 'locked', xp: 15400, control: 100, defence: 100, activity: 0.7, lockedReason: 'Founding Ground. Held by IISER Kolkata’s founding squirrels — it can’t be taken.' },
};

/** Territories that start hidden under the fog: the far south-west, Howrah's edges and the outposts. */
export const START_UNDISCOVERED = new Set([
  'dhakuria', 'dh-rabindra-sarobar', 'dh-dhakuria-bridge', 'dh-dakshinapan', 'dh-lake-gardens',
  'behala', 'thakurpukur', 'joka', 'garden-reach', 'garia', 'santoshpur', 'regent-park', 'mukundapur',
  'hw-bally', 'hw-liluah', 'hw-santragachi', 'hw-botanical-garden', 'dakshineswar', 'airport-gate',
  'op-iit-kharagpur', 'op-visva-bharati', 'op-nit-durgapur', 'op-burdwan-university', 'op-north-bengal-university',
  'kl-aiims-kalyani', 'kl-bckv',
]);

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const MIN = 60_000;

export function previewState(shapes: TerritoryShape[], now = Date.now()): Map<string, TerritoryState> {
  const out = new Map<string, TerritoryState>();
  // Children first, so a split zone can take its majority owner from them.
  const ordered = [...shapes].sort((a, b) => b.tier - a.tier);
  for (const t of ordered) out.set(t.id, generate(t, now));
  for (const t of shapes) {
    if (!t.split || AUTHORED[t.id]) continue;
    const kids = shapes.filter((c) => c.parentId === t.id).map((c) => out.get(c.id)!);
    const tally = new Map<string, number>();
    kids.forEach((k) => k.ownerCrewId && tally.set(k.ownerCrewId, (tally.get(k.ownerCrewId) ?? 0) + 1));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const s = out.get(t.id)!;
    if (top) {
      s.ownerCrewId = top[0];
      if (s.status === 'unclaimed') s.status = 'owned';
      s.control = Math.max(s.control, Math.round((top[1] / kids.length) * 100));
    }
  }
  return out;
}

function generate(t: TerritoryShape, now: number): TerritoryState {
  const r = rng(t.id);
  const authored = AUTHORED[t.id];
  const hot = t.tags.includes('hotspot') ? 0.25 : 0;
  const campus = t.tags.includes('campus') ? 0.15 : 0;
  const outpost = t.tags.includes('outpost');

  let owner: string | null = homeCrew(t);
  const roll = r();
  if (outpost || roll < 0.2 || !owner) owner = null;
  else if (r() > 0.82) owner = CREWS[Math.floor(r() * CREWS.length)].id;

  let status: TerritoryState['status'] = owner ? 'owned' : 'unclaimed';
  let challenger: string | null = null;
  const s2 = r();
  if (owner && s2 < 0.1) status = 'contested';
  else if (owner && s2 < 0.16) status = 'under_attack';
  if (status === 'contested' || status === 'under_attack') challenger = rival(owner!, r);

  const base = 600 + Math.pow(r(), 1.6) * 13_000;
  const xp = owner ? Math.round(base * (1 + hot + campus) * (t.tier === 5 ? 0.6 : 1)) : Math.round(r() * 400);
  const control = !owner ? 0 : status === 'contested' ? Math.round(50 + r() * 25) : status === 'under_attack' ? Math.round(40 + r() * 25) : Math.round(55 + r() * 40);
  const level = levelFromXp(xp);
  const defence = owner ? clamp(Math.round(control * 0.6 + level * 8 + r() * 10), 5, 99) : 0;
  let activity = clamp(r() * 0.6 + hot + campus + (status !== 'owned' && owner ? 0.2 : 0), 0.05, 1);
  if (!owner) activity *= 0.5;
  if (outpost) activity = 0.15 + r() * 0.2;

  const state: TerritoryState = {
    ownerCrewId: owner,
    challengerCrewId: challenger,
    xp,
    control,
    defence,
    activity,
    activeUsers: 0,
    lastActivityAt: 0,
    status,
    recent: [],
    ...authored,
  };
  state.activity = round2(state.activity);
  state.activeUsers = authored?.activeUsers ?? Math.round(state.activity * (t.tier === 5 ? 18 : 46)) + (state.activity > 0.2 ? 1 : 0);
  state.lastActivityAt = now - Math.round((1 - state.activity) * r() * 240 + 1) * MIN;
  state.recent = t.id === 'college-street' ? collegeStreetRecent(now) : seedRecent(t, state, r, now);
  return state;
}

const rival = (owner: string, r: () => number) => {
  const others = CREWS.filter((c) => c.id !== owner);
  return others[Math.floor(r() * others.length)].id;
};

function collegeStreetRecent(now: number): ActivityItem[] {
  return [
    { id: 'cs-r1', kind: 'run', territoryId: 'college-street', crewId: 'night-owls', xp: 320, text: '9 Night Owls ran the Boi Para loop', at: now - 4 * MIN },
    { id: 'cs-r2', kind: 'defend', territoryId: 'college-street', crewId: 'night-owls', xp: 180, text: 'Defence held against South Side', at: now - 12 * MIN },
    { id: 'cs-r3', kind: 'meetup', territoryId: 'college-street', crewId: 'night-owls', xp: 95, text: 'Crew meetup at Coffee House', at: now - 27 * MIN },
  ];
}

function seedRecent(t: TerritoryShape, s: TerritoryState, r: () => number, now: number): ActivityItem[] {
  if (!s.ownerCrewId && s.activity < 0.2) return [];
  const n = 1 + Math.floor(r() * 3);
  const items: ActivityItem[] = [];
  let at = s.lastActivityAt;
  for (let i = 0; i < n; i++) {
    const kind: ActivityKind = s.status === 'contested' || s.status === 'under_attack' ? (i === 0 ? 'challenge' : 'defend') : (['run', 'workout', 'defend', 'meetup'] as const)[Math.floor(r() * 4)];
    const crewId = kind === 'challenge' ? s.challengerCrewId : s.ownerCrewId;
    items.push({ id: `${t.id}-seed-${i}`, kind, territoryId: t.id, crewId, xp: xpFor(kind, r), text: describe(kind, t.name, crewId, 2 + Math.floor(r() * 12)), at });
    at -= Math.round(5 + r() * 50) * MIN;
  }
  return items;
}

const XP_RANGE: Record<ActivityKind, [number, number]> = { run: [60, 320], workout: [40, 180], defend: [90, 200], challenge: [50, 120], claim: [250, 250], capture: [300, 300], discover: [100, 100], meetup: [40, 110] };
const xpFor = (k: ActivityKind, r: () => number) => {
  const [lo, hi] = XP_RANGE[k];
  return Math.round((lo + r() * (hi - lo)) / 5) * 5;
};

/** One line, aggregated: counts and crews, never people or positions. */
export function describe(kind: ActivityKind, place: string, crewId: string | null, n: number): string {
  const crew = crewOf(crewId)?.name ?? 'A crew';
  switch (kind) {
    case 'run': return `${n} squirrels ran through ${place}`;
    case 'workout': return `${crew} logged a group workout`;
    case 'defend': return `${crew} reinforced ${place}`;
    case 'challenge': return `${crew} launched a challenge`;
    case 'claim': return `${crew} claimed ${place}`;
    case 'capture': return `${crew} captured ${place}`;
    case 'discover': return `${place} discovered`;
    case 'meetup': return `${n} squirrels met up here`;
  }
}

export function previewWorld(shapes: TerritoryShape[], now = Date.now()): Territory[] {
  const states = previewState(shapes, now);
  return shapes.map((s) => withState(s, states.get(s.id)!));
}

// ---------------------------------------------------------------------------
// Your actions (the rules a live backend would enforce server-side)
// ---------------------------------------------------------------------------

export type WorldActionKind = 'claim' | 'defend' | 'challenge' | 'push' | 'scout';
export type WorldOutcome = 'claimed' | 'defended' | 'repelled' | 'challenged' | 'pushed' | 'captured' | 'discovered';

export type ActionPlan = {
  kind: WorldActionKind;
  label: string;
  xp: number;
  /** Hold-to-confirm for moves that change ownership. */
  hold: boolean;
  tone: 'primary' | 'danger' | 'gold' | 'scout';
};

export type ActionBlock = { kind: 'locked'; label: string; reason: string };

/** What you can do here, from the territory's state and your crew (one primary move, like a game). */
export function planFor(t: Territory, discovered: boolean, myCrew = MY_CREW_ID): ActionPlan | ActionBlock {
  const s = t.state;
  if (!discovered) return { kind: 'scout', label: 'Scout territory', xp: 100, hold: false, tone: 'scout' };
  if (s.status === 'locked') return { kind: 'locked', label: 'Locked', reason: s.lockedReason ?? 'This territory is protected.' };
  if (!s.ownerCrewId) return { kind: 'claim', label: 'Claim territory', xp: 250, hold: true, tone: 'primary' };
  if (s.ownerCrewId === myCrew) return { kind: 'defend', label: 'Defend territory', xp: 120, hold: s.status !== 'owned', tone: s.status === 'owned' ? 'primary' : 'gold' };
  if (s.challengerCrewId === myCrew) return { kind: 'push', label: 'Push the attack', xp: 90, hold: true, tone: 'danger' };
  return { kind: 'challenge', label: 'Challenge for control', xp: 60, hold: true, tone: 'danger' };
}

export type ActionResult = { state: TerritoryState; reward: number; outcome: WorldOutcome; previousOwner: string | null };

/** Apply one of your moves. Pure: returns the territory's next state; the store commits it. */
export function applyAction(t: Territory, kind: WorldActionKind, now = Date.now(), myCrew = MY_CREW_ID, rand: () => number = Math.random): ActionResult {
  const s: TerritoryState = { ...t.state, recent: [...t.state.recent] };
  const prev = s.ownerCrewId;
  const log = (k: ActivityKind, xp: number, text: string) => s.recent.unshift({ id: `${t.id}-${now}`, kind: k, territoryId: t.id, crewId: myCrew, xp, text, at: now });
  const crewName = crewOf(myCrew)?.name ?? 'Your crew';
  let outcome: WorldOutcome;
  let reward: number;

  switch (kind) {
    case 'scout':
      return { state: s, reward: 100, outcome: 'discovered', previousOwner: prev };
    case 'claim':
      Object.assign(s, { ownerCrewId: myCrew, challengerCrewId: null, status: 'owned', control: 60, defence: 40 });
      s.xp += reward = 250;
      outcome = 'claimed';
      log('claim', reward, `${crewName} claimed ${t.name}`);
      break;
    case 'defend':
      s.control = Math.min(100, s.control + 8);
      s.defence = Math.min(99, s.defence + 10);
      s.xp += reward = 120;
      outcome = 'defended';
      if (s.status !== 'owned' && s.control >= 80) {
        Object.assign(s, { status: 'owned', challengerCrewId: null });
        outcome = 'repelled';
      }
      log('defend', reward, outcome === 'repelled' ? `${crewName} drove the attackers out` : `${crewName} reinforced ${t.name}`);
      break;
    case 'challenge':
      Object.assign(s, { status: 'contested', challengerCrewId: myCrew, control: Math.min(s.control, 88) });
      s.xp += reward = 60;
      outcome = 'challenged';
      log('challenge', reward, `${crewName} launched a challenge`);
      break;
    case 'push': {
      const mine = 100 - s.control + 12 + Math.round(rand() * 6);
      if (mine >= 60) {
        Object.assign(s, { ownerCrewId: myCrew, challengerCrewId: prev, status: 'contested', control: mine, defence: 35 });
        // The old owner is pushed out; they're still on the board as the challenger for a while.
        s.xp += reward = 300;
        outcome = 'captured';
        log('capture', reward, `${crewName} captured ${t.name}`);
      } else {
        s.control = 100 - mine;
        s.xp += reward = 90;
        outcome = 'pushed';
        log('challenge', reward, `${crewName} pushed the front line`);
      }
      break;
    }
  }
  s.lastActivityAt = now;
  s.activity = Math.min(1, s.activity + 0.1);
  s.activeUsers += 1;
  s.recent = s.recent.slice(0, 6);
  return { state: s, reward, outcome, previousOwner: prev };
}

// ---------------------------------------------------------------------------
// Ambient activity (the city keeps moving while you watch)
// ---------------------------------------------------------------------------

export type AmbientEvent = { item: ActivityItem; next: TerritoryState };

/** Pick an active territory (weighted by activity) and let something happen there. */
export function ambientEvent(world: Territory[], discovered: Set<string>, rand: () => number, now = Date.now(), myCrew = MY_CREW_ID): AmbientEvent | null {
  const pool = world.filter((t) => discovered.has(t.id) && t.state.status !== 'locked' && (t.state.ownerCrewId || t.state.activity > 0.3));
  if (!pool.length) return null;
  const total = pool.reduce((s, t) => s + t.state.activity, 0);
  let pick = rand() * total;
  const t = pool.find((x) => (pick -= x.state.activity) <= 0) ?? pool[pool.length - 1];
  const s: TerritoryState = { ...t.state, recent: [...t.state.recent] };
  const n = 2 + Math.floor(rand() * 14);
  let kind: ActivityKind = (['run', 'run', 'workout', 'defend', 'meetup', 'challenge'] as const)[Math.floor(rand() * 6)];
  let crewId = s.ownerCrewId;

  if (!s.ownerCrewId) {
    kind = 'run';
    crewId = null;
  } else if (kind === 'challenge') {
    // Rare: a rival opens a front. Your own territories are hit only occasionally, so the
    // "under attack" alert means something when it appears.
    const yours = s.ownerCrewId === myCrew;
    if (s.status === 'owned' && rand() < (yours ? 0.35 : 0.5)) {
      s.challengerCrewId = rival(s.ownerCrewId, rand);
      s.status = yours ? 'under_attack' : 'contested';
      s.control = Math.max(45, s.control - 15);
      crewId = s.challengerCrewId;
    } else if (s.challengerCrewId) {
      crewId = s.challengerCrewId;
      s.control = Math.max(40, s.control - 4);
    } else kind = 'run';
  } else if (kind === 'defend' && s.challengerCrewId && s.ownerCrewId !== myCrew) {
    s.control = Math.min(100, s.control + 6);
    if (s.control >= 82) Object.assign(s, { status: 'owned', challengerCrewId: null });
  }

  const xp = xpFor(kind, rand);
  if (crewId === s.ownerCrewId) s.xp += xp;
  s.activeUsers = Math.max(0, s.activeUsers + (rand() < 0.6 ? 1 : -1));
  s.lastActivityAt = now;
  const item: ActivityItem = { id: `${t.id}-${now}-${Math.floor(rand() * 1e6)}`, kind, territoryId: t.id, crewId, xp, text: describe(kind, t.name, crewId, n), at: now };
  s.recent = [item, ...s.recent].slice(0, 6);
  return { item, next: s };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
