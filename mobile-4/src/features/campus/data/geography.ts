/**
 * IISER Kolkata's zones, grown from the real campus.
 *
 * Input: the OpenStreetMap extract in api/campus/campusOsm.json (scripts/campus-osm.mjs): the
 * university outline (OSM way 354549537), its buildings, grounds, water, roads and named points.
 *
 * Each zone is named after real landmarks (ZONES below). Every vertex of a landmark's footprint
 * becomes a seed; the campus outline is split into Voronoi cells around all the seeds, and each
 * zone is the union of its landmarks' cells. So zones follow the campus: boundaries fall halfway
 * between buildings, every bit of campus belongs to exactly one zone, and neighbouring zones
 * share edges exactly — which is what lets a crew's neighbouring zones merge into one region.
 *
 * Pure (takes the JSON as an argument) so node tests can run it.
 */
import { bboxOf, centroidXY, closedCCW, inRing, plane, signedArea, voronoiCells, type XY } from '../../world/logic/geometry.ts';
import { adjacency, dissolve } from '../logic/dissolve.ts';
import type { LngLat, Ring, ZoneGeometry, ZoneType } from '../types.ts';

type LatLng = [number, number];
export type OsmCampus = {
  attribution: string;
  campus_way: number;
  boundary: LatLng[];
  features: {
    buildings: { id: string; polygon: LatLng[]; kind: string; levels: number | null; label: string | null }[];
    terrain: { id: string; kind: string; polygon: LatLng[]; label?: string | null }[];
    roads: { id: string; kind: string; points: LatLng[] }[];
    pois: { id: string; name: string; kind: string; position: LatLng }[];
  };
};

/** A landmark: an OSM feature's exact name (building or area label), its OSM area id, or a named point. */
type Ref = { label: string } | { terrain: string } | { poi: string };

type ZoneDef = { id: string; name: string; short?: string; type: ZoneType; refs: Ref[]; descriptive?: boolean; protected?: boolean };

/**
 * The zones. Ids match campus-service's zone ids where it has the same place (nivedita, nscb,
 * mess, library, lhc, admin, lake…). Names are OpenStreetMap's; the three water/green areas OSM
 * leaves unnamed get plain descriptions (marked `descriptive`) rather than invented names.
 * Faculty and staff residences and the Garden High School are protected: drawn, never playable.
 */
