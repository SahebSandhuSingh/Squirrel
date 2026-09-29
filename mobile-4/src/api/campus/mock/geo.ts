/**
 * DEV MOCK ONLY — approximate IISER Kolkata (Mohanpur) zone outlines for local development.
 * These are hand-placed rectangles/ovals around the campus centre, NOT surveyed boundaries.
 * The real zone geometry comes from GET /v1/zones.
 */
import type { LatLng, MapFeatures, Poi, Zone, ZoneKind } from '@/api/campus/types';

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

// ---------------------------------------------------------------------------
// DEV MOCK base map: hand-drawn roads, paths, buildings and terrain around the zones.
// Stylised, not surveyed. The real ones come from GET /v1/map/features.
// ---------------------------------------------------------------------------


const ll = (pts: [number, number][]) => pts.map(([x, y]) => toLatLng(x, y));

export const MOCK_FEATURES: MapFeatures = {
  terrain: [
    { id: 't-central-green', kind: 'green', polygon: ll([[-150, -110], [-80, -140], [200, -140], [230, -40], [200, 10], [-150, 0]]) },
    { id: 't-hostel-green', kind: 'green', polygon: ll([[-100, 450], [420, 450], [420, 470], [-100, 470]]) },
    { id: 't-sports-field', kind: 'field', polygon: ll(Array.from({ length: 16 }, (_, i) => [-390 + Math.cos((i / 16) * Math.PI * 2) * 95, 70 + Math.sin((i / 16) * Math.PI * 2) * 58] as [number, number])) },
    { id: 't-lake', kind: 'water', polygon: ll([[395, -45], [455, -30], [495, -90], [465, -150], [400, -140], [372, -95]]) },
    { id: 't-west-woods', kind: 'green', polygon: ll([[-560, 250], [-280, 250], [-250, 460], [-560, 470]]) },
  ],
  roads: [
    { id: 'r-spine', kind: 'road', points: ll([[10, -360], [10, -150], [10, 190], [10, 480]]) },
    { id: 'r-ring', kind: 'road', points: ll([[-160, -150], [360, -150], [360, 185], [-160, 185], [-160, -150]]) },
    { id: 'r-hostels', kind: 'road', points: ll([[-160, 285], [420, 270]]) },
    { id: 'r-west', kind: 'road', points: ll([[-160, 70], [-265, 70]]) },
    { id: 'r-east', kind: 'road', points: ll([[360, -95], [370, -95]]) },
    { id: 'r-north-west', kind: 'road', points: ll([[-160, 185], [-160, 285], [-280, 330]]) },
    { id: 'p-lawn-1', kind: 'path', points: ll([[-60, -130], [140, -10]]) },
    { id: 'p-lawn-2', kind: 'path', points: ll([[150, -130], [-60, -10]]) },
    { id: 'p-lake-loop', kind: 'path', points: ll([[380, -30], [470, -10], [520, -90], [480, -170], [390, -160], [350, -95], [380, -30]]) },
    { id: 'p-mess', kind: 'path', points: ll([[140, 185], [140, 195]]) },
    { id: 'p-library', kind: 'path', points: ll([[280, 165], [280, 185]]) },
    { id: 'p-hostel-cut', kind: 'path', points: ll([[150, 270], [150, 300]]) },
  ],
  buildings: [
    ...[[95, 315, 145, 360], [160, 315, 205, 360], [95, 370, 205, 405]],
    ...[[260, 295, 310, 340], [320, 295, 370, 340], [260, 350, 370, 385]],
    ...[[-65, 335, -15, 380], [0, 335, 40, 380], [-65, 390, 40, 425]],
    [85, 205, 195, 260],
    [85, 55, 180, 135],
    [240, 70, 320, 150],
    [-115, 35, 20, 130],
    [-40, -110, 120, -60],
    [-5, -290, 25, -270],
    [400, 40, 470, 120],
    [-460, 300, -400, 350],
    [-380, 300, -320, 350],
    [-470, 380, -340, 420],
  ].map((b, i) => ({ id: `b-${i}`, polygon: ll([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) })),
  pois: [
    { id: 'poi-mess', name: 'Mess', kind: 'food', position: toLatLng(140, 232), zone_id: 'mess', description: 'Breakfast 7:30–9:30. The post-run chai spot.' },
    { id: 'poi-canteen', name: 'CC Canteen', kind: 'food', position: toLatLng(205, 95), zone_id: null, description: 'Maggi, cold coffee, gossip.' },
    { id: 'poi-track', name: 'Running Track', kind: 'sports', position: toLatLng(-390, 70), zone_id: 'sports', description: '400 m loop. Busiest at 6 AM and 6 PM.' },
    { id: 'poi-reading', name: 'Reading Room', kind: 'study', position: toLatLng(280, 110), zone_id: 'library', description: 'Open till midnight during exams.' },
    { id: 'poi-chai', name: 'Gate Chai Tapri', kind: 'hangout', position: toLatLng(55, -210), zone_id: null, description: 'Where every late-night walk ends.' },
    { id: 'poi-gate', name: 'Main Gate', kind: 'gate', position: toLatLng(10, -320), zone_id: 'gate', description: 'Start line for the Saturday Sprint.' },
    { id: 'poi-amphi', name: 'Amphitheatre', kind: 'hangout', position: toLatLng(-150, 160), zone_id: null, description: 'Open mics on Fridays.' },
  ] satisfies Poi[],
};
