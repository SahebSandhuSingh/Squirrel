/**
 * DEV SEED — IISER Kolkata (Mohanpur) zones.
 *
 * ⚠️  GEOMETRY IS A DEVELOPMENT PLACEHOLDER. These outlines are hand-placed rectangles / ovals
 * expressed in metres from the campus centre, using the SAME convention as the mobile dev mock
 * (mobile/src/api/campus/mock/geo.ts) so the app and backend agree in development.
 * They are NOT surveyed boundaries. Every zone is stored with geometry_source = 'dev_placeholder'
 * and must be replaced with authoritative polygons before launch — see docs/GEOGRAPHIC_DATA_REQUIRED.md.
 */
import { config } from '../config.js';

type XY = [number, number];
export type ZoneSeed = {
  id: string; name: string; short: string | null; description: string; kind: 'hostel' | 'academic' | 'sports' | 'food' | 'library' | 'landmark';
  zoneType: 'AREA' | 'ROUTE'; hostel: string | null; xy: XY[]; routeXy?: XY[]; threshold?: number;
};

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = () => 111_320 * Math.cos((config.campus.centerLat * Math.PI) / 180);
/** Local metres (x east, y north) → [lng, lat] for WKT. */
export const toLngLat = ([x, y]: XY): [number, number] => [config.campus.centerLng + x / mPerDegLng(), config.campus.centerLat + y / M_PER_DEG_LAT];

const rect = (x0: number, y0: number, x1: number, y1: number): XY[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const oval = (cx: number, cy: number, rx: number, ry: number, n = 16): XY[] => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as XY; });

export const HOSTELS = [
  { id: 'narmada', name: 'Narmada Hostel', short: 'Narmada' },
  { id: 'tapti', name: 'Tapti Hostel', short: 'Tapti' },
  { id: 'godavari', name: 'Godavari Hostel', short: 'Godavari' },
  { id: 'kaveri', name: 'Kaveri Hostel', short: 'Kaveri' },
  { id: 'ganga', name: 'Ganga Hostel', short: 'Ganga' },
];

export const ZONES: ZoneSeed[] = [
  // Same ids/placement as the mobile dev mock
  { id: 'narmada', name: 'Narmada Hostel', short: 'Narmada', kind: 'hostel', zoneType: 'AREA', hostel: 'narmada', xy: rect(80, 300, 220, 420), description: 'Narmada hostel block and courtyard.' },
  { id: 'tapti', name: 'Tapti Hostel', short: 'Tapti', kind: 'hostel', zoneType: 'AREA', hostel: 'tapti', xy: rect(245, 280, 385, 400), description: 'Tapti hostel block and courtyard.' },
  { id: 'godavari', name: 'Godavari Hostel', short: 'Godavari', kind: 'hostel', zoneType: 'AREA', hostel: 'godavari', xy: rect(-80, 320, 50, 440), description: 'Godavari hostel block and courtyard.' },
  { id: 'mess', name: 'Mess', short: null, kind: 'food', zoneType: 'AREA', hostel: null, xy: rect(70, 195, 210, 270), description: 'Central mess and the post-run chai spot.' },
  { id: 'cc1', name: 'CC1', short: null, kind: 'academic', zoneType: 'AREA', hostel: null, xy: rect(70, 40, 195, 150), description: 'Classroom Complex 1.' },
  { id: 'library', name: 'Library', short: null, kind: 'library', zoneType: 'AREA', hostel: null, xy: rect(225, 55, 335, 165), description: 'Central library and reading room.' },
  { id: 'lhc', name: 'Lecture Hall Complex', short: 'LHC', kind: 'academic', zoneType: 'AREA', hostel: null, xy: rect(-130, 20, 35, 145), description: 'Lecture Hall Complex.' },
  { id: 'sports', name: 'Sports Ground Loop', short: 'Sports Loop', kind: 'sports', zoneType: 'ROUTE', hostel: null, xy: oval(-390, 70, 135, 95), routeXy: oval(-390, 70, 120, 80, 24), threshold: 0.8, description: 'The 400 m track around the sports ground. Complete the loop to qualify.' },
  { id: 'admin', name: 'Admin Lawn', short: 'Admin', kind: 'landmark', zoneType: 'AREA', hostel: null, xy: rect(-70, -125, 150, -25), description: 'Lawn in front of the administrative building.' },
  { id: 'gate', name: 'Main Gate Boulevard', short: 'Main Gate', kind: 'landmark', zoneType: 'AREA', hostel: null, xy: rect(-25, -330, 45, -150), description: 'The boulevard from the main gate.' },
  { id: 'lake', name: 'Lake Walk', short: null, kind: 'landmark', zoneType: 'ROUTE', hostel: null, xy: [[350, -20], [480, 0], [540, -90], [495, -185], [385, -175], [335, -100]], routeXy: [[380, -30], [470, -10], [520, -90], [480, -170], [390, -160], [350, -95], [380, -30]], threshold: 0.75, description: 'The path around the campus lake. Walk the loop to qualify.' },
  // Additional zones so development has ~15
  { id: 'kaveri', name: 'Kaveri Hostel', short: 'Kaveri', kind: 'hostel', zoneType: 'AREA', hostel: 'kaveri', xy: rect(420, 300, 560, 420), description: 'Kaveri hostel block.' },
  { id: 'ganga', name: 'Ganga Hostel', short: 'Ganga', kind: 'hostel', zoneType: 'AREA', hostel: 'ganga', xy: rect(-240, 320, -110, 440), description: 'Ganga hostel block.' },
  { id: 'research', name: 'Research Complex', short: 'Research', kind: 'academic', zoneType: 'AREA', hostel: null, xy: rect(380, 30, 520, 150), description: 'Research and laboratory complex.' },
  { id: 'amphi', name: 'Amphitheatre', short: 'Amphi', kind: 'landmark', zoneType: 'AREA', hostel: null, xy: oval(-150, 165, 55, 45), threshold: 0.5, description: 'Open-air amphitheatre.' },
  { id: 'health', name: 'Health Centre', short: 'Health', kind: 'landmark', zoneType: 'AREA', hostel: null, xy: rect(-470, 290, -330, 360), description: 'Campus health centre.' },
];

export const polygonWkt = (xy: XY[]) => { const ring = [...xy, xy[0]!].map(toLngLat).map(([lng, lat]) => `${lng} ${lat}`).join(','); return `POLYGON((${ring}))`; };
export const lineWkt = (xy: XY[]) => `LINESTRING(${xy.map(toLngLat).map(([lng, lat]) => `${lng} ${lat}`).join(',')})`;