export const ZONES: ZoneDef[] = [
  { id: 'gate-7', name: 'Gate No. 7', short: 'Gate 7', type: 'gate', refs: [{ poi: 'IISER Kolkata Gate no 7' }, { terrain: 't-w966183566' }] },
  { id: 'staff-quarters', name: 'Staff Quarters', type: 'community', refs: [{ label: 'Block A, Staff Quarters' }, { label: 'Block B, Staff Quarters' }], protected: true },
  { id: 'east-green', name: 'East Green', type: 'ground', refs: [{ terrain: 't-w966183563' }], descriptive: true },
  { id: 'garden-high-school', name: 'Garden High School', short: 'Garden High', type: 'academic', refs: [{ label: 'Garden High Scool IISER Kolkata Campus' }], protected: true },
  { id: 'material-science', name: 'Material Science Center', short: 'Material Science', type: 'research', refs: [{ label: 'Material Science Center' }, { terrain: 't-w966183562' }] },
  { id: 'admin', name: 'Admin Building', short: 'Admin', type: 'admin', refs: [{ label: 'Admin Building' }, { terrain: 't-w1122319124' }] },
  { id: 'library', name: 'IISER Kolkata Library', short: 'Library', type: 'library', refs: [{ label: 'IISER Kolkata Library' }] },
  { id: 'auditorium', name: 'Rabindranath Tagore Auditorium', short: 'Auditorium', type: 'activity', refs: [{ label: 'Rabindranath Tagore Auditorium' }] },
  { id: 'north-pond', name: 'North Pond', type: 'water', refs: [{ terrain: 't-w966183564' }], descriptive: true },
  { id: 'lhc', name: 'APC Ray Lecture Hall Complex', short: 'LHC', type: 'academic', refs: [{ label: 'APC Ray Lecture Hall Complex' }] },
  { id: 'ajc-bose', name: 'AJC Bose Research Complex', short: 'AJC Bose', type: 'research', refs: [{ label: 'AJC Bose Research Complex' }] },
  { id: 'lake', name: 'RC Lake', type: 'water', refs: [{ label: 'RC Lake' }] },
  { id: 'polymer-research', name: 'Polymer Research Center', short: 'Polymer Research', type: 'research', refs: [{ label: 'Polymer Research Center' }, { label: 'Utility Building' }, { label: 'Electrical Substation I' }, { terrain: 't-w1122311294' }] },
  { id: 'icv-hall', name: 'ICV Hall', type: 'hostel', refs: [{ label: 'ICV Hall' }] },
  { id: 'mess', name: 'Dining Hall', short: 'Dining', type: 'dining', refs: [{ label: 'Dining Hall' }] },
  { id: 'nscb', name: 'NSCB Hall', type: 'hostel', refs: [{ label: 'NSCB Hall' }] },
  { id: 'faculty-quarters', name: 'Faculty Quarters', short: 'Faculty Qtrs', type: 'community', refs: [{ label: 'Block A, Faculty Quarters' }, { label: 'Block B, Faculty Quarters' }, { label: 'Block C, Faculty Quarters' }, { label: "Director's Bungalow" }, { label: 'Visitors Hostel' }], protected: true },
  { id: 'football-ground', name: 'Football Ground', short: 'Football', type: 'sports', refs: [{ label: 'Football Ground' }] },
  { id: 'nivedita', name: 'Nivedita Hall', short: 'Nivedita', type: 'hostel', refs: [{ label: 'Nivedita Hall' }] },
  { id: 'cricket-ground', name: 'Cricket Ground', short: 'Cricket', type: 'ground', refs: [{ label: 'Cricket Ground' }] },
  { id: 'west-ponds', name: 'West Ponds', type: 'water', refs: [{ terrain: 't-w1122314527' }, { terrain: 't-w1122314603' }], descriptive: true },
  { id: 'faculty-quarters-d', name: 'Faculty Quarters · Block D', short: 'Block D', type: 'community', refs: [{ label: 'Block D, Faculty Quarters' }], protected: true },
  { id: 'prefab-blocks', name: 'Prefab Blocks', short: 'Prefabs', type: 'community', refs: [{ label: 'Prefab I' }, { label: 'Prefab II' }, { label: 'Prefab III' }, { label: 'Prefab IV' }, { poi: 'Medical Unit' }] },
  { id: 'swimming-pool', name: 'Swimming Pool', short: 'Pool', type: 'sports', refs: [{ label: 'IISER Kolkata Swimming Pool' }] },
];

export const ZONE_TYPE_LABEL: Record<ZoneType, string> = {
  academic: 'Academic',
  hostel: 'Hostel',
  dining: 'Dining',
  sports: 'Sports',
  gate: 'Gate',
  library: 'Library',
  research: 'Research',
  activity: 'Student activity',
  ground: 'Open ground',
  water: 'Water',
  admin: 'Administration',
  community: 'Community',
};

const ll = (p: LatLng): LngLat => [p[1], p[0]];

export type CampusGeography = {
  zones: ZoneGeometry[];
  /** Zone id pairs that share an edge ("a|b", a < b). */
  neighbours: Set<string>;
  boundary: Ring;
  bbox: [number, number, number, number];
  center: LngLat;
  attribution: string;
};

