import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const user = {
  name: 'Aanya S.',
  handle: '@aanya.moves',
  bio: 'Building a healthier, happier me\nand a kinder world. 🌱',
  posts: 12,
  followers: '4.8K',
  following: 28,
  tags: [
    { label: 'Runner', icon: 'run' as IconName },
    { label: 'Yoga', icon: 'yoga' as IconName },
    { label: 'No Sugar Club', icon: 'food-apple' as IconName },
  ],
};

export const avatars = ['👩🏻', '👩🏽', '👩🏾', '👩🏼', '👩🏿'];

export const avatarRail: { label: string; icon: IconName }[] = [
  { label: 'Looks', icon: 'face-woman-shimmer' },
  { label: 'Outfits', icon: 'tshirt-crew' },
  { label: 'Gear', icon: 'headphones' },
  { label: 'Shoes', icon: 'shoe-sneaker' },
  { label: 'Emotes', icon: 'emoticon-happy' },
  { label: 'Pets', icon: 'paw' },
];

export const outfits = [
  { id: 'o1', emoji: '🧥', color: '#2B2B35' },
  { id: 'o2', emoji: '🧥', color: '#3C4350' },
  { id: 'o3', emoji: '🥼', color: '#E9E3EE' },
  { id: 'o4', emoji: '🧥', color: '#C9A77A' },
];

export type MapPlace = {
  id: string;
  name: string;
  meta: string;
  kind: 'Gyms' | 'Runs' | 'Cafes' | 'Events';
  icon: IconName;
  x: number; // 0..1 of map width
  y: number; // 0..1 of map height
};

export const places: MapPlace[] = [
  { id: 'p1', name: 'Sunset Run', meta: '2.4 km', kind: 'Runs', icon: 'run-fast', x: 0.3, y: 0.08 },
  { id: 'p2', name: 'Cult Fit', meta: '0.8 km', kind: 'Gyms', icon: 'dumbbell', x: 0.02, y: 0.28 },
  { id: 'p3', name: 'Yoga Meet', meta: 'Today, 6 PM', kind: 'Events', icon: 'yoga', x: 0.56, y: 0.2 },
  { id: 'p4', name: 'Healthy Cafe', meta: '1.1 km', kind: 'Cafes', icon: 'coffee', x: 0.18, y: 0.55 },
  { id: 'p5', name: 'Community Run', meta: '120 people', kind: 'Events', icon: 'account-group', x: 0.5, y: 0.78 },
];

export type Mission = {
  id: string;
  title: string;
  icon: IconName;
  color: string;
  current: number;
  goal: number;
  unit?: string;
  xp: number;
  step: number; // how much a tap on "+" logs
};

export const missions: Record<'Daily' | 'Weekly' | 'Special', Mission[]> = {
  Daily: [
    { id: 'm1', title: 'Walk 5,000 steps', icon: 'shoe-sneaker', color: colors.pink, current: 2340, goal: 5000, xp: 50, step: 500 },
    { id: 'm2', title: 'Do 10 squats', icon: 'dumbbell', color: colors.violet, current: 6, goal: 10, xp: 40, step: 1 },
    { id: 'm3', title: 'Drink 2L water', icon: 'water', color: colors.blue, current: 1, goal: 2, xp: 30, step: 0.5 },
    { id: 'm4', title: 'Log a healthy meal', icon: 'silverware-fork-knife', color: colors.gold, current: 0, goal: 3, xp: 30, step: 1 },
    { id: 'm5', title: 'Be active for 30 mins', icon: 'run', color: colors.pink, current: 12, goal: 30, unit: 'mins', xp: 40, step: 5 },
  ],
  Weekly: [
    { id: 'w1', title: 'Run 15 km total', icon: 'run-fast', color: colors.pink, current: 9.4, goal: 15, unit: 'km', xp: 150, step: 1 },
    { id: 'w2', title: 'Join a crew event', icon: 'account-group', color: colors.cyan, current: 0, goal: 1, xp: 120, step: 1 },
    { id: 'w3', title: '5 workouts this week', icon: 'arm-flex', color: colors.violet, current: 3, goal: 5, xp: 100, step: 1 },
  ],
  Special: [
    { id: 's1', title: 'Sunset Run at Pashan Lake', icon: 'weather-sunset', color: colors.orange, current: 0, goal: 1, xp: 250, step: 1 },
    { id: 's2', title: '12-day streak', icon: 'fire', color: colors.gold, current: 12, goal: 14, unit: 'days', xp: 300, step: 1 },
  ],
};

export type Stat = { id: string; label: string; value: string; unit?: string; icon: IconName; color: string; bars: number[]; progress?: number };

