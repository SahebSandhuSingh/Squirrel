/**
 * Where the camera is in the hierarchy (Bengal → metro → Kolkata → zone → territory) and what to
 * call it in the HUD. Pure: fed the camera centre + zoom and the territories.
 */
import type { LngLat, Territory } from '../types.ts';
import { inRing } from './geometry.ts';

export type WorldLevel = 'bengal' | 'metro' | 'city' | 'zone' | 'territory';

export const LEVEL_NAME: Record<WorldLevel, string> = {
  bengal: 'West Bengal',
  metro: 'Kolkata Metropolitan Region',
  city: 'Kolkata',
  zone: 'Neighbourhood',
  territory: 'Territory',
};

export function levelOf(zoom: number): WorldLevel {
  if (zoom < 8.2) return 'bengal';
  if (zoom < 10.2) return 'metro';
  if (zoom < 12.2) return 'city';
  if (zoom < 13.6) return 'zone';
  return 'territory';
}

/** The zone (L4) and, when close enough, the micro territory (L5) under a point. */
export function territoryAt(world: Territory[], p: LngLat, zoom = 20): { zone: Territory | null; territory: Territory | null } {
  let zone: Territory | null = null;
  let micro: Territory | null = null;
  for (const t of world) {
    const [w, s, e, n] = t.bbox;
    if (p[0] < w || p[0] > e || p[1] < s || p[1] > n) continue;
    if (!inRing(p, t.ring)) continue;
    if (t.tier === 4) zone = t;
    else micro = t;
  }
  return { zone, territory: zoom >= 13.2 && micro ? micro : zone };
}

export type RegionTitle = { title: string; crumbs: string[]; level: WorldLevel };

/** "WEST BENGAL" → "KOLKATA" → "SALT LAKE · SECTOR V" → "COLLEGE MORE", with a breadcrumb trail. */
export function regionTitle(world: Territory[], center: LngLat, zoom: number): RegionTitle {
  const level = levelOf(zoom);
  if (level === 'bengal') return { title: 'West Bengal', crumbs: ['India'], level };
  const { zone, territory } = territoryAt(world, center, zoom);
  const district = zone ? districtName(zone) : null;
  if (level === 'metro') return { title: district === 'Kalyani' ? 'Kalyani · Mohanpur' : 'Kolkata Metro', crumbs: ['Bengal'], level };
  if (!zone) return { title: level === 'city' ? 'Kolkata' : 'Off the network', crumbs: ['Bengal', 'Kolkata'], level };
  if (level === 'city') return { title: district ?? 'Kolkata', crumbs: ['Bengal'], level };
  if (level === 'zone' || !territory || territory.id === zone.id) return { title: zone.name, crumbs: ['Bengal', district ?? 'Kolkata'], level };
  return { title: territory.name, crumbs: [district ?? 'Kolkata', zone.name], level };
}

const DISTRICT: Record<string, string> = { KOLKATA: 'Kolkata', 'SALT LAKE': 'Salt Lake', 'NEW TOWN': 'New Town', HOWRAH: 'Howrah', KALYANI: 'Kalyani', OUTPOST: 'Outpost' };
export const districtName = (t: Territory) => DISTRICT[t.region] ?? t.region;
