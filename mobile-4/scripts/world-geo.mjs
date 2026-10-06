#!/usr/bin/env node
/**
 * Build the Territory Network's Bengal-level geography from Natural Earth (public domain).
 *
 *   npm pack apexmaps-geo@1.1.0 world-atlas@2.0.2      (anywhere; neither is an app dependency)
 *   node scripts/world-geo.mjs --admin1 <apexmaps-geo>/in-admin1-10m.json \
 *                              --countries <world-atlas>/countries-10m.json
 *
 * Writes src/features/world/data/geo/bengal.json:
 *   westBengal   the state outline (Natural Earth 5.1.1 admin-1, IN-WB)
 *   neighbours   the states and countries around it, for the dimmed context ring
 * Rings are simplified (Douglas–Peucker, ~250 m) and rounded to 4 decimals: the outline is drawn
 * at Bengal / metro zoom, where the street-level detail comes from the vector tiles instead.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.admin1 || !args.countries) {
  console.error('usage: node scripts/world-geo.mjs --admin1 in-admin1-10m.json --countries countries-10m.json');
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/features/world/data/geo/bengal.json');
const TOLERANCE = 0.0025; // degrees (West Bengal)
const CONTEXT_TOLERANCE = 0.008; // neighbours are a dim backdrop only
const STATES = { 'IN-JH': 'Jharkhand', 'IN-BR': 'Bihar', 'IN-OR': 'Odisha', 'IN-SK': 'Sikkim', 'IN-AS': 'Assam' };
const COUNTRIES = { 'Bangladesh': 'Bangladesh', 'Nepal': 'Nepal', 'Bhutan': 'Bhutan' };

/** TopoJSON → GeoJSON geometry (quantized arcs, delta-encoded). */
export function topology(path) {
  const topo = JSON.parse(readFileSync(path, 'utf8'));
  const t = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => (t ? [(x += dx) * t.scale[0] + t.translate[0], (y += dy) * t.scale[1] + t.translate[1]] : [dx, dy]));
  });
  const arc = (i) => (i >= 0 ? arcs[i] : [...arcs[~i]].reverse());
  const ring = (ix) => ix.reduce((pts, i) => pts.concat(pts.length ? arc(i).slice(1) : arc(i)), []);
  const polygons = (g) => (g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : []);
  return { topo, polygons };
}

/** Douglas–Peucker on one ring (keeps the closing point). */
export function simplify(points, tol) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay);
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      // A closed ring starts and ends on the same point: measure from that point instead.
      const d = len ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay);
      if (d > best) [best, at] = [d, i];
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (ring) => ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
const clean = (polys, tol = TOLERANCE) => polys.map((p) => p.map((r) => round(simplify(r, tol))).filter((r) => r.length >= 4)).filter((p) => p.length);
// Context only near Bengal: drop far-away islands / parts of the neighbours.
const near = (polys) => polys.filter((p) => p[0].some(([x, y]) => x > 84 && x < 92.5 && y > 20 && y < 28.5));

const admin = topology(args.admin1);
const states = admin.topo.objects.admin1.geometries;
const wb = states.find((g) => g.properties.iso_3166_2 === 'IN-WB');
if (!wb) throw new Error('West Bengal (IN-WB) is not in ' + args.admin1);

const world = topology(args.countries);
const countries = world.topo.objects.countries.geometries;

const out = {
  source: 'Natural Earth 5.1.1 (public domain): admin-1 states via apexmaps-geo 1.1.0, countries via world-atlas 2.0.2',
  westBengal: clean(admin.polygons(wb)),
  neighbours: [
    ...states.filter((g) => STATES[g.properties.iso_3166_2]).map((g) => ({ name: STATES[g.properties.iso_3166_2], kind: 'state', polygons: clean(near(admin.polygons(g)), CONTEXT_TOLERANCE) })),
    ...countries.filter((g) => COUNTRIES[g.properties.name]).map((g) => ({ name: COUNTRIES[g.properties.name], kind: 'country', polygons: clean(near(world.polygons(g)), CONTEXT_TOLERANCE) })),
  ].filter((n) => n.polygons.length),
};

writeFileSync(OUT, JSON.stringify(out) + '\n');
const count = (p) => p.reduce((s, poly) => s + poly.reduce((t, r) => t + r.length, 0), 0);
console.log(`wrote ${OUT}: West Bengal ${count(out.westBengal)} points; ${out.neighbours.map((n) => `${n.name} ${count(n.polygons)}`).join(', ')}`);
