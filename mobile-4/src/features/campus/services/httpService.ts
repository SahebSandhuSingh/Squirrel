/**
 * The campus map against a real backend (EXPO_PUBLIC_CAMPUS_MAP_API_URL). Zones come back as
 * state; geometry is the app's own (OpenStreetMap), joined by zone id, so the server never has to
 * ship polygons. Zones the app doesn't know are ignored rather than drawn somewhere invented.
 */
import { api } from '@/api/client';
import type { CampusGeography } from '../data/geography';
import type { ActionResult, Activity, Crew, Player, Territory, Zone } from '../types';
import { CAMPUS_MAP_ROUTES as R, type CampusMapService, type LiveEvent } from './types';

type ZoneWire = Omit<Zone, 'geometry' | 'center'> & Partial<Pick<Zone, 'geometry' | 'center'>>;

export function httpCampusMapService(base: string, geo: CampusGeography): CampusMapService {
  const byId = new Map(geo.zones.map((z) => [z.id, z]));
  const join = (w: ZoneWire): Zone | null => {
    const g = byId.get(w.id);
    return g ? { ...w, geometry: g, center: g.center, name: w.name || g.name, type: w.type || g.type } : null;
  };
  const get = <T>(path: string) => api<T>(path, { base });
  const listeners = new Set<(e: LiveEvent) => void>();
  return {
    mode: 'live',
    getZones: async () => (await get<ZoneWire[]>(R.zones)).map(join).filter((z): z is Zone => !!z),
    getTerritories: () => get<Territory[]>(R.territories),
    getTerritory: (id) => get<Territory>(R.territory(id)),
    getCrews: () => get<Crew[]>(R.crews),
    getZoneActivity: (id) => get<Activity[]>(R.activity(id)),
    getPlayer: () => get<Player>(R.me),
    act: async (zoneId, action, position) => {
      const r = await api<ActionResult & { zone: ZoneWire }>(R.action(zoneId, action), { base, method: 'POST', body: { position } });
      const zone = join(r.zone);
      if (!zone) throw new Error('unknown_zone');
      return { ...r, zone };
    },
    // No socket yet: the store refreshes on focus and after every move.
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
