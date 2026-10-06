/**
 * Small, dependency-free planar geometry for the territory network. Territories are grown as
 * Voronoi cells around named seeds and clipped to their region's outline, so a region is split
 * into contiguous, non-overlapping territories whose shapes follow where places really are.
 *
 * Work happens in a local equirectangular plane in metres (accurate to well under 1 % across a
 * city), then goes back to [lng, lat].
 */
import type { LngLat, Ring } from '../types.ts';

export type XY = [number, number];

const M_PER_DEG = 111_320;

/** A local metric plane centred on `origin` ([lng, lat]). */
export function plane(origin: LngLat) {
  const kx = M_PER_DEG * Math.cos((origin[1] * Math.PI) / 180);
  return {
    to: (p: LngLat): XY => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * M_PER_DEG],
    from: (p: XY): LngLat => [round6(origin[0] + p[0] / kx), round6(origin[1] + p[1] / M_PER_DEG)],
  };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Signed area (shoelace); positive = counter-clockwise. Ring may or may not repeat its first point. */
export function signedArea(ring: XY[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function centroidXY(ring: XY[]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) return ring[0];
  return [cx / (3 * a), cy / (3 * a)];
}

/** Keep the part of `poly` on the side of the line where f(p) <= 0 (Sutherland–Hodgman, one edge). */
function clipHalfPlane(poly: XY[], f: (p: XY) => number): XY[] {
  const out: XY[] = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const fa = f(a);
    const fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Voronoi cell of `seeds[i]` inside the convex-or-not `outline`. The outline is clipped by the
 * bisector half-plane of every other seed; for a non-convex outline, clipping each half-plane
 * against the outline's own polygon is still exact because half-planes are convex.
 */
export function voronoiCells(outline: XY[], seeds: XY[]): XY[][] {
  return seeds.map((s, i) => {
    let cell = outline.slice();
    for (let j = 0; j < seeds.length && cell.length; j++) {
      if (j === i) continue;
      const o = seeds[j];
      const mx = (s[0] + o[0]) / 2;
      const my = (s[1] + o[1]) / 2;
      const dx = o[0] - s[0];
      const dy = o[1] - s[1];
      // Points closer to o than to s have (p - m)·(o - s) > 0; keep the rest.
      cell = clipHalfPlane(cell, (p) => (p[0] - mx) * dx + (p[1] - my) * dy);
    }
    return dedupe(cell);
  });
}

function dedupe(ring: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.01) out.pop();
  return out;
}

/** Ray casting. Works for any simple ring in any planar coordinates. */
export function inRing(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Closed (first point repeated), counter-clockwise ring in [lng, lat] — GeoJSON's exterior order. */
export function closedCCW(ring: Ring): Ring {
  const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
  const ccw = signedArea(open) >= 0 ? open : open.reverse();
  return [...ccw, ccw[0]];
}

export function bboxOf(ring: Ring): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Distance in metres between two [lng, lat] points (haversine). */
export function metres(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Deterministic PRNG (mulberry32) seeded from a string — the same territory always rolls the same. */
export function rng(key: string) {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` points spread inside a ring (rejection sampling in its bbox), for ambient particles. */
export function scatter(ring: Ring, count: number, rand: () => number): LngLat[] {
  const [w, s, e, n] = bboxOf(ring);
  const out: LngLat[] = [];
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const p: LngLat = [w + (e - w) * rand(), s + (n - s) * rand()];
    if (inRing(p, ring)) out.push([round6(p[0]), round6(p[1])]);
  }
  return out;
}
