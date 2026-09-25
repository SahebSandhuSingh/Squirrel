import type { IconName } from '@/data/icons';
import type { MascotPose } from '@/types';

export type MissionTab = 'Daily' | 'Weekly' | 'Special';

export type Mission = {
  id: string;
  tab: MissionTab;
  title: string;
  icon: IconName;
  color: string;
  current: number;
  goal: number;
  unit?: string;
  /** How much one tap on "log" adds. */
  step: number;
  xp: number;
  coins: number;
  mascot?: MascotPose;
};

export const seedMissions: Mission[] = [
  { id: 'm-steps', tab: 'Daily', title: 'Walk 5,000 steps', icon: 'shoe-sneaker', color: '#E3CB8F', current: 2340, goal: 5000, step: 500, xp: 50, coins: 25, mascot: 'run' },
  { id: 'm-squats', tab: 'Daily', title: 'Do 10 squats', icon: 'dumbbell', color: '#B4C27A', current: 6, goal: 10, step: 1, xp: 40, coins: 20, mascot: 'lift' },
  { id: 'm-water', tab: 'Daily', title: 'Drink 2L water', icon: 'water', color: '#9DB04C', current: 1, goal: 2, unit: 'L', step: 0.25, xp: 30, coins: 15, mascot: 'drink' },
  { id: 'm-meal', tab: 'Daily', title: 'Log a healthy meal', icon: 'silverware-fork-knife', color: '#E9B949', current: 0, goal: 3, step: 1, xp: 30, coins: 15 },
  { id: 'm-active', tab: 'Daily', title: 'Be active for 30 mins', icon: 'run', color: '#E07A5F', current: 12, goal: 30, unit: 'mins', step: 5, xp: 40, coins: 20, mascot: 'cheer' },
  { id: 'w-run', tab: 'Weekly', title: 'Run 15 km total', icon: 'run-fast', color: '#E3CB8F', current: 9.4, goal: 15, unit: 'km', step: 1, xp: 150, coins: 75 },
  { id: 'w-event', tab: 'Weekly', title: 'Join a crew event', icon: 'account-group', color: '#9DB04C', current: 0, goal: 1, step: 1, xp: 120, coins: 60 },
  { id: 'w-workouts', tab: 'Weekly', title: 'Complete 5 workouts', icon: 'arm-flex', color: '#B4C27A', current: 3, goal: 5, step: 1, xp: 100, coins: 50 },
  { id: 'w-sleep', tab: 'Weekly', title: 'Sleep 7h+ for 5 nights', icon: 'sleep', color: '#C29A6B', current: 2, goal: 5, unit: 'nights', step: 1, xp: 80, coins: 40, mascot: 'sleep' },
  { id: 's-sunset', tab: 'Special', title: 'Sunset Run with your crew', icon: 'weather-sunset', color: '#E07A5F', current: 0, goal: 1, step: 1, xp: 250, coins: 150 },
  { id: 's-streak', tab: 'Special', title: 'Hit a 14-day streak', icon: 'fire', color: '#E9B949', current: 12, goal: 14, unit: 'days', step: 1, xp: 300, coins: 200 },
  { id: 's-explore', tab: 'Special', title: 'Check in at 3 new spots', icon: 'map-marker-star', color: '#9CCB7A', current: 1, goal: 3, step: 1, xp: 180, coins: 90 },
];
