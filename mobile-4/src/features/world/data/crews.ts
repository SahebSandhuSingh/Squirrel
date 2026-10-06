/**
 * Preview Season crews. Colours are deliberately muted so the city reads as one dark world with
 * a few controlled accents; the viewer's own crew is drawn in the brand lime (darkColors.primary)
 * so "what's ours" is always the brightest thing on the map.
 *
 * (No theme import: this file is shared with node tests. LIME is darkColors.primary.)
 */
import type { Crew } from '../types.ts';

export const LIME = '#D7FF1F';

export const MY_CREW_ID = 'night-owls';

export const CREWS: Crew[] = [
  { id: 'night-owls', name: 'The Night Owls', short: 'OWLS', color: LIME, icon: 'owl', members: 48, xp: 41_200, motto: 'We run when the city sleeps.', home: 'College Street' },
  { id: 'south-side', name: 'South Side', short: 'SOUTH', color: '#E8607A', icon: 'lightning-bolt', members: 41, xp: 38_650, motto: 'Lake laps. No excuses.', home: 'Jadavpur · Dhakuria' },
  { id: 'sector-five', name: 'Sector Five Syndicate', short: 'S5S', color: '#5AA9E6', icon: 'chip', members: 36, xp: 33_900, motto: 'Ship code. Run loops.', home: 'Salt Lake' },
  { id: 'nomads', name: 'New Town Nomads', short: 'NOMAD', color: '#E8893A', icon: 'compass-rose', members: 29, xp: 27_400, motto: 'Every road is new.', home: 'New Town' },
  { id: 'hawks', name: 'Hooghly Hawks', short: 'HAWKS', color: '#3CC9A0', icon: 'bird', members: 24, xp: 21_800, motto: 'West bank, best bank.', home: 'Howrah · Shibpur' },
  { id: 'north-kings', name: 'North Calcutta Kings', short: 'KINGS', color: '#9D86F0', icon: 'crown', members: 33, xp: 30_100, motto: 'Old streets. New records.', home: 'Shyambazar' },
  { id: 'mavericks', name: 'Mohanpur Mavericks', short: 'MAVS', color: '#D9B23A', icon: 'flask', members: 22, xp: 18_300, motto: 'Science runs on squirrels.', home: 'Kalyani · Mohanpur' },
];

export const CREW_BY_ID: Record<string, Crew> = Object.fromEntries(CREWS.map((c) => [c.id, c]));

export const crewOf = (id: string | null | undefined): Crew | null => (id ? CREW_BY_ID[id] ?? null : null);
