/**
 * KALYANI — MOHANPUR — the northern campus belt, ~50 km up the Hooghly: University of Kalyani,
 * AIIMS Kalyani, BCKV and IISER Kolkata (Squirrel Social's launch campus). Approximate outlines;
 * AIIMS Kalyani's and BCKV's positions are approximate and easy to correct here.
 */
import type { RegionSpec } from '../../types.ts';

export const KALYANI: RegionSpec = {
  id: 'kalyani',
  name: 'Kalyani · Mohanpur',
  district: 'KALYANI',
  accuracy: 'approximate',
  outline: [[23.0050, 88.4250], [23.0050, 88.4700], [22.9850, 88.5450], [22.9400, 88.5450], [22.9300, 88.5000], [22.9450, 88.4500], [22.9650, 88.4250]],
  seeds: [
    { id: 'kl-kalyani-university', name: 'Kalyani University', at: [22.9890, 88.4450], tags: ['campus', 'student'], blurb: 'University of Kalyani — the green campus on the northern edge.' },
    { id: 'kl-kalyani-town', name: 'Kalyani Town', at: [22.9730, 88.4350], tags: ['market', 'student'], blurb: 'The planned town’s blocks, lakes and student messes.' },
    { id: 'kl-aiims-kalyani', name: 'AIIMS Kalyani', at: [22.9560, 88.4900], tags: ['campus', 'student'], blurb: 'AIIMS Kalyani — medics on the night shift, crews at dawn.' },
    { id: 'kl-iiser-kolkata', name: 'IISER Kolkata', at: [22.9632, 88.5245], tags: ['campus', 'student', 'hotspot'], blurb: 'Mohanpur. Where Squirrel Social started.' },
    { id: 'kl-bckv', name: 'BCKV Mohanpur', at: [22.9440, 88.5300], tags: ['campus', 'student', 'park'], blurb: 'Bidhan Chandra Krishi Viswavidyalaya — fields, farms and long flat runs.' },
  ],
};
