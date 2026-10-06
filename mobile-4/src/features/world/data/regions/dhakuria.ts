/**
 * DHAKURIA and JADAVPUR — south Kolkata's student belt: Jadavpur University, the 8B bus stand and
 * the Rabindra Sarobar lakes, the city's favourite running loop. Positions are approximate.
 */
import type { Seed } from '../../types.ts';

export const DHAKURIA_TERRITORIES: Seed[] = [
  { id: 'dh-rabindra-sarobar', name: 'Rabindra Sarobar', at: [22.5115, 88.3620], tags: ['water', 'park', 'hotspot'], blurb: 'The Dhakuria lakes. Dawn runners, rowing clubs, crew laps.' },
  { id: 'dh-dhakuria-bridge', name: 'Dhakuria Bridge', at: [22.5085, 88.3700], tags: ['transit'], blurb: 'Where the south side crosses the tracks.' },
  { id: 'dh-dakshinapan', name: 'Dakshinapan', at: [22.5040, 88.3650], tags: ['market', 'student'], blurb: 'Handloom stalls and after-class snacks.' },
  { id: 'dh-lake-gardens', name: 'Lake Gardens', at: [22.5050, 88.3560], tags: ['park'], blurb: 'Quiet lanes off the lake — good for tempo runs.' },
];

export const JADAVPUR_TERRITORIES: Seed[] = [
  { id: 'jp-jadavpur-university', name: 'Jadavpur University', at: [22.4988, 88.3715], tags: ['campus', 'student'], blurb: 'JU main campus. Fests, protests, and the fastest crews in the south.' },
  { id: 'jp-8b-bus-stand', name: '8B Bus Stand', at: [22.4960, 88.3690], tags: ['hotspot', 'student', 'transit'], blurb: 'Every JU story starts at 8B.' },
  { id: 'jp-jadavpur-station', name: 'Jadavpur Station', at: [22.4995, 88.3790], tags: ['transit'], blurb: 'Sealdah South line — the commuter gate to campus.' },
  { id: 'jp-sulekha-more', name: 'Sulekha More', at: [22.4880, 88.3760], tags: ['market'], blurb: 'The junction south of campus.' },
  { id: 'jp-bijoygarh', name: 'Bijoygarh', at: [22.4910, 88.3640], tags: ['student'], blurb: 'Student digs and early-morning football.' },
];
