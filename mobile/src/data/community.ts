import type { SceneKind } from '@/types';
import type { IconName } from '@/data/icons';
import { cityById, type City } from '@/data/cities';
import { users } from '@/data/users';

// ---------------------------------------------------------------------------
// Crews
// ---------------------------------------------------------------------------

export type CrewScope = 'Nearby' | 'Online' | 'Campus';

export type Crew = {
  id: string;
  cityId: string | null; // null = online / global
  name: string;
  members: number;
  scope: CrewScope;
  interest: 'running' | 'gym' | 'yoga' | 'nutrition' | 'cycling' | 'hiit' | 'walking' | 'climbing';
  icon: IconName;
  color: string;
  scene: SceneKind;
  tagline: string;
  meets: string;
  memberIds: string[];
};

type CrewTemplate = Omit<Crew, 'id' | 'cityId' | 'name' | 'memberIds'> & { name: (c: City) => string };

const CREW_TEMPLATES: CrewTemplate[] = [
  { name: (c) => `${c.name} Runners`, members: 1200, scope: 'Nearby', interest: 'running', icon: 'run-fast', color: '#3DF0A0', scene: 'run', tagline: 'Weekend long runs, all paces welcome.', meets: 'Sat & Sun · 6:00 AM' },
  { name: () => 'Lifting Squirrels', members: 857, scope: 'Nearby', interest: 'gym', icon: 'weight-lifter', color: '#FFD21F', scene: 'gym', tagline: 'Strength first. Ego never.', meets: 'Mon/Wed/Fri · 7:00 PM' },
  { name: () => 'Yoga Vibes', members: 640, scope: 'Nearby', interest: 'yoga', icon: 'yoga', color: '#FF6FBF', scene: 'yoga', tagline: 'Sunset flows in the park.', meets: 'Tue & Thu · 6:30 PM' },
  { name: () => 'No Sugar Club', members: 412, scope: 'Online', interest: 'nutrition', icon: 'food-apple', color: '#D7FF1F', scene: 'brunch', tagline: '30-day no-sugar challenges & recipes.', meets: 'Daily check-ins' },
  { name: () => 'Early Birds', members: 1100, scope: 'Nearby', interest: 'running', icon: 'weather-sunset-up', color: '#FF8A1F', scene: 'lake', tagline: 'Up before the sun. Every day.', meets: 'Daily · 5:30 AM' },
  { name: (c) => `${c.name} Night Riders`, members: 530, scope: 'Nearby', interest: 'cycling', icon: 'bike', color: '#C084FC', scene: 'cycling', tagline: 'City loops after dark, lights on.', meets: 'Fri · 9:00 PM' },
  { name: () => 'Campus Sweat Society', members: 318, scope: 'Campus', interest: 'hiit', icon: 'lightning-bolt', color: '#FF2D9B', scene: 'hiit', tagline: 'Between-lecture HIIT and track days.', meets: 'Mon–Fri · 4:30 PM' },
  { name: () => 'Stair Climbers Anonymous', members: 204, scope: 'Campus', interest: 'climbing', icon: 'stairs-up', color: '#5FB8FF', scene: 'stadium', tagline: 'Stadium stairs. Zero elevators.', meets: 'Wed · 6:00 AM' },
  { name: () => 'Walk & Talk', members: 960, scope: 'Online', interest: 'walking', icon: 'walk', color: '#3DF0A0', scene: 'city-dawn', tagline: '10k steps a day, voice-note buddies.', meets: 'Async · daily' },
  { name: (c) => `${c.name} Rooftop Stretch`, members: 275, scope: 'Nearby', interest: 'yoga', icon: 'human-handsup', color: '#FFD21F', scene: 'rooftop', tagline: 'Mobility + city views.', meets: 'Sun · 7:00 PM' },
];

