/**
 * Grows the territory network from the authored regions: every region's seeds become Voronoi
 * cells clipped to the region outline (or authored zone outlines, for Salt Lake and New Town),
 * and zones with child seeds are split again into L5 micro territories inside their own cell.
 *
 * Pure and deterministic: the same data always produces the same territories, so ids, shapes and
 * the preview state derived from them are stable across launches.
 */
import type { LngLat, RegionSpec, Seed, Territory, TerritoryState } from '../types.ts';
import { toLngLat } from '../types.ts';
import { bboxOf, centroidXY, closedCCW, inRing, plane, signedArea, voronoiCells, type XY } from './geometry.ts';

export type TerritoryShape = Omit<Territory, 'state' | 'level'>;

export function buildTerritories(regions: RegionSpec[]): TerritoryShape[] {
  const out: TerritoryShape[] = [];
  for (const region of regions) {
    const outline = region.outline.map(toLngLat);
    const origin = centreOf(outline);
    const pl = plane(origin);
    const outlineXY = outline.map(pl.to);

    const zones: { seed: Seed; cell: XY[] }[] = region.zones
      ? region.zones.map((z) => ({ seed: z, cell: z.outline.map((p) => pl.to(toLngLat(p))) }))
      : voronoiCells(outlineXY, (region.seeds ?? []).map((s) => pl.to(toLngLat(s.at)))).map((cell, i) => ({ seed: region.seeds![i], cell }));

    for (const { seed, cell } of zones) {
      if (cell.length < 3) continue;
      const children = seed.children ?? [];
      out.push(shape(seed, cell, region, null, 4, children.length > 0, pl));
      if (!children.length) continue;
      const childCells = voronoiCells(cell, children.map((c) => pl.to(toLngLat(c.at))));
      childCells.forEach((cc, i) => {
        if (cc.length >= 3) out.push(shape(children[i], cc, region, seed.id, 5, false, pl));
      });
    }
  }
  return out;
}

function shape(seed: Seed, cell: XY[], region: RegionSpec, parentId: string | null, tier: 4 | 5, split: boolean, pl: ReturnType<typeof plane>): TerritoryShape {
  const ring = closedCCW(cell.map(pl.from));
  const c = centroidXY(cell);
  // Label at the cell's centre of mass when it lies inside; otherwise at the seed (always inside).
  const centroid: LngLat = inRing(c, cell) ? pl.from(c) : toLngLat(seed.at);
  return {
    id: seed.id,
    name: seed.name,
    region: region.district,
    parentId,
    tier,
    split,
    ring,
    centroid,
    bbox: bboxOf(ring),
    areaKm2: Math.round((Math.abs(signedArea(cell)) / 1e6) * 1000) / 1000,
    accuracy: region.accuracy,
    blurb: seed.blurb ?? null,
    tags: seed.tags ?? [],
  };
}

function centreOf(ring: LngLat[]): LngLat {
  const [w, s, e, n] = bboxOf(ring);
  return [(w + e) / 2, (s + n) / 2];
}

// ---------------------------------------------------------------------------
// Progression rules (shared by the preview source and the HUD)
// ---------------------------------------------------------------------------

/** XP needed to reach each territory level (L1 starts at 0). */
export const LEVEL_XP: readonly number[] = [0, 1500, 4000, 8000, 15000];

export function levelFromXp(xp: number): Territory['level'] {
  let l = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i + 1;
  return l as Territory['level'];
}

/** Progress (0..1) towards the next level; 1 at max level. */
export function levelProgress(xp: number): number {
  const l = levelFromXp(xp);
  if (l >= LEVEL_XP.length) return 1;
  const lo = LEVEL_XP[l - 1];
  const hi = LEVEL_XP[l];
  return Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

export function defenceRating(defence: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'FORTIFIED' {
  return defence >= 85 ? 'FORTIFIED' : defence >= 60 ? 'HIGH' : defence >= 35 ? 'MEDIUM' : 'LOW';
}

export function withState(shape: TerritoryShape, state: TerritoryState): Territory {
  return { ...shape, state, level: levelFromXp(state.xp) };
}
