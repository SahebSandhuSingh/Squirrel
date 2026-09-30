import type { IconName } from '@/data/icons';

/**
 * Challenges, modelled on the Run Module backend (assessment §4.3): progress is derived
 * from real activity in a time window and rewards are awarded automatically when a
 * resolution job runs — there is no manual claim. Missions (tap-to-log, claim) remain a
 * separate, frontend-only feature until the company decides whether to merge them.
 */
export type ChallengeKind = 'daily' | 'head-to-head' | 'group';

export type Challenge = {
  id: string;
  kind: ChallengeKind;
  title: string;
  metric: 'km' | 'steps' | 'minutes' | 'km2';
  icon: IconName;
  mine: number;
  goal?: number;
  /** For head-to-head: the opponent's figure. */
  opponent?: { userId: string; value: number };
  /** For group: the group's combined total. */
  group?: { name: string; value: number; members: number };
  xp: number;
  endsInMin: number;
};

export const challenges: Challenge[] = [
  { id: 'c-daily-5k', kind: 'daily', title: 'Run 5 km today', metric: 'km', icon: 'run-fast', mine: 3.4, goal: 5, xp: 60, endsInMin: 312 },
  { id: 'c-daily-steps', kind: 'daily', title: '10,000 steps', metric: 'steps', icon: 'shoe-print', mine: 7812, goal: 10000, xp: 40, endsInMin: 312 },
  { id: 'c-h2h-rhea', kind: 'head-to-head', title: 'Most km this week', metric: 'km', icon: 'sword-cross', mine: 18.4, opponent: { userId: 'u_rhea', value: 21.1 }, xp: 150, endsInMin: 3 * 1440 + 200 },
  { id: 'c-h2h-dev', kind: 'head-to-head', title: 'Most territory today', metric: 'km2', icon: 'map-marker-radius', mine: 0.6, opponent: { userId: 'u_dev', value: 0.4 }, xp: 100, endsInMin: 312 },
  { id: 'c-group-runners', kind: 'group', title: 'Runners: 500 km this month', metric: 'km', icon: 'account-group', mine: 22.6, goal: 500, group: { name: 'City Runners', value: 341, members: 42 }, xp: 250, endsInMin: 6 * 1440 },
  { id: 'c-group-early', kind: 'group', title: 'Early Birds: 1,000 active minutes', metric: 'minutes', icon: 'weather-sunset-up', mine: 96, goal: 1000, group: { name: 'Early Birds', value: 812, members: 28 }, xp: 180, endsInMin: 2 * 1440 },
];

export const fmtMetric = (v: number, m: Challenge['metric']) =>
  m === 'km' ? `${v.toFixed(1)} km` : m === 'km2' ? `${v.toFixed(1)} km²` : m === 'steps' ? v.toLocaleString('en-IN') : `${v} min`;

export const fmtEnds = (min: number) => (min < 60 ? `${min}m left` : min < 1440 ? `${Math.floor(min / 60)}h ${min % 60}m left` : `${Math.floor(min / 1440)}d left`);
