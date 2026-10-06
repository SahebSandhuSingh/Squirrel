/**
 * COLLEGE STREET — the densest student district in the network. The zone is split into micro
 * territories around the real institutions and the book market (Boi Para), so there is always
 * something to fight over within a few minutes' walk. Positions are approximate (± ~50 m).
 */
import type { Seed } from '../../types.ts';

export const COLLEGE_STREET_TERRITORIES: Seed[] = [
  { id: 'cs-presidency', name: 'Presidency', at: [22.5767, 88.3624], tags: ['campus', 'student', 'heritage'], blurb: 'Presidency University’s gates — debates spill onto the pavement.' },
  { id: 'cs-calcutta-university', name: 'Calcutta University', at: [22.5742, 88.3627], tags: ['campus', 'student', 'heritage'], blurb: 'The Asutosh Building and the oldest corridors in Indian academia.' },
  { id: 'cs-coffee-house', name: 'Coffee House', at: [22.5762, 88.3637], tags: ['hotspot', 'student'], blurb: 'Indian Coffee House. Infusion, arguments, crew meetups.' },
  { id: 'cs-college-square', name: 'College Square', at: [22.5752, 88.3650], tags: ['water', 'sports', 'student'], blurb: 'Goldighi — the swimming pool square and evening laps.' },
  { id: 'cs-boi-para-north', name: 'Boi Para North', at: [22.5790, 88.3632], tags: ['market', 'student'], blurb: 'The northern book stalls — rare editions and old maps.' },
  { id: 'cs-boi-para-south', name: 'Boi Para South', at: [22.5722, 88.3636], tags: ['market', 'student'], blurb: 'Second-hand textbooks by the kilo. Always crowded.' },
  { id: 'cs-medical-college', name: 'Medical College', at: [22.5733, 88.3606], tags: ['campus', 'student'], blurb: 'Medical College Kolkata — night shifts, night runs.' },
  { id: 'cs-hindu-hare', name: 'Hindu & Hare School', at: [22.5777, 88.3647], tags: ['campus', 'heritage'], blurb: 'Two of the city’s oldest schools, side by side.' },
];
