/**
 * World → GeoJSON for the engine. Properties are flat, short and numeric where possible: they are
 * what the map's style expressions read, and they cross the WebView bridge on every update.
 */
import type { Place, Territory } from '../types';
import { toLngLat } from '../types';
import { CREW_BY_ID, MY_CREW_ID } from '../data/crews';
import { CITIES, CORRIDORS, HOOGHLY, PLACES, REGION_LABELS } from '../data/world';
import { bboxOf, rng, scatter } from '../logic/geometry';
import bengal from '../data/geo/bengal.json';

type Geometry = { type: 'Point'; coordinates: [number, number] } | { type: 'LineString'; coordinates: [number, number][] } | { type: 'Polygon'; coordinates: [number, number][][] } | { type: 'MultiPolygon'; coordinates: [number, number][][][] };
export type Feature = { type: 'Feature'; id?: string | number; geometry: Geometry; properties: Record<string, string | number | boolean | null> };
export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

/** Map colours (the world is always drawn dark, whatever the app theme). */
export const MAP_INK = {
  unclaimed: '#8A8F9C',
  locked: '#E6CF8A',
  fog: '#55585F',
};

export const colorOfCrew = (id: string | null | undefined) => (id ? CREW_BY_ID[id]?.color ?? MAP_INK.unclaimed : MAP_INK.unclaimed);

function territoryProps(t: Territory, found: boolean) {
  const s = t.state;
  const owner = s.ownerCrewId;
  return {
    id: t.id,
    name: t.name.toUpperCase(),
    tier: t.tier,
    split: t.split ? 1 : 0,
    parent: t.parentId ?? '',
    status: s.status,
    color: s.status === 'locked' ? MAP_INK.locked : colorOfCrew(owner),
    chal: s.challengerCrewId ? colorOfCrew(s.challengerCrewId) : '',
    crew: owner ? (CREW_BY_ID[owner]?.short ?? '') : '',
    control: s.control,
    level: t.level,
    activity: s.activity,
    users: s.activeUsers,
    disc: found ? 1 : 0,
    mine: owner === MY_CREW_ID ? 1 : 0,
    approx: t.accuracy === 'approximate' ? 1 : 0,
  };
}

/**
 * Territory polygons + label points. `detail` adds the L5 micro territories (sent lazily, once the
 * camera first gets close enough to need them).
 */
export function territoryFeatures(world: Territory[], discovered: Set<string>, detail: boolean) {
  const polys: Feature[] = [];
  const labels: Feature[] = [];
  for (const t of world) {
    if (t.tier === 5 && !detail) continue;
    const found = discovered.has(t.id);
    const p = territoryProps(t, found);
    polys.push({ type: 'Feature', id: t.id, geometry: { type: 'Polygon', coordinates: [t.ring] }, properties: p });
    labels.push({ type: 'Feature', id: t.id, geometry: { type: 'Point', coordinates: t.centroid }, properties: { ...p, sub: labelSub(t, found) } });
  }
  return { terr: fc(polys), labels: fc(labels) };
}

function labelSub(t: Territory, found: boolean): string {
  if (!found) return 'UNCHARTED';
  const s = t.state;
  if (s.status === 'locked') return 'LOCKED';
  if (!s.ownerCrewId) return 'UNCLAIMED';
  const crew = CREW_BY_ID[s.ownerCrewId]?.short ?? '';
  if (s.status === 'contested') return `${crew} ${s.control}% · CONTESTED`;
  if (s.status === 'under_attack') return `${crew} · UNDER ATTACK`;
  return `${crew} ${s.control}%`;
}

/** Ambient particles inside active, discovered territories — count follows activity. */
export function particleFeatures(world: Territory[], discovered: Set<string>): FeatureCollection {
  const out: Feature[] = [];
  for (const t of world) {
    if (!discovered.has(t.id) || t.split || t.state.activity < 0.25 || t.tier === 4 && t.areaKm2 > 25) continue;
    const r = rng(`p-${t.id}`);
    const n = Math.round(t.state.activity * (t.tier === 5 ? 5 : 9));
    const color = t.state.status === 'locked' ? MAP_INK.locked : colorOfCrew(t.state.ownerCrewId);
    for (const pt of scatter(t.ring, n, r)) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: { color, phase: Math.round(r() * 1000) / 1000, size: 0.7 + Math.round(r() * 60) / 100 } });
  }
  return fc(out);
}

