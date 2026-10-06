/**
 * The Squirrel Social Territory Network: types shared by the data layer, the map engine and the HUD.
 *
 * Hierarchy (what the camera reveals as you zoom):
 *   L1 WEST BENGAL          state outline, cities, outposts (IIT KGP, Visva-Bharati…)
 *   L2 KOLKATA METRO REGION Kolkata, Howrah, Salt Lake, New Town, Kalyani–Mohanpur
 *   L3 KOLKATA              districts (zones) across the whole city
 *   L4 ZONES                neighbourhood-sized territories; some are split further
 *   L5 TERRITORIES          micro territories inside a split zone (College Street, Salt Lake sectors…)
 *
 * Coordinates are GeoJSON order, [lng, lat] — the rest of the app's LatLng is [lat, lng], so convert
 * at the boundary (see toLngLat).
 */
import type { LatLng } from '@/api/campus/types';

export type { LatLng };

export type LngLat = [number, number];
export type Ring = LngLat[];

export const toLngLat = (p: LatLng): LngLat => [p[1], p[0]];

/** Where an outline or a pin comes from. Anything not surveyed is drawn and labelled as approximate. */
export type Accuracy = 'surveyed' | 'approximate';

// ---------------------------------------------------------------------------
// Authored geography (static, correctable through data/regions/*)
// ---------------------------------------------------------------------------

/** A named seed: the centre of a territory. Cells are grown around seeds (Voronoi) inside a region. */
export type Seed = {
  id: string;
  name: string;
  /** [lat, lng] — written the way people read coordinates off a map. */
  at: LatLng;
  /** One line of flavour shown on the territory panel. */
  blurb?: string;
  tags?: TerritoryTag[];
  /** Micro territories (L5) grown inside this zone's cell. */
  children?: Seed[];
};

/** A playable area: an outline that its seeds tessellate. */
export type RegionSpec = {
  id: string;
  name: string;
  /** Name shown above territory names in the HUD (e.g. "SALT LAKE"). */
  district: string;
  /** Closed outline, [lat, lng]. */
  outline: LatLng[];
  accuracy: Accuracy;
  /**
   * Either seeds (cells are grown automatically) or explicit zones (an authored outline per zone,
   * e.g. Salt Lake's sectors), each optionally split further by its own child seeds.
   */
  seeds?: Seed[];
  zones?: (Seed & { outline: LatLng[] })[];
};

export type TerritoryTag = 'campus' | 'student' | 'hotspot' | 'heritage' | 'tech' | 'water' | 'park' | 'sports' | 'market' | 'transit' | 'outpost';

export type PlaceKind = 'university' | 'college' | 'landmark' | 'park' | 'lake' | 'sports' | 'hotspot' | 'junction' | 'transit';

export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  at: LatLng;
  accuracy: Accuracy;
  /** Smallest zoom it shows at (progressive disclosure). */
  minZoom: number;
  /** Search aliases ("CU", "JU", "Boi Para"…). */
  aliases?: string[];
  note?: string;
};

export type City = { id: string; name: string; at: LatLng; rank: 1 | 2 | 3; note?: string; campus?: string };

/**
 * A place someone asked for whose location isn't certain. It is listed in search with its
 * candidates but never drawn: fill in `at` (and move it to places) once confirmed.
 */
export type UnresolvedPlace = { id: string; asked: string; reason: string; candidates: { name: string; at: LatLng | null; note: string }[] };

export type Corridor = { id: string; name: string; path: LatLng[]; accuracy: Accuracy };

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type TerritoryStatus = 'unclaimed' | 'owned' | 'contested' | 'under_attack' | 'locked';

export type Crew = {
  id: string;
  name: string;
  short: string;
  /** Map colour (muted; the viewer's own crew is drawn in the brand lime). */
  color: string;
  /** MaterialCommunityIcons glyph for the emblem. */
  icon: string;
  members: number;
  xp: number;
  motto: string;
  home: string;
};

export type ActivityKind = 'claim' | 'defend' | 'challenge' | 'run' | 'workout' | 'capture' | 'discover' | 'meetup';

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  territoryId: string;
  crewId: string | null;
  xp: number;
  /** Aggregated, never an individual ("12 squirrels"), never a position. */
  text: string;
  at: number;
};

export type TerritoryState = {
  ownerCrewId: string | null;
  /** The crew pushing against the owner, when contested / under attack. */
  challengerCrewId: string | null;
  xp: number;
  /** Owner's share, 0..100. */
  control: number;
  /** 0..100 — how hard it is to take. */
  defence: number;
  /** 0..1 — drives particles, pulses and heat. */
  activity: number;
  /** Squirrels active here right now (aggregated). */
  activeUsers: number;
  lastActivityAt: number;
  status: TerritoryStatus;
  /** Why a locked territory is locked. */
  lockedReason?: string;
  recent: ActivityItem[];
};

/** One territory as the world knows it: geometry + identity + state. */
export type Territory = {
  id: string;
  name: string;
  /** "SALT LAKE", "KOLKATA", … */
  region: string;
  /** For L5: the zone it belongs to. */
  parentId: string | null;
  /** 4 = zone (L4), 5 = micro territory (L5). */
  tier: 4 | 5;
  /** True when the zone is split into L5 territories. */
  split: boolean;
  ring: Ring;
  centroid: LngLat;
  bbox: [number, number, number, number];
  areaKm2: number;
  accuracy: Accuracy;
  blurb: string | null;
  tags: TerritoryTag[];
  level: 1 | 2 | 3 | 4 | 5;
  state: TerritoryState;
};

export type DefenceRating = 'LOW' | 'MEDIUM' | 'HIGH' | 'FORTIFIED';

/** Everything the map draws, as sent to the engine. */
export type WorldGeometry = {
  territories: Territory[];
  places: Place[];
  cities: City[];
  corridors: Corridor[];
  unresolved: UnresolvedPlace[];
};
