/**
 * Geography that isn't a territory: the Hooghly (drawn at state / metro zoom, where the vector
 * tiles' river is too thin to read), activity corridors, and names whose location is uncertain.
 */
import type { Corridor, LatLng, UnresolvedPlace } from '../types.ts';
import { disc } from './regions/bengal.ts';

/**
 * The Hooghly (Bhagirathi–Hooghly), Katwa → Kolkata → Sagar Island. Hand-traced centreline,
 * accurate to a few hundred metres — at street zoom the tiles' own water takes over.
 */
export const HOOGHLY: LatLng[] = [
  [23.6400, 88.1300], [23.5000, 88.3000], [23.4000, 88.3700], [23.2500, 88.4100], [23.1500, 88.4300],
  [23.0500, 88.4100], [22.9800, 88.4100], [22.9500, 88.4050], [22.9000, 88.3950], [22.8700, 88.3800],
  [22.8100, 88.3650], [22.7600, 88.3560], [22.7100, 88.3620], [22.6800, 88.3580], [22.6550, 88.3535],
  [22.6300, 88.3555], [22.6000, 88.3520], [22.5860, 88.3475], [22.5720, 88.3405], [22.5610, 88.3320],
  [22.5520, 88.3210], [22.5480, 88.3075], [22.5455, 88.2930], [22.5400, 88.2780], [22.5250, 88.2550],
  [22.5050, 88.2200], [22.4800, 88.1800], [22.4700, 88.1300], [22.4400, 88.1000], [22.3600, 88.1150],
  [22.2700, 88.1600], [22.1900, 88.1850], [22.1000, 88.1500], [22.0300, 88.0900], [21.9000, 88.0600],
  [21.7500, 88.0600],
];

/** Loops and walks the network's activity flows along (drawn as slow-moving dashes). */
export const CORRIDORS: Corridor[] = [
  { id: 'cor-rabindra-sarobar', name: 'Rabindra Sarobar loop', path: closed(disc([22.5115, 88.3625], 420, 0.18)), accuracy: 'approximate' },
  { id: 'cor-central-park', name: 'Central Park loop', path: closed(disc([22.5830, 88.4172], 260, 0.1)), accuracy: 'approximate' },
  { id: 'cor-eco-park', name: 'Eco Park ring', path: closed(disc([22.6025, 88.4690], 620, 0.15)), accuracy: 'approximate' },
  { id: 'cor-college-street', name: 'College Street walk', path: [[22.5815, 88.3631], [22.5790, 88.3632], [22.5755, 88.3634], [22.5722, 88.3636], [22.5695, 88.3640]], accuracy: 'approximate' },
  { id: 'cor-maidan', name: 'Maidan run', path: [[22.5646, 88.3433], [22.5560, 88.3440], [22.5470, 88.3440], [22.5440, 88.3480], [22.5520, 88.3505], [22.5600, 88.3490], [22.5646, 88.3433]], accuracy: 'approximate' },
];

function closed(ring: LatLng[]): LatLng[] {
  return [...ring, ring[0]];
}

/**
 * Asked for, but not placed: each needs a confirmed location. Search lists them with their
 * candidates so nobody lands on an invented spot. Move one into PLACES (or a region) once confirmed.
 */
export const UNRESOLVED: UnresolvedPlace[] = [
  {
    id: 'u-shokpur',
    asked: 'Shokpur / Shokpore',
    reason: 'No campus or neighbourhood by this name could be confirmed in Bengal.',
    candidates: [
      { name: 'Sodepur (North 24 Parganas)', at: [22.6980, 88.3900], note: 'Similar spelling, on the Hooghly north of Kolkata.' },
      { name: 'Another “Shokpur”', at: null, note: 'Add its coordinates in data/context.ts.' },
    ],
  },
  {
    id: 'u-khorda',
    asked: 'Khorda',
    reason: 'Khordha is in Odisha, outside West Bengal. If Kharagpur was meant, IIT Kharagpur is on the map as an outpost.',
    candidates: [
      { name: 'Kharagpur · IIT Kharagpur', at: [22.3149, 87.3105], note: 'On the map (outpost).' },
      { name: 'Khordha, Odisha', at: null, note: 'Outside Bengal — not part of the network.' },
    ],
  },
  {
    id: 'u-muslim-university',
    asked: 'Muslim University reference area',
    reason: 'There is no “Muslim University” in Kolkata. Aliah University is the likely institution; both its campuses are on the map.',
    candidates: [
      { name: 'Aliah University · Park Circus', at: [22.5395, 88.3698], note: 'Approximate.' },
      { name: 'Aliah University · New Town', at: [22.5835, 88.4815], note: 'Approximate.' },
    ],
  },
  {
    id: 'u-makaut',
    asked: 'MAKAUT',
    reason: 'MAKAUT has a main campus at Haringhata (Nadia) and a city office in Salt Lake; neither position is confirmed yet.',
    candidates: [
      { name: 'MAKAUT · Haringhata campus', at: null, note: 'Add coordinates once confirmed.' },
      { name: 'MAKAUT · Salt Lake office (Sector I)', at: null, note: 'Add coordinates once confirmed.' },
    ],
  },
];
