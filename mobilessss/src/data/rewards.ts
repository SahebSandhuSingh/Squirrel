import type { BadgeKind, RewardArtKind } from '@/types';

export type Achievement = {
  id: string;
  kind: BadgeKind;
  name: string;
  description: string;
  /** 0..1; 1 = unlocked. */
  progress: number;
  unlockedAt?: string;
};

export const achievements: Achievement[] = [
  { id: 'a-first', kind: 'first-run', name: 'First Steps', description: 'Log your first run.', progress: 1, unlockedAt: 'Mar 2026' },
  { id: 'a-streak', kind: 'streak', name: 'On Fire', description: 'Keep a 7-day streak.', progress: 1, unlockedAt: 'Sep 2026' },
  { id: 'a-city', kind: 'city', name: 'City Badge', description: 'Reach Level 13 in your city.', progress: 1, unlockedAt: 'Today' },
  { id: 'a-early', kind: 'early-bird', name: 'Early Bird', description: '10 workouts before 7 AM.', progress: 1, unlockedAt: 'Aug 2026' },
  { id: 'a-hydra', kind: 'hydration', name: 'Hydro Homie', description: 'Hit your water goal 14 days.', progress: 0.71 },
  { id: 'a-10k', kind: 'steps-10k', name: '10K Club', description: 'Walk 10,000 steps in a day.', progress: 1, unlockedAt: 'Jul 2026' },
  { id: 'a-crew', kind: 'crew', name: 'Crew Player', description: 'Join 3 crews.', progress: 0.33 },
  { id: 'a-yoga', kind: 'yoga', name: 'Zen Mode', description: 'Attend 5 yoga sessions.', progress: 0.6 },
  { id: 'a-lift', kind: 'lifter', name: 'Iron Squirrel', description: 'Log 20 strength workouts.', progress: 0.45 },
  { id: 'a-explore', kind: 'explorer', name: 'Explorer', description: 'Check in at 10 spots.', progress: 0.3 },
  { id: 'a-social', kind: 'social', name: 'Hype Machine', description: 'Give 100 likes.', progress: 0.82 },
  { id: 'a-half', kind: 'half-marathon', name: 'Half Marathon', description: 'Run 21.1 km in one go.', progress: 0.15 },
];

export type LevelReward = { level: number; kind: RewardArtKind; title: string; subtitle: string };

export const levelRewards: LevelReward[] = [
  { level: 13, kind: 'outfit', title: 'New Outfit', subtitle: 'Night Shift Hoodie' },
  { level: 13, kind: 'badge', title: 'City Badge', subtitle: 'Your city, your crown' },
  { level: 13, kind: 'stickers', title: 'Sticker Pack', subtitle: '3 neon stickers' },
  { level: 14, kind: 'coins', title: '500 Coins', subtitle: 'Spend them in the Shop' },
  { level: 15, kind: 'trail', title: 'Neon Trail Effect', subtitle: 'Leave a glow on every run' },
  { level: 16, kind: 'chest', title: 'Mystery Chest', subtitle: 'Epic cosmetic inside' },
  { level: 18, kind: 'outfit', title: 'Sunset Hoodie', subtitle: 'Legendary outfit' },
];
