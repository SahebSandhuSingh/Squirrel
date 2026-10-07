/**
 * Campus crews for the IISER Kolkata season. Four clearly different hues — lime, orange, cyan,
 * purple — so a glance tells you who holds what. They're only ever drawn at full strength on
 * territory edges and active states; fills stay translucent.
 *
 * The Night Owls are the same crew as on the Territory Network (and still your crew).
 */
import type { Crew } from '../types.ts';

export const CAMPUS_CREWS: Crew[] = [
  { id: 'night-owls', name: 'The Night Owls', short: 'OWLS', color: '#D7FF1F', memberCount: 48 },
  { id: 'ember-pack', name: 'Ember Pack', short: 'EMBER', color: '#FF8A3D', memberCount: 37 },
  { id: 'tidewater', name: 'Tidewater', short: 'TIDE', color: '#38D1E0', memberCount: 34 },
  { id: 'violet-hour', name: 'Violet Hour', short: 'VIOLET', color: '#A47CFF', memberCount: 29 },
];

/** Neutral ground, protected ground and the "nobody" colour. */
export const NEUTRAL = '#8A8F9C';
export const PROTECTED = '#E6CF8A';
