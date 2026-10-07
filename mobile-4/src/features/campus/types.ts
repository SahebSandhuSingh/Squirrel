/**
 * IISER Kolkata territory map — the data model.
 *
 * Geography and gameplay are kept apart:
 *   ZoneGeometry   where a zone is (from OpenStreetMap; never changes during play)
 *   Zone           a zone as the API serves it: geometry + who holds it and how strongly
 *   Territory      one crew's hold on one zone (strength, when it was taken, when it lapses)
 *   Crew, Activity crews and the moves people make
 *
 * The map draws whatever these say. Nothing about ownership lives in the render layer.
 */
export type LngLat = [number, number];
export type Ring = LngLat[];

export type ZoneType =
  | 'academic'
  | 'hostel'
  | 'dining'
  | 'sports'
  | 'gate'
  | 'library'
  | 'research'
  | 'activity'
  | 'ground'
  | 'water'
  | 'admin'
  | 'community';

export type ZoneStatus = 'neutral' | 'owned' | 'contested' | 'locked';

export type ZoneGeometry = {
  id: string;
  name: string;
  /** Short label for tight spots on the map (falls back to name). */
  short: string;
  type: ZoneType;
  /** Polygon rings in GeoJSON order: one outer ring (CCW, closed), optional holes. */
  polygon: Ring[];
  /** The landmark the zone is named after — where its node sits. Always inside the polygon. */
  center: LngLat;
  /** Radius of a circle with the same area, in metres. */
  radiusM: number;
  areaM2: number;
  bbox: [number, number, number, number];
  /** The OpenStreetMap features this zone is grown around (their names, as OSM has them). */
  landmarks: string[];
  /** 'osm' when the name is OpenStreetMap's; 'descriptive' when OSM leaves the place unnamed. */
  nameSource: 'osm' | 'descriptive';
  /** Residences and the school: drawn, never playable. */
  protected: boolean;
};

export type Challenge = {
  id: string;
  zoneId: string;
  attackerCrewId: string;
  defenderCrewId: string;
  /** 0–100: how close the attackers are to taking the zone. */
  progress: number;
  startedAt: number;
  endsAt: number;
};

/** GET /zones — geometry plus live state. */
export type Zone = {
  id: string;
  name: string;
  geometry: ZoneGeometry;
  center: LngLat;
  type: ZoneType;
  xpValue: number;
  ownerCrewId: string | null;
  /** 0–100. */
  defenseStrength: number;
  /** 0–1: how busy the zone is right now. */
  activityLevel: number;
  activeUsers: number;
  status: ZoneStatus;
  lastCapturedAt: number | null;
  challenge: Challenge | null;
  createdAt: number;
  updatedAt: number;
};

/** GET /territories — a crew's hold on a zone. */
export type Territory = {
  id: string;
  zoneId: string;
  crewId: string;
  strength: number;
  capturedAt: number;
  expiresAt: number;
};

export type Crew = { id: string; name: string; short: string; color: string; memberCount: number };

export type ActivityKind = 'claim' | 'attack' | 'defend' | 'capture' | 'challenge' | 'visit';

/** GET /zones/:id/activity */
export type Activity = {
  id: string;
  zoneId: string;
  userId: string;
  xp: number;
  timestamp: number;
  kind?: ActivityKind;
  crewId?: string | null;
};

export type ZoneAction = 'claim' | 'attack' | 'capture' | 'defend' | 'challenge';

/** The signed-in player, as far as this map needs. */
export type Player = { userId: string; crewId: string | null; xp: number };

export type ActionResult = {
  zone: Zone;
  territory: Territory | null;
  outcome: 'claimed' | 'attacked' | 'captured' | 'defended' | 'repelled' | 'challenged';
  xpGained: number;
  player: Player;
};