export const stats: Record<'Day' | 'Week' | 'Month' | 'Year', Stat[]> = {
  Day: [
    { id: 'steps', label: 'Steps', value: '7,812', unit: '/ 10,000', icon: 'shoe-print', color: colors.green, bars: [2, 3, 5, 4, 6, 8, 7], progress: 0.78 },
    { id: 'active', label: 'Active Time', value: '54m', icon: 'timer-outline', color: colors.blue, bars: [1, 2, 4, 3, 5, 6, 4] },
    { id: 'cal', label: 'Calories', value: '410', unit: 'kcal', icon: 'fire', color: colors.orange, bars: [2, 3, 2, 5, 4, 6, 7] },
    { id: 'work', label: 'Workouts', value: '1 / 1', icon: 'arm-flex', color: colors.pink, bars: [0, 0, 0, 1, 1, 1, 1] },
    { id: 'streak', label: 'Streak', value: '12 days', icon: 'fire-circle', color: colors.violet, bars: [3, 4, 5, 6, 7, 8, 9] },
  ],
  Week: [
    { id: 'steps', label: 'Steps', value: '48,320', unit: '/ 70,000', icon: 'shoe-print', color: colors.green, bars: [3, 5, 4, 6, 8, 7, 9], progress: 0.69 },
    { id: 'active', label: 'Active Time', value: '6h 12m', icon: 'timer-outline', color: colors.blue, bars: [4, 6, 5, 7, 9, 8, 6] },
    { id: 'cal', label: 'Calories', value: '2,340', unit: 'kcal', icon: 'fire', color: colors.orange, bars: [3, 2, 4, 5, 6, 8, 7] },
    { id: 'work', label: 'Workouts', value: '5 / 7', icon: 'arm-flex', color: colors.pink, bars: [2, 3, 4, 5, 6, 7, 5] },
    { id: 'streak', label: 'Streak', value: '12 days', icon: 'fire-circle', color: colors.violet, bars: [3, 4, 5, 6, 7, 8, 9] },
  ],
  Month: [
    { id: 'steps', label: 'Steps', value: '212,480', unit: '/ 300,000', icon: 'shoe-print', color: colors.green, bars: [5, 6, 7, 8], progress: 0.71 },
    { id: 'active', label: 'Active Time', value: '27h 40m', icon: 'timer-outline', color: colors.blue, bars: [6, 7, 5, 9] },
    { id: 'cal', label: 'Calories', value: '10,920', unit: 'kcal', icon: 'fire', color: colors.orange, bars: [5, 6, 8, 7] },
    { id: 'work', label: 'Workouts', value: '21 / 30', icon: 'arm-flex', color: colors.pink, bars: [4, 5, 6, 6] },
    { id: 'streak', label: 'Best Streak', value: '12 days', icon: 'fire-circle', color: colors.violet, bars: [3, 6, 8, 9] },
  ],
  Year: [
    { id: 'steps', label: 'Steps', value: '1.9M', unit: '/ 3.6M', icon: 'shoe-print', color: colors.green, bars: [3, 4, 4, 5, 6, 6, 7, 8, 8, 9], progress: 0.53 },
    { id: 'active', label: 'Active Time', value: '240h', icon: 'timer-outline', color: colors.blue, bars: [2, 3, 5, 4, 6, 7, 6, 8, 9, 8] },
    { id: 'cal', label: 'Calories', value: '96,400', unit: 'kcal', icon: 'fire', color: colors.orange, bars: [3, 4, 3, 5, 6, 5, 7, 8, 7, 9] },
    { id: 'work', label: 'Workouts', value: '184', icon: 'arm-flex', color: colors.pink, bars: [2, 3, 4, 5, 5, 6, 7, 7, 8, 9] },
    { id: 'streak', label: 'Best Streak', value: '12 days', icon: 'fire-circle', color: colors.violet, bars: [1, 2, 4, 3, 5, 6, 5, 7, 8, 9] },
  ],
};

export type Crew = { id: string; name: string; members: string; icon: IconName; color: string; scope: 'Nearby' | 'Online' | 'Campus'; interest: string };

export const crews: Crew[] = [
  { id: 'c1', name: 'Pune Runners', members: '1.2K', icon: 'run', color: '#38E1B0', scope: 'Nearby', interest: 'running' },
  { id: 'c2', name: 'Lifting Squirrels', members: '857', icon: 'weight-lifter', color: '#FFB23D', scope: 'Nearby', interest: 'gym' },
  { id: 'c3', name: 'Yoga Vibes', members: '640', icon: 'yoga', color: '#FF7FD6', scope: 'Online', interest: 'yoga' },
  { id: 'c4', name: 'No Sugar Club', members: '412', icon: 'food-apple', color: '#3DD6F0', scope: 'Online', interest: 'nutrition' },
  { id: 'c5', name: 'Early Birds', members: '1.1K', icon: 'weather-sunset-up', color: '#FF7A3D', scope: 'Campus', interest: 'running' },
  { id: 'c6', name: 'COEP Cyclists', members: '233', icon: 'bike', color: '#B57BFF', scope: 'Campus', interest: 'cycling' },
];

export type EventItem = { id: string; title: string; place: string; when: string; going: number; online: boolean; colors: [string, string]; icon: IconName };

