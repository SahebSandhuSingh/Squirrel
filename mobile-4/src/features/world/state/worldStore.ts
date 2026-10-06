/**
 * Territory network state for the session. Same pattern as state/territoryStore.ts: plain module
 * state behind useSyncExternalStore, with per-territory subscriptions so one change re-renders one
 * panel — never the map (the map engine gets a new FeatureCollection only when something it
 * DRAWS changed: owner, status, level, discovery).
 *
 * Preview progress (what you discovered and claimed, your season XP) is kept on the device, the
 * same way the theme preference is (localStorage on web, SecureStore on phones).
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ActivityItem, Territory, TerritoryState } from '../types';
import { territoryShapes } from '../data/world';
import { MY_CREW_ID } from '../data/crews';
import { withState } from '../logic/buildWorld';
import { rng } from '../logic/geometry';
import { ambientEvent, applyAction, previewState, START_UNDISCOVERED, type ActionResult, type WorldActionKind } from '../source/preview';
import type { WorldSource } from '../source/types';

// ---------------------------------------------------------------------------
// Persistence (small: ids + a few numbers)
// ---------------------------------------------------------------------------

const KEY = 'squirrel.world.v1';
type Saved = { found: string[]; xp: number; own: Record<string, [string | null, TerritoryState['status'], number, number, string | null]> };

function readSaved(): Saved | null {
  try {
    const raw = Platform.OS === 'web' ? (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null) : SecureStore.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const own: Saved['own'] = {};
    for (const id of touched) {
      const s = byId.get(id)?.state;
      if (s) own[id] = [s.ownerCrewId, s.status, s.control, s.xp, s.challengerCrewId];
    }
    let raw = JSON.stringify({ found: [...discovered].filter((id) => START_UNDISCOVERED.has(id)), xp: seasonXp, own } satisfies Saved);
    // SecureStore values should stay small on Android: drop territory changes before discoveries.
    if (Platform.OS !== 'web' && raw.length > 1900) raw = JSON.stringify({ found: [...discovered].filter((id) => START_UNDISCOVERED.has(id)), xp: seasonXp, own: {} });
    try {
      if (Platform.OS === 'web') localStorage.setItem(KEY, raw);
      else SecureStore.setItem(KEY, raw);
    } catch {
      // Storage full / unavailable: progress stays for this session only.
    }
  }, 600);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const byId = new Map<string, Territory>();
let list: Territory[] = [];
let discovered = new Set<string>();
const touched = new Set<string>();
let seasonXp = 12_480;
let feed: ActivityItem[] = [];
/** Bumped when anything the map draws changes. */
let mapVersion = 0;
let initialised = false;

const listeners = { list: new Set<() => void>(), map: new Set<() => void>(), meta: new Set<() => void>(), feed: new Set<() => void>() };
const byIdListeners = new Map<string, Set<() => void>>();
const emit = (set: Set<() => void>) => set.forEach((l) => l());

function init() {
  if (initialised) return;
  initialised = true;
  const shapes = territoryShapes();
  const states = previewState(shapes);
  const saved = readSaved();
  discovered = new Set(shapes.map((s) => s.id).filter((id) => !START_UNDISCOVERED.has(id) || saved?.found.includes(id)));
  if (saved) {
    seasonXp = saved.xp;
    for (const [id, [owner, status, control, xp, challenger]] of Object.entries(saved.own ?? {})) {
      const s = states.get(id);
      if (!s || s.status === 'locked') continue;
      Object.assign(s, { ownerCrewId: owner, status, control, xp, challengerCrewId: challenger });
      touched.add(id);
    }
  }
  for (const s of shapes) byId.set(s.id, withState(s, states.get(s.id)!));
  list = [...byId.values()];
  feed = list
    .flatMap((t) => t.state.recent)
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
}