export function crewsForCity(cityId: string): Crew[] {
  const city = cityById(cityId);
  return CREW_TEMPLATES.map((t, i) => ({
    ...t,
    id: `${city.id}-crew-${i}`,
    cityId: t.scope === 'Online' ? null : city.id,
    name: t.name(city),
    // Slightly vary counts per city so cities don't look cloned.
    members: Math.round(t.members * (0.7 + ((city.id.length * 7 + i * 13) % 10) / 15)),
    memberIds: users.filter((_, k) => (k + i) % 3 !== 0).slice(0, 6).map((u) => u.id),
  }));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventItem = {
  id: string;
  cityId: string | null;
  title: string;
  venue: string;
  /** ISO timestamp — generated relative to "now" so demo data never goes stale. */
  startsAt: string;
  online: boolean;
  going: number;
  attendeeIds: string[];
  scene: SceneKind;
  icon: IconName;
  xp: number;
  host: string;
  description: string;
};

type EventTemplate = {
  title: string;
  venue: (c: City) => string;
  dayOffset: number;
  hour: number;
  online?: boolean;
  going: number;
  scene: SceneKind;
  icon: IconName;
  xp: number;
  host: string;
  description: string;
};

const EVENT_TEMPLATES: EventTemplate[] = [
  { title: 'Sunset Run', venue: (c) => c.venues.runs[0], dayOffset: 3, hour: 6, going: 32, scene: 'run', icon: 'run-fast', xp: 120, host: 'Runners', description: 'An easy-paced 5K along the water, then chai and photos at golden hour. All paces, no one gets left behind.' },
  { title: 'Strength Workshop', venue: (c) => c.venues.gyms[0], dayOffset: 4, hour: 17, going: 18, scene: 'gym', icon: 'weight-lifter', xp: 100, host: 'Lifting Squirrels', description: 'Squat, hinge and press fundamentals with certified coaches. Bring water, we bring the plates.' },
  { title: 'Yoga in the Park', venue: (c) => c.venues.parks[0], dayOffset: 4, hour: 7, going: 24, scene: 'yoga', icon: 'yoga', xp: 80, host: 'Yoga Vibes', description: '60-minute vinyasa flow under the trees. Mats available for the first 15 people.' },
  { title: 'Healthy Brunch', venue: (c) => c.venues.cafes[0], dayOffset: 4, hour: 11, going: 12, scene: 'brunch', icon: 'food', xp: 50, host: 'No Sugar Club', description: 'Post-run brunch with a no-refined-sugar menu. Meet the crew, swap recipes.' },
  { title: 'Night Ride', venue: (c) => c.venues.runs[2] ?? c.venues.runs[0], dayOffset: 1, hour: 21, going: 41, scene: 'cycling', icon: 'bike', xp: 110, host: 'Night Riders', description: '20 km no-drop city loop. Lights and helmet mandatory.' },
  { title: 'HIIT Takeover', venue: (c) => c.venues.studios[1] ?? c.venues.studios[0], dayOffset: 2, hour: 19, going: 26, scene: 'hiit', icon: 'lightning-bolt', xp: 90, host: 'Pulse HIIT', description: '45 minutes. 3 rounds. One very loud playlist.' },
  { title: 'Rooftop Stretch & Chill', venue: (c) => c.venues.studios[0], dayOffset: 5, hour: 19, going: 19, scene: 'rooftop', icon: 'human-handsup', xp: 60, host: 'Rooftop Stretch', description: 'Mobility, breathwork and city lights. Stay for mocktails.' },
  { title: 'Track Tuesday', venue: (c) => c.venues.runs[3] ?? c.venues.runs[0], dayOffset: 6, hour: 6, going: 37, scene: 'stadium', icon: 'timer-outline', xp: 100, host: 'Early Birds', description: '8 × 400 m intervals. Coaches pace every group.' },
  { title: 'Live HIIT Session', venue: () => 'Online · Squirrel Studio', dayOffset: 1, hour: 19, online: true, going: 96, scene: 'hiit', icon: 'video', xp: 70, host: 'Squirrel Studio', description: 'Stream it from your living room. Camera optional, sweat mandatory.' },
  { title: '30-Day No Sugar Kickoff', venue: () => 'Online · No Sugar Club', dayOffset: 2, hour: 20, online: true, going: 212, scene: 'brunch', icon: 'food-apple', xp: 60, host: 'No Sugar Club', description: 'Group call to set goals and plan your first week of meals.' },
  { title: 'Sunrise Flow (Live)', venue: () => 'Online · Yoga Vibes', dayOffset: 3, hour: 6, online: true, going: 148, scene: 'yoga', icon: 'yoga', xp: 50, host: 'Yoga Vibes', description: '30-minute wake-up flow for all levels.' },
];

export function eventsForCity(cityId: string, now = new Date()): EventItem[] {
  const city = cityById(cityId);
  return EVENT_TEMPLATES.map((t, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + t.dayOffset);
    d.setHours(t.hour, 0, 0, 0);
    return {
      id: t.online ? `online-event-${i}` : `${city.id}-event-${i}`,
      cityId: t.online ? null : city.id,
      title: t.title,
      venue: t.venue(city),
      startsAt: d.toISOString(),
      online: !!t.online,
      going: t.going,
      attendeeIds: users.slice((i % 5) + 1, (i % 5) + 5).map((u) => u.id),
      scene: t.scene,
      icon: t.icon,
      xp: t.xp,
      host: t.host === 'Runners' ? `${city.name} Runners` : t.host === 'Night Riders' ? `${city.name} Night Riders` : t.host,
      description: t.description,
    };
  });
}

