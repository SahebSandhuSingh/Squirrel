/**
 * Zones + crews → what the map engine draws. This is the only place gameplay state turns into
 * colours and shapes, and it reads everything from the data (owner, status, strength, battle),
 * so the engine itself knows nothing about who holds what.
 *
 *   zones     one polygon per zone with its colours and state
 *   regions   each crew's neighbouring zones merged into one outline (its "empire")
 *   links     the crew network: lines between a crew's zones that touch or sit close together
 *   vectors   attack lines: from the attackers' nearest zone to the zone they're fighting for
 *   nodes     one point per zone (its landmark), for the node icon, XP and activity rings
 */
import { closedCCW, metres, plane } from '../../world/logic/geometry.ts';
import { dissolve } from '../logic/dissolve.ts';
import { holdLevel } from '../logic/rules.ts';
import { NEUTRAL, PROTECTED } from '../data/crews.ts';
import type { CampusGeography } from '../data/geography.ts';
import type { Crew, LngLat, Zone } from '../types.ts';

export type Feature = { type: 'Feature'; id?: number; geometry: { type: string; coordinates: unknown }; properties: Record<string, string | number | null> };
export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };
const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

/** Crews whose zones are this close (centre to centre) are linked even if they don't touch. */
export const LINK_M = 260;

export type CampusLayers = { zones: FeatureCollection; nodes: FeatureCollection; links: FeatureCollection; regions: FeatureCollection; vectors: FeatureCollection };

export function campusLayers(zones: Zone[], crews: Crew[], geo: CampusGeography, myCrewId: string | null): CampusLayers {
  const color = (id: string | null) => crews.find((c) => c.id === id)?.color ?? NEUTRAL;
  const crewShort = (id: string | null) => crews.find((c) => c.id === id)?.short ?? '';
  const zoneFeatures: Feature[] = [];
  const nodeFeatures: Feature[] = [];
  zones.forEach((z, i) => {
    const locked = z.status === 'locked';
    const ch = z.challenge;
    const props = {
      id: z.id,
      name: z.geometry.short.toUpperCase(),
      full: z.name,
      type: z.type,
      status: z.status,
      owner: z.ownerCrewId,
      ownerName: crewShort(z.ownerCrewId),
      color: locked ? PROTECTED : color(z.ownerCrewId),
      chal: ch ? color(ch.attackerCrewId) : null,
      chalName: ch ? crewShort(ch.attackerCrewId) : null,
      progress: ch ? ch.progress : 0,
      strength: z.defenseStrength,
      level: holdLevel(z),
      xp: z.xpValue,
      users: z.activeUsers,
      activity: z.activityLevel,
      mine: myCrewId && z.ownerCrewId === myCrewId ? 1 : 0,
      attacking: myCrewId && ch?.attackerCrewId === myCrewId ? 1 : 0,
      radius: z.geometry.radiusM,
    };
    zoneFeatures.push({ type: 'Feature', id: i, geometry: { type: 'Polygon', coordinates: z.geometry.polygon }, properties: props });
    nodeFeatures.push({ type: 'Feature', id: i, geometry: { type: 'Point', coordinates: z.center }, properties: props });
  });

  // Regions: merge each crew's touching zones.
  const P = plane(geo.center);
  const regionFeatures: Feature[] = [];
  const linkFeatures: Feature[] = [];
  for (const crew of crews) {
    const own = zones.filter((z) => z.ownerCrewId === crew.id && z.status !== 'locked');
    if (!own.length) continue;
    const parts = dissolve(own.map((z) => z.geometry.polygon[0].slice(0, -1).map(P.to)));
    if (parts) {
      for (const p of parts) {
        const ring = closedCCW(p.outer.map(P.from));
        regionFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring, ...p.holes.map((h) => closedCCW(h.map(P.from)).reverse())] }, properties: { crew: crew.id, color: crew.color, mine: crew.id === myCrewId ? 1 : 0, zones: own.length } });
      }
    }
    for (let a = 0; a < own.length; a++) {
      for (let b = a + 1; b < own.length; b++) {
        const za = own[a];
        const zb = own[b];
        const touching = geo.neighbours.has([za.id, zb.id].sort().join('|'));
        const d = metres(za.center, zb.center);
        if (!touching && d > LINK_M) continue;
        linkFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [za.center, zb.center] }, properties: { crew: crew.id, color: crew.color, mine: crew.id === myCrewId ? 1 : 0, len: Math.round(d), from: za.id, to: zb.id } });
      }
    }
  }

  // Attack vectors: from the attacking crew's closest zone (or the campus edge nearest, if they hold none).
  const vectorFeatures: Feature[] = [];
  for (const z of zones) {
    const ch = z.challenge;
    if (!ch) continue;
    const base = zones
      .filter((o) => o.ownerCrewId === ch.attackerCrewId && o.id !== z.id)
      .sort((a, b) => metres(a.center, z.center) - metres(b.center, z.center))[0];
    if (!base) continue;
    vectorFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arc(base.center, z.center) }, properties: { zone: z.id, color: color(ch.attackerCrewId), mine: ch.attackerCrewId === myCrewId ? 1 : 0, progress: ch.progress } });
  }

  return { zones: fc(zoneFeatures), nodes: fc(nodeFeatures), links: fc(linkFeatures), regions: fc(regionFeatures), vectors: fc(vectorFeatures) };
}

/** A gentle arc between two points (a straight line reads as a road). */
function arc(a: LngLat, b: LngLat, n = 16): LngLat[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = mx - dy * 0.18;
  const cy = my + dx * 0.18;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [+(u * u * a[0] + 2 * u * t * cx + t * t * b[0]).toFixed(6), +(u * u * a[1] + 2 * u * t * cy + t * t * b[1]).toFixed(6)] as LngLat;
  });
}

/** The campus itself, for the engine's own geography layers (OpenStreetMap). */
export function campusBase(osm: { boundary: [number, number][]; features: { buildings: { id: string; polygon: [number, number][]; kind: string; levels: number | null; label: string | null }[]; terrain: { id: string; kind: string; polygon: [number, number][]; label?: string | null }[]; roads: { id: string; kind: string; points: [number, number][] }[] } }): FeatureCollection {
  const ll = (p: [number, number]): LngLat => [p[1], p[0]];
  const ring = (pts: [number, number][]) => {
    const r = pts.map(ll);
    const f = r[0];
    const l = r[r.length - 1];
    return f[0] === l[0] && f[1] === l[1] ? r : [...r, f];
  };
  const out: Feature[] = [];
  const boundary = ring(osm.boundary);
  out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [boundary] }, properties: { kind: 'campus' } });
  // Everything outside the campus, dimmed: a world-sized box with the campus cut out.
  out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[87.5, 22], [89.5, 22], [89.5, 24], [87.5, 24], [87.5, 22]], boundary.slice().reverse()] }, properties: { kind: 'mask' } });
  for (const t of osm.features.terrain) out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(t.polygon)] }, properties: { kind: t.kind, label: t.label ?? null } });
  for (const r of osm.features.roads) out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.points.map(ll) }, properties: { kind: r.kind } });
  for (const b of osm.features.buildings) out.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(b.polygon)] }, properties: { kind: 'building', use: b.kind, height: Math.max(1, b.levels ?? 2) * 3.4, label: b.label } });
  return fc(out);
}