/** Draw-relevant fingerprint: if it doesn't change, the engine doesn't need new geometry. */
const drawKey = (t: Territory) => `${t.state.ownerCrewId}|${t.state.challengerCrewId}|${t.state.status}|${t.level}|${Math.round(t.state.control / 5)}|${Math.round(t.state.activity * 5)}`;

function commit(id: string, state: TerritoryState, opts: { mine?: boolean } = {}) {
  const cur = byId.get(id);
  if (!cur) return;
  const next = withState(cur, state);
  const drawChanged = drawKey(cur) !== drawKey(next);
  byId.set(id, next);
  list = list.map((t) => (t.id === id ? next : t));
  if (opts.mine) touched.add(id);
  byIdListeners.get(id)?.forEach((l) => l());
  emit(listeners.list);
  if (drawChanged) {
    mapVersion++;
    emit(listeners.map);
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getWorld(): Territory[] {
  init();
  return list;
}
export const getTerritory = (id: string | null | undefined) => (init(), id ? byId.get(id) : undefined);
export const isDiscovered = (id: string) => (init(), discovered.has(id));
export const getDiscovered = () => (init(), discovered);
export const getSeasonXp = () => seasonXp;

const sub = (set: Set<() => void>) => (l: () => void) => {
  set.add(l);
  return () => void set.delete(l);
};

export function useWorld(): Territory[] {
  init();
  return useSyncExternalStore(sub(listeners.list), () => list, () => list);
}

/** Bumps when the map's drawing must change. */
export function useMapVersion(): number {
  return useSyncExternalStore(sub(listeners.map), () => mapVersion, () => mapVersion);
}

export function useTerritory(id: string | null | undefined): Territory | undefined {
  init();
  return useSyncExternalStore(
    (l) => {
      if (!id) return () => {};
      let set = byIdListeners.get(id);
      if (!set) byIdListeners.set(id, (set = new Set()));
      set.add(l);
      return () => void set!.delete(l);
    },
    () => (id ? byId.get(id) : undefined),
    () => (id ? byId.get(id) : undefined),
  );
}

export function useDiscovered(): Set<string> {
  init();
  return useSyncExternalStore(sub(listeners.meta), () => discovered, () => discovered);
}

export function useSeasonXp(): number {
  return useSyncExternalStore(sub(listeners.meta), () => seasonXp, () => seasonXp);
}

export function useFeed(): ActivityItem[] {
  init();
  return useSyncExternalStore(sub(listeners.feed), () => feed, () => feed);
}

// ---------------------------------------------------------------------------
// Moments (claim / capture / discovery / battle): the screen plays them, the engine animates
// ---------------------------------------------------------------------------

export type Moment =
  | { id: number; kind: 'discover'; territoryId: string; xp: number }
  | { id: number; kind: 'claim' | 'capture'; territoryId: string; xp: number; crewId: string }
  | { id: number; kind: 'defend' | 'repel' | 'challenge' | 'push'; territoryId: string; xp: number; crewId: string };

let moment: Moment | null = null;
let momentSeq = 0;
const momentListeners = new Set<() => void>();
function setMoment(m: Moment | null) {
  moment = m;
  momentListeners.forEach((l) => l());
}
export const clearMoment = (id: number) => moment?.id === id && setMoment(null);
export function useMoment(): Moment | null {
  return useSyncExternalStore(sub(momentListeners), () => moment, () => moment);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function addFeed(item: ActivityItem) {
  feed = [item, ...feed].slice(0, 12);
  emit(listeners.feed);
}

function gainXp(xp: number) {
  seasonXp += xp;
  emit(listeners.meta);
}

/** Reveal a territory (entering it, or scouting it in the preview). Returns false if already known. */
export function discover(id: string): boolean {
  init();
  if (discovered.has(id) || !byId.has(id)) return false;
  discovered = new Set(discovered).add(id);
  // Discovering a split zone reveals the zone outline; its territories reveal one by one.
  gainXp(100);
  mapVersion++;
  emit(listeners.map);
  emit(listeners.meta);
  byIdListeners.get(id)?.forEach((l) => l());
  const t = byId.get(id)!;
  addFeed({ id: `disc-${id}-${Date.now()}`, kind: 'discover', territoryId: id, crewId: MY_CREW_ID, xp: 100, text: `You discovered ${t.name}`, at: Date.now() });
  setMoment({ id: ++momentSeq, kind: 'discover', territoryId: id, xp: 100 });
  scheduleSave();
  return true;
}

const OUTCOME_MOMENT = { claimed: 'claim', captured: 'capture', defended: 'defend', repelled: 'repel', challenged: 'challenge', pushed: 'push' } as const;

/** Your move. Goes through the source (preview today), then commits and plays its moment. */
export async function perform(id: string, kind: WorldActionKind, source: WorldSource = previewSource): Promise<ActionResult | null> {
  init();
  const t = byId.get(id);
  if (!t) return null;
  if (kind === 'scout') {
    discover(id);
    return { state: t.state, reward: 100, outcome: 'discovered', previousOwner: t.state.ownerCrewId };
  }
  const r = await source.act(t, kind);
  commit(id, r.state, { mine: true });
  gainXp(r.reward);
  addFeed(r.state.recent[0]);
  if (r.outcome !== 'discovered') setMoment({ id: ++momentSeq, kind: OUTCOME_MOMENT[r.outcome], territoryId: id, xp: r.reward, crewId: MY_CREW_ID });
  scheduleSave();
  return r;
}

// ---------------------------------------------------------------------------
// The preview source + ambient simulation
// ---------------------------------------------------------------------------

export const previewSource: WorldSource = {
  kind: 'preview',
  load: async () => getWorld(),
  act: async (t, kind) => applyAction(t, kind),
  subscribe(onEvent) {
    const rand = rng(`ambient-${Date.now()}`);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const e = ambientEvent(getWorld(), discovered, rand);
      if (e) onEvent({ item: e.item, territoryId: e.item.territoryId, next: e.next });
      timer = setTimeout(tick, 2600 + rand() * 3200);
    };
    timer = setTimeout(tick, 1800);
    return () => clearTimeout(timer);
  },
};

// ---------------------------------------------------------------------------
// Alerts: a rival opened a front on one of YOUR territories
// ---------------------------------------------------------------------------

let alert: { id: number; territoryId: string } | null = null;
const alertListeners = new Set<() => void>();
export function clearAlert() {
  alert = null;
  alertListeners.forEach((l) => l());
}
export function useAlert() {
  return useSyncExternalStore(sub(alertListeners), () => alert, () => alert);
}

let liveUsers = 0;
let stopLive: (() => void) | null = null;
const pingListeners = new Set<(item: ActivityItem) => void>();

/** Map pings for ambient activity (the engine draws a ripple; nothing re-renders). */
export function onActivityPing(l: (item: ActivityItem) => void) {
  pingListeners.add(l);
  return () => void pingListeners.delete(l);
}

/** Start the living city while the map is on screen (ref-counted). */
export function startWorldActivity(source: WorldSource = previewSource): () => void {
  init();
  liveUsers++;
  if (liveUsers === 1) {
    stopLive = source.subscribe(({ item, territoryId, next }) => {
      const before = byId.get(territoryId)?.state;
      commit(territoryId, next);
      if (before && before.status !== 'under_attack' && next.status === 'under_attack' && next.ownerCrewId === MY_CREW_ID) {
        alert = { id: ++momentSeq, territoryId };
        alertListeners.forEach((l) => l());
      }
      addFeed(item);
      pingListeners.forEach((l) => l(item));
    });
  }
  return () => {
    liveUsers = Math.max(0, liveUsers - 1);
    if (!liveUsers) {
      stopLive?.();
      stopLive = null;
    }
  };
}
