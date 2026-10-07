/**
 * The campus map's state: zones, crews, territories and you, loaded from the service, kept live
 * through its events, and changed only by moves the service accepts. Components subscribe with
 * useSyncExternalStore; `moments` tells the map what to animate (a capture, an attack, a ping).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { campusMapService, type LiveEvent } from '../services';
import type { ActionResult, Activity, Crew, LngLat, Player, Territory, Zone, ZoneAction } from '../types';

export type CampusMapState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  mode: 'preview' | 'live';
  zones: Zone[];
  crews: Crew[];
  territories: Territory[];
  player: Player | null;
  /** Campus-wide live activity, newest first. */
  feed: Activity[];
  pending: { zoneId: string; action: ZoneAction } | null;
};

export type Moment =
  | { kind: 'result'; result: ActionResult; action: ZoneAction; from: LngLat | null }
  | { kind: 'captured'; zone: Zone; byCrewId: string; fromCrewId: string | null }
  | { kind: 'ping'; zoneId: string; crewId: string | null; activity: Activity };

let state: CampusMapState = { status: 'idle', error: null, mode: 'preview', zones: [], crews: [], territories: [], player: null, feed: [], pending: null };
const listeners = new Set<() => void>();
const momentListeners = new Set<(m: Moment) => void>();
const set = (patch: Partial<CampusMapState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const emit = (m: Moment) => momentListeners.forEach((l) => l(m));

export const getCampusMap = () => state;

export function useCampusMap(): CampusMapState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function onMoment(l: (m: Moment) => void) {
  momentListeners.add(l);
  return () => {
    momentListeners.delete(l);
  };
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong');

export async function loadCampusMap() {
  const svc = campusMapService();
  if (state.status === 'loading') return;
  set({ status: 'loading', error: null, mode: svc.mode });
  try {
    const [zones, crews, territories, player] = await Promise.all([svc.getZones(), svc.getCrews(), svc.getTerritories(), svc.getPlayer()]);
    set({ status: 'ready', zones, crews, territories, player });
  } catch (e) {
    set({ status: 'error', error: message(e) });
  }
}

function applyLive(e: LiveEvent) {
  if (e.type === 'zone') {
    const prev = state.zones.find((z) => z.id === e.zone.id);
    set({ zones: state.zones.map((z) => (z.id === e.zone.id ? e.zone : z)) });
    if (prev && e.zone.ownerCrewId && prev.ownerCrewId !== e.zone.ownerCrewId) emit({ kind: 'captured', zone: e.zone, byCrewId: e.zone.ownerCrewId, fromCrewId: prev.ownerCrewId });
  } else {
    set({ feed: [e.activity, ...state.feed].slice(0, 40) });
    emit({ kind: 'ping', zoneId: e.activity.zoneId, crewId: e.activity.crewId ?? null, activity: e.activity });
  }
}

/** Keep the map live while it's on screen. */
export function startCampusLive() {
  return campusMapService().subscribe(applyLive);
}

export async function performAction(zoneId: string, action: ZoneAction, position: LngLat | null): Promise<ActionResult> {
  set({ pending: { zoneId, action } });
  try {
    const result = await campusMapService().act(zoneId, action, position);
    const territories = state.territories.filter((t) => t.zoneId !== zoneId).concat(result.territory && result.zone.ownerCrewId ? [result.territory] : []);
    set({ zones: state.zones.map((z) => (z.id === zoneId ? result.zone : z)), territories, player: result.player, pending: null });
    emit({ kind: 'result', result, action, from: position });
    return result;
  } catch (e) {
    set({ pending: null });
    throw e;
  }
}

/** A zone's recent activity: fetched when asked for, then kept up to date from live events. */
export function useZoneActivity(zoneId: string | null, enabled: boolean) {
  const [list, setList] = useState<{ zoneId: string; items: Activity[]; error: string | null } | null>(null);
  const feed = useCampusMap().feed;
  useEffect(() => {
    if (!zoneId || !enabled) return;
    let live = true;
    campusMapService()
      .getZoneActivity(zoneId)
      .then((items) => live && setList({ zoneId, items, error: null }))
      .catch((e) => live && setList({ zoneId, items: [], error: message(e) }));
    return () => {
      live = false;
    };
  }, [zoneId, enabled]);
  if (!zoneId || !list || list.zoneId !== zoneId) return { items: null, error: null };
  const fresh = feed.filter((a) => a.zoneId === zoneId && !list.items.some((b) => b.id === a.id));
  return { items: [...fresh, ...list.items].slice(0, 20), error: list.error };
}
