/**
 * DEV MOCK ONLY — approximate IISER Kolkata (Mohanpur) zone outlines for local development.
 * These are hand-placed rectangles/ovals around the campus centre, NOT surveyed boundaries.
 * The real zone geometry comes from GET /v1/zones.
 */
import type { LatLng, Zone, ZoneKind } from '@/api/campus/types';

export const CAMPUS_CENTER: LatLng = [22.9637, 88.5245];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = 111_320 * Math.cos((CAMPUS_CENTER[0] * Math.PI) / 180);

/** Local metres (x east, y north) → [lat, lng]. */
export const toLatLng = (x: number, y: number): LatLng => [CAMPUS_CENTER[0] + y / M_PER_DEG_LAT, CAMPUS_CENTER[1] + x / M_PER_DEG_LNG];
/** [lat, lng] → local metres. */
export const toXY = ([lat, lng]: LatLng): [number, number] => [(lng - CAMPUS_CENTER[1]) * M_PER_DEG_LNG, (lat - CAMPUS_CENTER[0]) * M_PER_DEG_LAT];

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const oval = (cx: number, cy: number, rx: number, ry: number, n = 16): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
  });

type Def = { id: string; name: string; short: string | null; kind: ZoneKind; hostel: string | null; xy: [number, number][] };

const DEFS: Def[] = [
  { id: 'narmada', name: 'Narmada Hostel', short: 'Narmada', kind: 'hostel', hostel: 'Narmada', xy: rect(80, 300, 220, 420) },
  { id: 'tapti', name: 'Tapti Hostel', short: 'Tapti', kind: 'hostel', hostel: 'Tapti', xy: rect(245, 280, 385, 400) },
  { id: 'godavari', name: 'Godavari Hostel', short: 'Godavari', kind: 'hostel', hostel: 'Godavari', xy: rect(-80, 320, 50, 440) },
  { id: 'mess', name: 'Mess', short: null, kind: 'food', hostel: null, xy: rect(70, 195, 210, 270) },
  { id: 'cc1', name: 'CC1', short: null, kind: 'academic', hostel: null, xy: rect(70, 40, 195, 150) },
  { id: 'library', name: 'Library', short: null, kind: 'library', hostel: null, xy: rect(225, 55, 335, 165) },
  { id: 'lhc', name: 'Lecture Hall Complex', short: 'LHC', kind: 'academic', hostel: null, xy: rect(-130, 20, 35, 145) },
  { id: 'sports', name: 'Sports Ground Loop', short: 'Sports Loop', kind: 'sports', hostel: null, xy: oval(-390, 70, 120, 80) },
  { id: 'admin', name: 'Admin Lawn', short: 'Admin', kind: 'landmark', hostel: null, xy: rect(-70, -125, 150, -25) },
  { id: 'gate', name: 'Main Gate Boulevard', short: 'Main Gate', kind: 'landmark', hostel: null, xy: rect(-25, -330, 45, -150) },
  { id: 'lake', name: 'Lake Walk', short: null, kind: 'landmark', hostel: null, xy: [[380, -30], [470, -10], [520, -90], [480, -170], [390, -160], [350, -95]] },
];

const centroid = (xy: [number, number][]): [number, number] => [xy.reduce((s, p) => s + p[0], 0) / xy.length, xy.reduce((s, p) => s + p[1], 0) / xy.length];

export const MOCK_ZONES: Zone[] = DEFS.map((d) => {
  const [cx, cy] = centroid(d.xy);
  return { id: d.id, name: d.name, short_name: d.short, kind: d.kind, hostel: d.hostel, polygon: d.xy.map(([x, y]) => toLatLng(x, y)), centroid: toLatLng(cx, cy) };
});

/** Ray casting in local metres. */
export function pointInZone(p: LatLng, z: Zone): boolean {
  const [x, y] = toXY(p);
  const poly = z.polygon.map(toXY);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A demo route (web / no GPS): a loop that starts at the Main Gate, passes Admin Lawn and CC1,
 * laps the Sports Ground and comes back — so the dev flow has real zone interactions.
 */
export const DEMO_ROUTE_XY: [number, number][] = [
  [10, -240],
  [10, -160],
  [40, -80],
  [120, 20],
  [130, 90],
  [60, 110],
  [-60, 90],
  [-200, 70],
  [-270, 70],
  ...oval(-390, 70, 120, 80, 20),
  [-270, 70],
  [-200, 40],
  [-60, -40],
  [10, -160],
  [10, -240],
];