export const events: EventItem[] = [
  { id: 'e1', title: 'Sunset Run', place: 'Pashan Lake', when: 'Sat, 27 Sep · 6:00 AM', going: 32, online: false, colors: ['#FF8A4C', '#6B1553'], icon: 'run-fast' },
  { id: 'e2', title: 'Strength Workshop', place: 'Cult Fit, Hinjewadi', when: 'Sun, 28 Sep · 5:00 PM', going: 18, online: false, colors: ['#5B3A8C', '#1A0B2A'], icon: 'weight-lifter' },
  { id: 'e3', title: 'Yoga in the Park', place: 'Osho Teerth Park', when: 'Sun, 28 Sep · 7:00 AM', going: 24, online: false, colors: ['#3DD6A0', '#0B3A3F'], icon: 'yoga' },
  { id: 'e4', title: 'Healthy Brunch', place: 'Viman Nagar', when: 'Sun, 28 Sep · 11:00 AM', going: 12, online: false, colors: ['#FF5C7A', '#5A1030'], icon: 'food' },
  { id: 'e5', title: 'Live HIIT Session', place: 'Zoom · Squirrel Studio', when: 'Mon, 29 Sep · 7:30 PM', going: 96, online: true, colors: ['#7B2FF7', '#1A0B2A'], icon: 'video' },
];

export type ShopItem = { id: string; name: string; price: number; icon: IconName; color: string; category: 'Hoodies' | 'Tees' | 'Shoes' | 'Bags' | 'Accessories'; tab: 'Outfits' | 'Gear' | 'Accessories' | 'Stickers' };

export const shopItems: ShopItem[] = [
  { id: 'i1', name: 'Night Hoodie', price: 1200, icon: 'tshirt-crew', color: '#3B3B48', category: 'Hoodies', tab: 'Outfits' },
  { id: 'i2', name: 'Cloud Hoodie', price: 1500, icon: 'tshirt-crew', color: '#F1E9F7', category: 'Hoodies', tab: 'Outfits' },
  { id: 'i3', name: 'Squirrel Cap', price: 800, icon: 'hat-fedora', color: '#FF4F6E', category: 'Accessories', tab: 'Accessories' },
  { id: 'i4', name: 'Aero Sneakers', price: 1000, icon: 'shoe-sneaker', color: '#FFFFFF', category: 'Shoes', tab: 'Outfits' },
  { id: 'i5', name: 'Track Tee', price: 1500, icon: 'tshirt-v', color: '#8A8A9A', category: 'Tees', tab: 'Outfits' },
  { id: 'i6', name: 'Trail Pack', price: 1200, icon: 'bag-personal', color: '#FF4F6E', category: 'Bags', tab: 'Gear' },
  { id: 'i7', name: 'Neon Bottle', price: 600, icon: 'bottle-soda-classic', color: '#5FB8FF', category: 'Accessories', tab: 'Gear' },
  { id: 'i8', name: 'Pink Shades', price: 400, icon: 'sunglasses', color: '#FF4FC3', category: 'Accessories', tab: 'Accessories' },
  { id: 'i9', name: 'Pulse Watch', price: 700, icon: 'watch', color: '#C9C9D6', category: 'Accessories', tab: 'Gear' },
  { id: 'i10', name: 'Crown Sticker', price: 150, icon: 'crown', color: '#FFC83D', category: 'Accessories', tab: 'Stickers' },
  { id: 'i11', name: 'Neon Heart', price: 150, icon: 'heart', color: '#FF4FC3', category: 'Accessories', tab: 'Stickers' },
];

export type Post = { id: string; author: string; avatar: string; meta: string; caption: string; likes: number; comments: number; feed: ('For You' | 'Following' | 'Nearby')[]; art?: 'run' | 'none' };

export const posts: Post[] = [
  { id: 'f1', author: 'Rhea', avatar: '👩🏽', meta: '2h ago at Koregaon Park', caption: 'Morning run crew 🏃‍♀️🏃\nDiscipline over mood.', likes: 241, comments: 12, feed: ['For You', 'Following', 'Nearby'], art: 'run' },
  { id: 'f2', author: 'Aarav', avatar: '👨🏽', meta: '4h ago', caption: 'Post-workout happiness 💪', likes: 88, comments: 4, feed: ['For You', 'Following'], art: 'none' },
  { id: 'f3', author: 'Lifting Squirrels', avatar: '🐿️', meta: '6h ago at Cult Fit', caption: 'New PR day. Squat 80 kg! 🔥', likes: 132, comments: 19, feed: ['For You', 'Nearby'], art: 'run' },
];

export const highlights: { label: string; icon: IconName; route: string }[] = [
  { label: 'My Runs', icon: 'run-fast', route: '/progress' },
  { label: 'Crews', icon: 'account-group', route: '/crew' },
  { label: 'Events', icon: 'calendar-star', route: '/events' },
  { label: 'Shop', icon: 'shopping', route: '/shop' },
];

export const rewards: { label: string; icon: IconName; color: string }[] = [
  { label: 'New Outfit', icon: 'tshirt-crew', color: colors.gold },
  { label: 'City Badge', icon: 'shield-star', color: colors.violet },
  { label: 'Sticker Pack', icon: 'sticker-emoji', color: colors.cyan },
];