export function buildGeography(osm: OsmCampus): CampusGeography {
  const boundary = closedCCW(osm.boundary.map(ll));
  const bbox = bboxOf(boundary);
  const origin: LngLat = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  const P = plane(origin);
  const outline: XY[] = boundary.slice(0, -1).map(P.to);

  const { buildings, terrain, pois } = osm.features;
  const shapeOf = (r: Ref): { pts: LngLat[]; name: string } | null => {
    if ('poi' in r) {
      const p = pois.find((x) => x.name === r.poi);
      return p ? { pts: [ll(p.position)], name: p.name } : null;
    }
    if ('terrain' in r) {
      const t = terrain.find((x) => x.id === r.terrain);
      return t ? { pts: t.polygon.map(ll), name: t.label ?? '' } : null;
    }
    const b = buildings.find((x) => x.label === r.label) ?? terrain.find((x) => x.label === r.label);
    return b ? { pts: b.polygon.map(ll), name: r.label } : null;
  };

  // Seeds: up to 10 vertices of each landmark's outline plus its centre, kept inside the campus.
  const seeds: XY[] = [];
  const seedZone: number[] = [];
  const anchors: XY[] = [];
  const landmarks: string[][] = [];
  ZONES.forEach((z, zi) => {
    const names: string[] = [];
    let anchor: XY | null = null;
    for (const r of z.refs) {
      const s = shapeOf(r);
      if (!s) throw new Error(`campus geography: ${z.id} landmark not in OpenStreetMap data: ${JSON.stringify(r)}`);
      if (s.name) names.push(s.name);
      const xy = s.pts.map(P.to);
      const ring = xy.length > 1 && xy[0][0] === xy[xy.length - 1][0] && xy[0][1] === xy[xy.length - 1][1] ? xy.slice(0, -1) : xy;
      const c = ring.length >= 3 ? centroidXY(ring) : ring[0];
      anchor ??= c;
      const step = Math.max(1, Math.ceil(ring.length / 10));
      const pts = [c, ...(ring.length >= 3 ? ring.filter((_, i) => i % step === 0) : [])];
      for (const p of pts) {
        if (!inRing(p, outline)) continue;
        // Two seeds on the same spot would make a degenerate bisector.
        if (seeds.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5)) continue;
        seeds.push(p);
        seedZone.push(zi);
      }
    }
    anchors.push(anchor as XY);
    landmarks.push(names);
  });

  const cells = voronoiCells(outline, seeds);
  const zoneRings: XY[][] = [];
  const zones: ZoneGeometry[] = ZONES.map((z, zi) => {
    const own = cells.filter((c, i) => seedZone[i] === zi && c.length >= 3);
    const parts = dissolve(own);
    // A zone is one connected place: its landmarks must not be split by another zone's.
    if (!parts || parts.length !== 1) throw new Error(`campus geography: ${z.id} is not one connected outline (${parts?.length ?? 'unclosed'})`);
    const main = parts[0];
    zoneRings.push(main.outer);
    const area = signedArea(main.outer) - main.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
    const polygon: Ring[] = [closedCCW(main.outer.map(P.from)), ...main.holes.map((h) => closedCCW(h.map(P.from)).reverse())];
    let anchor = anchors[zi];
    if (!inRing(anchor, main.outer)) anchor = centroidXY(main.outer);
    return {
      id: z.id,
      name: z.name,
      short: z.short ?? z.name,
      type: z.type,
      polygon,
      center: P.from(anchor),
      radiusM: Math.round(Math.sqrt(area / Math.PI)),
      areaM2: Math.round(area),
      bbox: bboxOf(polygon[0]),
      landmarks: landmarks[zi],
      nameSource: z.descriptive ? 'descriptive' : 'osm',
      protected: !!z.protected,
    };
  });

  const neighbours = new Set<string>();
  for (const k of adjacency(zoneRings, 6).keys()) {
    const [a, b] = k.split('|').map(Number);
    neighbours.add([zones[a].id, zones[b].id].sort().join('|'));
  }

  return { zones, neighbours, boundary, bbox, center: origin, attribution: osm.attribution };
}

export const areNeighbours = (g: Pick<CampusGeography, 'neighbours'>, a: string, b: string) => g.neighbours.has([a, b].sort().join('|'));
