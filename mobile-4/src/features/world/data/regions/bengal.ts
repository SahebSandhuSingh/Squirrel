/**
 * WEST BENGAL — the top of the hierarchy. Cities give the state-level view its geography; campus
 * OUTPOSTS are single territories far from Kolkata (IIT Kharagpur, Visva-Bharati…), shown as
 * rough discs around the campus until surveyed outlines exist.
 */
import type { City, LatLng, RegionSpec } from '../../types.ts';

export const CITIES: City[] = [
  { id: 'kolkata', name: 'Kolkata', at: [22.5726, 88.3639], rank: 1, note: 'Capital · the main playable city' },
  { id: 'howrah', name: 'Howrah', at: [22.5900, 88.3100], rank: 2 },
  { id: 'kalyani', name: 'Kalyani', at: [22.9751, 88.4345], rank: 2, campus: 'University of Kalyani · AIIMS · IISER Kolkata' },
  { id: 'kharagpur', name: 'Kharagpur', at: [22.3460, 87.2320], rank: 2, campus: 'IIT Kharagpur' },
  { id: 'durgapur', name: 'Durgapur', at: [23.5204, 87.3119], rank: 2, campus: 'NIT Durgapur' },
  { id: 'asansol', name: 'Asansol', at: [23.6739, 86.9524], rank: 2 },
  { id: 'bardhaman', name: 'Bardhaman', at: [23.2324, 87.8615], rank: 2, campus: 'University of Burdwan' },
  { id: 'siliguri', name: 'Siliguri', at: [26.7271, 88.3953], rank: 2, campus: 'University of North Bengal' },
  { id: 'darjeeling', name: 'Darjeeling', at: [27.0410, 88.2663], rank: 3 },
  { id: 'shantiniketan', name: 'Santiniketan', at: [23.6797, 87.6853], rank: 3, campus: 'Visva-Bharati' },
  { id: 'krishnanagar', name: 'Krishnanagar', at: [23.4058, 88.4904], rank: 3 },
  { id: 'barrackpore', name: 'Barrackpore', at: [22.7600, 88.3700], rank: 3 },
  { id: 'haldia', name: 'Haldia', at: [22.0667, 88.0698], rank: 3 },
  { id: 'digha', name: 'Digha', at: [21.6266, 87.5074], rank: 3 },
  { id: 'diamond-harbour', name: 'Diamond Harbour', at: [22.1910, 88.1900], rank: 3 },
  { id: 'malda', name: 'Malda', at: [25.0108, 88.1411], rank: 3 },
  { id: 'berhampore', name: 'Berhampore', at: [24.0983, 88.2675], rank: 3 },
  { id: 'bankura', name: 'Bankura', at: [23.2324, 87.0753], rank: 3 },
  { id: 'purulia', name: 'Purulia', at: [23.3322, 86.3616], rank: 3 },
  { id: 'jalpaiguri', name: 'Jalpaiguri', at: [26.5167, 88.7167], rank: 3 },
  { id: 'cooch-behar', name: 'Cooch Behar', at: [26.3452, 89.4482], rank: 3 },
];

/** Geographic labels at the state view (not tappable). */
export const REGION_LABELS: { id: string; name: string; at: LatLng; kind: 'sea' | 'region' }[] = [
  { id: 'bay-of-bengal', name: 'Bay of Bengal', at: [21.15, 88.45], kind: 'sea' },
  { id: 'sundarbans', name: 'Sundarbans', at: [21.95, 88.85], kind: 'region' },
  { id: 'himalaya', name: 'Eastern Himalaya', at: [27.08, 88.75], kind: 'region' },
];

/** A rough disc (16 points, gently irregular) around a campus centre, `r` metres across. */
export function disc(center: LatLng, r: number, wobble = 0.12): LatLng[] {
  const out: LatLng[] = [];
  const kx = 111_320 * Math.cos((center[0] * Math.PI) / 180);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(a * 3 + center[1]) * Math.cos(a * 2 + center[0]));
    out.push([center[0] + (Math.sin(a) * rr) / 111_320, center[1] + (Math.cos(a) * rr) / kx]);
  }
  return out;
}

const outpost = (id: string, name: string, at: LatLng, r: number, blurb: string): RegionSpec => ({
  id: `outpost-${id}`,
  name,
  district: 'OUTPOST',
  accuracy: 'approximate',
  outline: disc(at, r),
  seeds: [{ id, name, at, tags: ['campus', 'student', 'outpost'], blurb }],
});

export const OUTPOSTS: RegionSpec[] = [
  outpost('op-iit-kharagpur', 'IIT Kharagpur', [22.3149, 87.3105], 1700, 'The first IIT. 2,100 acres of loops — the biggest outpost in Bengal.'),
  outpost('op-visva-bharati', 'Visva-Bharati', [23.6790, 87.6850], 1200, 'Tagore’s open-air university at Santiniketan.'),
  outpost('op-nit-durgapur', 'NIT Durgapur', [23.5480, 87.2920], 1000, 'The steel city’s engineering campus.'),
  outpost('op-burdwan-university', 'University of Burdwan', [23.2530, 87.8470], 900, 'Golapbag campus, Bardhaman.'),
  outpost('op-north-bengal-university', 'North Bengal University', [26.7090, 88.3540], 1100, 'Raja Rammohunpur, at the foot of the hills.'),
];
