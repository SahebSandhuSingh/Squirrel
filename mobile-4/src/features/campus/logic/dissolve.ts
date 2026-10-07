/**
 * Merge polygons that share edges (cells of one zone, zones of one crew) into outlines, and find
 * which polygons touch. Works because every cell comes from the same Voronoi clip of the same
 * campus outline: two neighbours share an edge with the same two end points (to float noise,
 * which the snapping absorbs). An edge that appears in both directions is interior; what is
 * left chains into the outline. Counter-clockwise results are outer rings, clockwise are holes.
 */
import { signedArea, type XY } from '../../world/logic/geometry.ts';

const SNAP = 100; // 1 cm in a metre plane
const key = (p: XY) => `${Math.round(p[0] * SNAP)},${Math.round(p[1] * SNAP)}`;

type Edge = { a: XY; b: XY; ka: string; kb: string; owner: number };

function edgesOf(ring: XY[], owner: number): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) out.push({ a, b, ka, kb, owner });
  }
  return out;
}

const ccw = (r: XY[]) => (signedArea(r) >= 0 ? r : r.slice().reverse());

/**
 * Outline of the union of `rings` (each a simple polygon, any orientation, open). Returns outer
 * rings (CCW) each with its holes (CW), or null if the edges didn't close up — the caller then
 * falls back to drawing the pieces separately.
 */
export function dissolve(rings: XY[][]): { outer: XY[]; holes: XY[][] }[] | null {
  const all = rings.flatMap((r, i) => edgesOf(ccw(r), i));
  const count = new Map<string, number>();
  for (const e of all) count.set(`${e.ka}>${e.kb}`, (count.get(`${e.ka}>${e.kb}`) ?? 0) + 1);
  const boundary = all.filter((e) => !count.has(`${e.kb}>${e.ka}`));
  const from = new Map<string, Edge[]>();
  for (const e of boundary) from.set(e.ka, [...(from.get(e.ka) ?? []), e]);

  const loops: XY[][] = [];
  const used = new Set<Edge>();
  for (const start of boundary) {
    if (used.has(start)) continue;
    const loop: XY[] = [];
    let e: Edge | undefined = start;
    let guard = 0;
    while (e && !used.has(e) && guard++ < 100_000) {
      used.add(e);
      loop.push(e.a);
      if (e.kb === start.ka) break;
      e = (from.get(e.kb) ?? []).find((n) => !used.has(n));
    }
    if (!e || e.kb !== start.ka) return null;
    if (loop.length >= 3) loops.push(simplifyCollinear(loop));
  }
  const outers = loops.filter((l) => signedArea(l) > 0).map((outer) => ({ outer, holes: [] as XY[][] }));
  if (!outers.length) return null;
  for (const h of loops.filter((l) => signedArea(l) < 0)) {
    const host = outers.find((o) => pointIn(h[0], o.outer)) ?? outers[0];
    host.holes.push(h);
  }
  return outers;
}

/** Pairs of polygons that share at least `minShared` metres of edge, with the shared length. */
export function adjacency(rings: XY[][], minShared = 4): Map<string, number> {
  const all = rings.flatMap((r, i) => edgesOf(ccw(r), i));
  const byKey = new Map<string, Edge>();
  for (const e of all) byKey.set(`${e.ka}>${e.kb}`, e);
  const shared = new Map<string, number>();
  for (const e of all) {
    const twin = byKey.get(`${e.kb}>${e.ka}`);
    if (!twin || twin.owner === e.owner || e.owner > twin.owner) continue;
    const k = `${e.owner}|${twin.owner}`;
    shared.set(k, (shared.get(k) ?? 0) + Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]));
  }
  for (const [k, v] of shared) if (v < minShared) shared.delete(k);
  return shared;
}

function simplifyCollinear(loop: XY[]): XY[] {
  const out: XY[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n];
    const b = loop[i];
    const c = loop[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-3) out.push(b);
  }
  return out.length >= 3 ? out : loop;
}

function pointIn(pt: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
