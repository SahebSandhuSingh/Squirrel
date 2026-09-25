import type { IconName } from '@/data/icons';
import type { SceneKind } from '@/types';

export type Period = 'Day' | 'Week' | 'Month' | 'Year';

export type StatSeries = { labels: string[]; values: number[] };

export type Stat = {
  id: 'steps' | 'active' | 'kcal' | 'workouts' | 'streak';
  label: string;
  value: string;
  unit?: string;
  icon: IconName;
  color: string;
  /** 0..1 progress towards the period goal, when there is one. */
  progress?: number;
  delta?: string;
  series: StatSeries;
};

const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const day = ['6a', '9a', '12p', '3p', '6p', '9p'];
const month = ['W1', 'W2', 'W3', 'W4'];
const year = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const stats: Record<Period, Stat[]> = {
  Day: [
    { id: 'steps', label: 'Steps', value: '7,812', unit: '/ 10,000', icon: 'shoe-print', color: '#3DF0A0', progress: 0.78, delta: '+12%', series: { labels: day, values: [400, 2100, 900, 1300, 2600, 512] } },
    { id: 'active', label: 'Active Time', value: '54m', icon: 'timer-outline', color: '#3B6BFF', progress: 0.9, delta: '+8m', series: { labels: day, values: [5, 22, 4, 6, 15, 2] } },
    { id: 'kcal', label: 'Calories', value: '410', unit: 'kcal', icon: 'fire', color: '#FF5FA2', progress: 0.68, series: { labels: day, values: [40, 120, 50, 60, 110, 30] } },
    { id: 'workouts', label: 'Workouts', value: '1 / 1', icon: 'arm-flex', color: '#FF7A1A', progress: 1, series: { labels: day, values: [0, 1, 0, 0, 0, 0] } },
    { id: 'streak', label: 'Streak', value: '12 days', icon: 'fire-circle', color: '#B69CFF', delta: 'Best: 12', series: { labels: week, values: [1, 1, 1, 1, 1, 1, 1] } },
  ],
  Week: [
    { id: 'steps', label: 'Steps', value: '48,320', unit: '/ 70,000', icon: 'shoe-print', color: '#3DF0A0', progress: 0.69, delta: '+9%', series: { labels: week, values: [6200, 8100, 5400, 9300, 7800, 4900, 6620] } },
    { id: 'active', label: 'Active Time', value: '6h 12m', icon: 'timer-outline', color: '#3B6BFF', progress: 0.74, delta: '+42m', series: { labels: week, values: [45, 62, 38, 71, 55, 40, 61] } },
    { id: 'kcal', label: 'Calories', value: '2,340', unit: 'kcal', icon: 'fire', color: '#FF5FA2', progress: 0.62, delta: '+5%', series: { labels: week, values: [280, 360, 240, 410, 330, 300, 420] } },
    { id: 'workouts', label: 'Workouts', value: '5 / 7', icon: 'arm-flex', color: '#FF7A1A', progress: 0.71, series: { labels: week, values: [1, 1, 0, 1, 1, 0, 1] } },
    { id: 'streak', label: 'Streak', value: '12 days', icon: 'fire-circle', color: '#B69CFF', delta: 'Personal best', series: { labels: week, values: [6, 7, 8, 9, 10, 11, 12] } },
  ],
  Month: [
    { id: 'steps', label: 'Steps', value: '212,480', unit: '/ 300,000', icon: 'shoe-print', color: '#3DF0A0', progress: 0.71, delta: '+14%', series: { labels: month, values: [46000, 52000, 61000, 53480] } },
    { id: 'active', label: 'Active Time', value: '27h 40m', icon: 'timer-outline', color: '#3B6BFF', progress: 0.77, series: { labels: month, values: [380, 420, 450, 410] } },
    { id: 'kcal', label: 'Calories', value: '10,920', unit: 'kcal', icon: 'fire', color: '#FF5FA2', progress: 0.66, series: { labels: month, values: [2400, 2700, 3100, 2720] } },
    { id: 'workouts', label: 'Workouts', value: '21 / 30', icon: 'arm-flex', color: '#FF7A1A', progress: 0.7, series: { labels: month, values: [4, 5, 6, 6] } },
    { id: 'streak', label: 'Best Streak', value: '12 days', icon: 'fire-circle', color: '#B69CFF', series: { labels: month, values: [3, 6, 9, 12] } },
  ],
  Year: [
    { id: 'steps', label: 'Steps', value: '1.9M', unit: '/ 3.6M', icon: 'shoe-print', color: '#3DF0A0', progress: 0.53, series: { labels: year, values: [120, 140, 150, 160, 170, 175, 190, 210, 230, 0, 0, 0] } },
    { id: 'active', label: 'Active Time', value: '240h', icon: 'timer-outline', color: '#3B6BFF', progress: 0.6, series: { labels: year, values: [18, 20, 22, 24, 25, 26, 28, 30, 31, 0, 0, 0] } },
    { id: 'kcal', label: 'Calories', value: '96,400', unit: 'kcal', icon: 'fire', color: '#FF5FA2', progress: 0.58, series: { labels: year, values: [8, 9, 9, 10, 11, 11, 12, 13, 13, 0, 0, 0] } },
    { id: 'workouts', label: 'Workouts', value: '184', icon: 'arm-flex', color: '#FF7A1A', progress: 0.6, series: { labels: year, values: [14, 16, 18, 19, 20, 21, 24, 25, 27, 0, 0, 0] } },
    { id: 'streak', label: 'Best Streak', value: '12 days', icon: 'fire-circle', color: '#B69CFF', series: { labels: year, values: [3, 4, 5, 4, 6, 7, 8, 10, 12, 0, 0, 0] } },
  ],
};

/** Today's snapshot for the Home rings. */
export const today = {
  steps: { value: 7812, goal: 10000 },
  active: { value: 54, goal: 60 },
  kcal: { value: 410, goal: 600 },
  streak: 12,
};

export type ActivityLog = { id: string; title: string; scene: SceneKind; when: string; km?: number; minutes: number; kcal: number; icon: IconName };

export const recentActivities: ActivityLog[] = [
  { id: 'r1', title: 'Evening Run · Koregaon Park', scene: 'run', when: 'Today, 6:40 PM', km: 5.12, minutes: 32, kcal: 412, icon: 'run-fast' },
  { id: 'r2', title: 'Yoga in the Park', scene: 'yoga', when: 'Yesterday, 7:00 AM', minutes: 60, kcal: 210, icon: 'yoga' },
  { id: 'r3', title: 'Leg Day · Iron House', scene: 'gym', when: 'Mon, 7:30 PM', minutes: 55, kcal: 460, icon: 'weight-lifter' },
  { id: 'r4', title: 'Lake Loop', scene: 'lake', when: 'Sun, 6:10 AM', km: 8.4, minutes: 52, kcal: 640, icon: 'run-fast' },
  { id: 'r5', title: 'HIIT Takeover', scene: 'hiit', when: 'Sat, 7:00 PM', minutes: 45, kcal: 520, icon: 'lightning-bolt' },
];

/** 5 weeks × 7 days of activity intensity (0..4) for the streak heatmap. */
export const heatmap: number[][] = [
  [1, 2, 0, 3, 2, 1, 0],
  [2, 3, 1, 2, 4, 2, 1],
  [0, 2, 3, 3, 2, 4, 2],
  [3, 2, 4, 3, 3, 2, 3],
  [4, 3, 3, 4, 2, 3, 2],
];
