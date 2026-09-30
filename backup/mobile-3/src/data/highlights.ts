import type { IconName } from '@/data/icons';
import type { SceneKind } from '@/types';

export type Highlight = {
  id: string;
  label: string;
  icon: IconName;
  scene: SceneKind;
  slides: { scene: SceneKind; seed: number; caption: string; meta: string }[];
};

export const highlights: Highlight[] = [
  { id: 'runs', label: 'My Runs', icon: 'run-fast', scene: 'run', slides: [
    { scene: 'run', seed: 21, caption: '5.12 km · 32:16', meta: 'Koregaon Park · Today' },
    { scene: 'lake', seed: 22, caption: 'Lake loop PR 🔥', meta: 'Pashan Lake · Sunday' },
    { scene: 'city-night', seed: 23, caption: 'Night miles hit different', meta: 'Riverfront · Last week' },
  ] },
  { id: 'crews', label: 'Crews', icon: 'account-group', scene: 'crew', slides: [
    { scene: 'crew', seed: 31, caption: 'Pune Runners, 42 strong', meta: 'Rooftop · Saturday' },
    { scene: 'yoga', seed: 32, caption: 'Yoga Vibes Thursday flow', meta: 'Osho Teerth Park' },
  ] },
  { id: 'food', label: 'Food', icon: 'food-apple', scene: 'brunch', slides: [
    { scene: 'brunch', seed: 41, caption: 'No sugar, all flavour', meta: 'Green Bowl · Day 12' },
    { scene: 'cafe', seed: 42, caption: 'Post-run smoothies', meta: 'Sprout Café' },
  ] },
  { id: 'fits', label: 'Fits', icon: 'tshirt-crew', scene: 'rooftop', slides: [
    { scene: 'rooftop', seed: 51, caption: 'Night Shift hoodie unlocked', meta: 'Level 13 reward' },
    { scene: 'city-sunset', seed: 52, caption: 'Pink shades season', meta: 'Koregaon Park' },
  ] },
  { id: 'events', label: 'Events', icon: 'calendar-star', scene: 'stadium', slides: [
    { scene: 'stadium', seed: 61, caption: 'Track Tuesday ⚡️', meta: '8 × 400 m' },
    { scene: 'hiit', seed: 62, caption: 'HIIT Takeover', meta: 'Pulse HIIT' },
  ] },
];

export const highlightById = (id: string) => highlights.find((h) => h.id === id);
