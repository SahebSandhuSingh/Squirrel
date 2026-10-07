/**
 * The campus, built once from the bundled OpenStreetMap extract. (geography.ts is the pure
 * builder; this file is the app's instance of it.)
 */
import osm from '@/api/campus/campusOsm.json';
import { buildGeography, type CampusGeography, type OsmCampus } from './geography';

let built: CampusGeography | null = null;

export function campusGeography(): CampusGeography {
  built ??= buildGeography(osm as unknown as OsmCampus);
  return built;
}

export const CAMPUS_OSM = osm as unknown as OsmCampus;
