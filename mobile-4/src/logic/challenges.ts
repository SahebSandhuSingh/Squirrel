import type { IconName } from '@/data/icons';

/**
 * Challenges, modelled on the Run Module backend (assessment §4.3): progress is derived
 * from real activity in a time window and rewards are awarded automatically when a
 * resolution job runs — there is no manual claim. Every challenge comes from the progress-service
 * (there are no sample challenges).
 */
export type ChallengeKind = 'daily' | 'head-to-head' | 'group' | 'special';

export type Challenge = {
  id: string;
  kind: ChallengeKind;
  title: string;
  metric: 'km' | 'steps' | 'minutes' | 'km2' | 'workouts';
  icon: IconName;
  mine: number;
  goal?: number;
  /** For head-to-head: the opponent's figure. */
  opponent?: { userId: string; value: number; name?: string | null };
  /** For group: the group's combined total. */
  group?: { name: string; value: number; members: number };
  xp: number;
  endsInMin: number;
  /** The progress-service fields (every challenge has them). */
  live?: {
    description: string;
    joined: boolean;
    canJoin: boolean;
    invited: boolean;
    /** upcoming | active | completed | ended | cancelled — as this user sees it. */
    status: string;
    /** This user's participant state: invited | active | completed | left | won | lost | tied | failed | cancelled. */
    mine: string | null;
    completed: boolean;
    closedReason: string | null;
    ineligible: { code: string; detail: string } | null;
    winnerUserId: string | null;
    xpTie?: number;
    participants: number;
    maxParticipants: number | null;
    minLevel?: number;
  };
};


export const fmtMetric = (v: number, m: Challenge['metric']) =>
  m === 'km'
    ? `${v.toFixed(1)} km`
    : m === 'km2'
      ? `${v.toFixed(1)} km²`
      : m === 'steps'
        ? Math.round(v).toLocaleString('en-IN')
        : m === 'workouts'
          ? `${Math.round(v)} workout${Math.round(v) === 1 ? '' : 's'}`
          : `${Math.round(v)} min`;

export const fmtEnds = (min: number) => (min < 60 ? `${min}m left` : min < 1440 ? `${Math.floor(min / 60)}h ${min % 60}m left` : `${Math.floor(min / 1440)}d left`);