export const formatEventDate = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
};

// ---------------------------------------------------------------------------
// Map places
// ---------------------------------------------------------------------------

export type PlaceKind = 'Gyms' | 'Runs' | 'Cafes' | 'Events';

export type Place = {
  id: string;
  name: string;
  meta: string;
  kind: PlaceKind;
  icon: IconName;
  color: string;
  /** Position on the stylised map, 0..1 of width/height. */
  x: number;
  y: number;
  eventId?: string;
};

export function placesForCity(cityId: string): Place[] {
  const city = cityById(cityId);
  const events = eventsForCity(cityId).filter((e) => !e.online);
  return [
    { id: 'pl-run', name: 'Sunset Run', meta: '2.4 km', kind: 'Runs', icon: 'run-fast', color: '#FF2D9B', x: 0.3, y: 0.12, eventId: events[0]?.id },
    { id: 'pl-gym', name: city.venues.gyms[0].split(',')[0], meta: '0.8 km', kind: 'Gyms', icon: 'dumbbell', color: '#FFD21F', x: 0.06, y: 0.34 },
    { id: 'pl-yoga', name: 'Yoga Meet', meta: 'Today, 6 PM', kind: 'Events', icon: 'yoga', color: '#C084FC', x: 0.5, y: 0.22, eventId: events[2]?.id },
    { id: 'pl-cafe', name: 'Healthy Cafe', meta: '1.1 km', kind: 'Cafes', icon: 'coffee', color: '#3DF0A0', x: 0.16, y: 0.58 },
    { id: 'pl-comm', name: 'Community Run', meta: '120 people', kind: 'Events', icon: 'account-group', color: '#FF2D9B', x: 0.5, y: 0.8, eventId: events[7]?.id },
    { id: 'pl-gym2', name: city.venues.gyms[1].split(',')[0], meta: '2.2 km', kind: 'Gyms', icon: 'weight-lifter', color: '#FFD21F', x: 0.66, y: 0.46 },
    { id: 'pl-run2', name: city.venues.runs[1], meta: '3.6 km loop', kind: 'Runs', icon: 'map-marker-path', color: '#D7FF1F', x: 0.56, y: 0.0 },
    { id: 'pl-cafe2', name: city.venues.cafes[1].split(',')[0], meta: '1.9 km', kind: 'Cafes', icon: 'cup', color: '#3DF0A0', x: 0.62, y: 0.64 },
    { id: 'pl-hiit', name: 'HIIT Takeover', meta: 'Tomorrow, 7 PM', kind: 'Events', icon: 'lightning-bolt', color: '#FF8A1F', x: 0.24, y: 0.72, eventId: events[5]?.id },
  ];
}
