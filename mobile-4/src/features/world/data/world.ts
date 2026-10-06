/**
 * The whole network's static geography in one place. Shapes are grown once, lazily, the first
 * time the map needs them (a few milliseconds), and reused for the session.
 */
import type { RegionSpec } from '../types.ts';
import { buildTerritories, type TerritoryShape } from '../logic/buildWorld.ts';
import { CITIES, OUTPOSTS, REGION_LABELS } from './regions/bengal.ts';
import { HOWRAH } from './regions/howrah.ts';
import { KALYANI } from './regions/kalyani.ts';
import { KOLKATA } from './regions/kolkata.ts';
import { NEW_TOWN } from './regions/newTown.ts';
import { SALT_LAKE } from './regions/saltLake.ts';
import { PLACES } from './places.ts';
import { CORRIDORS, HOOGHLY, UNRESOLVED } from './context.ts';

export const REGIONS: RegionSpec[] = [KOLKATA, SALT_LAKE, NEW_TOWN, HOWRAH, KALYANI, ...OUTPOSTS];

let shapes: TerritoryShape[] | null = null;
export function territoryShapes(): TerritoryShape[] {
  return (shapes ??= buildTerritories(REGIONS));
}

export { CITIES, CORRIDORS, HOOGHLY, PLACES, REGION_LABELS, UNRESOLVED };

/** Camera targets for the HUD's jump buttons ([lng, lat], zoom). */
export const VIEWS = {
  bengal: { center: [87.95, 24.25] as [number, number], zoom: 5.9, pitch: 0, bearing: 0 },
  metro: { center: [88.42, 22.72] as [number, number], zoom: 9.2, pitch: 0, bearing: 0 },
  kolkata: { center: [88.385, 22.555] as [number, number], zoom: 11.35, pitch: 28, bearing: -8 },
};
