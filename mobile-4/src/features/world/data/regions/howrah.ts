/**
 * HOWRAH — the west bank: the station, the Botanical Garden and IIEST Shibpur. Its outline runs
 * along the Hooghly's west bank, leaving the river between it and Kolkata. Approximate.
 */
import type { RegionSpec } from '../../types.ts';

export const HOWRAH: RegionSpec = {
  id: 'howrah',
  name: 'Howrah',
  district: 'HOWRAH',
  accuracy: 'approximate',
  outline: [
    [22.6550, 88.3490], [22.6300, 88.3500], [22.6000, 88.3460], [22.5860, 88.3440], [22.5720, 88.3370],
    [22.5620, 88.3280], [22.5540, 88.3150], [22.5510, 88.3000], [22.5530, 88.2850], [22.5500, 88.2700],
    [22.5700, 88.2650], [22.5950, 88.2800], [22.6250, 88.3050], [22.6550, 88.3300],
  ],
  seeds: [
    { id: 'hw-bally', name: 'Bally', at: [22.6450, 88.3400], tags: ['water'], blurb: 'Bally Bridge and the northern ghats.' },
    { id: 'hw-belur', name: 'Belur', at: [22.6320, 88.3480], tags: ['heritage', 'water'], blurb: 'Belur Math on the river — the calmest run in the metro.' },
    { id: 'hw-liluah', name: 'Liluah', at: [22.6250, 88.3300], tags: ['transit'], blurb: 'Rail yards and long straight roads.' },
    { id: 'hw-salkia', name: 'Salkia', at: [22.6010, 88.3440], tags: ['market'], blurb: 'Old Howrah’s lanes, north of the bridge.' },
    { id: 'hw-howrah-station', name: 'Howrah Station', at: [22.5833, 88.3400], tags: ['transit', 'hotspot', 'heritage'], blurb: 'The red-brick gateway to Bengal, under the bridge.' },
    { id: 'hw-santragachi', name: 'Santragachi', at: [22.5850, 88.2950], tags: ['water', 'transit'], blurb: 'The jheel — migratory birds every winter.' },
    { id: 'hw-shibpur', name: 'Shibpur', at: [22.5650, 88.3200], tags: ['student'], blurb: 'The riverside neighbourhood around the engineering campus.' },
    { id: 'hw-iiest', name: 'IIEST Shibpur', at: [22.5550, 88.3030], tags: ['campus', 'student'], blurb: 'IIEST Shibpur — Bengal Engineering since 1856.' },
    { id: 'hw-botanical-garden', name: 'Botanical Garden', at: [22.5590, 88.2880], tags: ['park', 'heritage'], blurb: 'The Great Banyan and the longest green loop on the west bank.' },
  ],
};