const placeFeature = (p: Place): Feature => ({ type: 'Feature', id: p.id, geometry: { type: 'Point', coordinates: toLngLat(p.at) }, properties: { id: p.id, name: p.name, kind: p.kind, minZoom: p.minZoom, approx: p.accuracy === 'approximate' ? 1 : 0 } });

/** Universities + colleges (clustered at metro zoom) and every other kind of place (revealed by zoom). */
export function placeFeatures() {
  const campus = (p: Place) => p.kind === 'university' || p.kind === 'college';
  return { campuses: fc(PLACES.filter(campus).map(placeFeature)), places: fc(PLACES.filter((p) => !campus(p)).map(placeFeature)) };
}

export function cityFeatures(world: Territory[]): FeatureCollection {
  const counts = new Map<string, number>();
  for (const t of world) counts.set(t.region, (counts.get(t.region) ?? 0) + 1);
  const kolkataCount = (counts.get('KOLKATA') ?? 0) + (counts.get('SALT LAKE') ?? 0) + (counts.get('NEW TOWN') ?? 0) + (counts.get('HOWRAH') ?? 0);
  const active = world.reduce((s, t) => s + (t.tier === 4 && !t.split ? t.state.activeUsers : t.tier === 5 ? t.state.activeUsers : 0), 0);
  const cities = CITIES.map<Feature>((c) => ({
    type: 'Feature',
    id: c.id,
    geometry: { type: 'Point', coordinates: toLngLat(c.at) },
    properties: { id: c.id, name: c.name.toUpperCase(), rank: c.rank, kind: 'city', sub: c.id === 'kolkata' ? `${kolkataCount} TERRITORIES · ${active.toLocaleString('en-IN')} ACTIVE` : c.campus ? c.campus.toUpperCase() : '' },
  }));
  const regions = REGION_LABELS.map<Feature>((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: toLngLat(r.at) }, properties: { name: r.name.toUpperCase(), rank: 9, kind: r.kind, sub: '' } }));
  return fc([...cities, ...regions]);
}

export function corridorFeatures(): FeatureCollection {
  return fc(CORRIDORS.map((c) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c.path.map(toLngLat) }, properties: { name: c.name } })));
}

/** West Bengal outline, the dim mask outside it, neighbours and the Hooghly. */
export function geoFeatures(): FeatureCollection {
  const wb = bengal.westBengal as [number, number][][][];
  const outer: [number, number][] = [[80, 15], [96, 15], [96, 32], [80, 32], [80, 15]];
  const features: Feature[] = [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer, ...wb.map((poly) => [...poly[0]].reverse())] }, properties: { kind: 'mask' } },
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: wb }, properties: { kind: 'wb' } },
    ...bengal.neighbours.map<Feature>((n) => ({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: n.polygons as [number, number][][][] }, properties: { kind: 'neighbour', name: n.name.toUpperCase() } })),
    ...NEIGHBOUR_LABELS.map<Feature>(([name, lng, lat]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { kind: 'neighbour-label', name } })),
    { type: 'Feature', geometry: { type: 'LineString', coordinates: HOOGHLY.map(toLngLat) }, properties: { kind: 'river', name: 'HOOGHLY' } },
  ];
  return fc(features);
}

const NEIGHBOUR_LABELS: [string, number, number][] = [
  ['BANGLADESH', 90.15, 23.85], ['JHARKHAND', 85.75, 23.55], ['ODISHA', 86.45, 21.35], ['BIHAR', 86.6, 25.75],
  ['SIKKIM', 88.48, 27.55], ['NEPAL', 87.35, 27.05], ['BHUTAN', 90.1, 27.25], ['ASSAM', 90.9, 26.25],
];

/** Bounding box of a territory, for "fit" camera moves. */
export const boundsOf = (t: Territory) => t.bbox ?? bboxOf(t.ring);
