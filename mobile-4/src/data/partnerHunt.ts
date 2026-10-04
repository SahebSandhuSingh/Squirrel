import type { LibraryExercise } from '@/data/exercises';
import type { IconName } from '@/data/icons';
import type { AvatarLook } from '@/types';

/**
 * PARTNER HUNT: find a workout buddy. Locked (see LOCKED.partnerHunt); this file holds
 * only the shape of the future feature. There is no matching logic and no buddy data.
 *
 * Future flow: Partner Hunt → Find your buddy → Preferences → Matching → Buddy profiles → Connect.
 * Matching reuses what the app already knows: the user's campus (City.campus), interests
 * (the crew interest types), activities (runs + the exercise library), availability and goals.
 */

export type PartnerHuntStep = { id: 'find' | 'preferences' | 'matching' | 'profiles' | 'connect'; title: string; body: string; icon: IconName };

export const PARTNER_HUNT_FLOW: PartnerHuntStep[] = [
  { id: 'find', title: 'Find your buddy', body: 'Say you’re up for a training partner.', icon: 'account-search-outline' },
  { id: 'preferences', title: 'Set your vibe', body: 'Campus, interests, when you train, what you’re chasing.', icon: 'tune-variant' },
  { id: 'matching', title: 'Get matched', body: 'We line you up with people who move like you.', icon: 'lightning-bolt' },
  { id: 'profiles', title: 'Check buddy profiles', body: 'Levels, streaks and favourite workouts.', icon: 'card-account-details-outline' },
  { id: 'connect', title: 'Connect & train', body: 'Say hi, plan a session, earn XP together.', icon: 'handshake-outline' },
];

/** What matching will be based on. */
export type MatchFactor = { id: 'campus' | 'interests' | 'activities' | 'availability' | 'goals'; label: string; icon: IconName };
export const MATCH_FACTORS: MatchFactor[] = [
  { id: 'campus', label: 'Campus', icon: 'school-outline' },
  { id: 'interests', label: 'Interests', icon: 'heart-outline' },
  { id: 'activities', label: 'Activities', icon: 'run-fast' },
  { id: 'availability', label: 'Availability', icon: 'calendar-clock' },
  { id: 'goals', label: 'Goals', icon: 'flag-checkered' },
];

export type Availability = 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'weekend';
export type FitnessGoal = 'consistency' | 'strength' | 'endurance' | 'weight' | 'fun';

/** The user's Partner Hunt preferences (future: stored on the user profile). */
export type PartnerPreferences = {
  campus: string; // City.campus
  interests: ('running' | 'yoga' | 'nutrition' | 'cycling' | 'hiit' | 'walking' | 'climbing')[];
  activities: ('run' | LibraryExercise['slug'])[];
  availability: Availability[];
  goals?: FitnessGoal[];
};

/** A buddy card, built from an existing user profile plus their preferences. */
export type BuddyProfile = { id: string; name: string; look: AvatarLook | null; level: number | null; tags: string[] } & {
  preferences: PartnerPreferences;
  /** 0..1, from the future matching service. */
  match?: number;
};

export type ConnectionStatus = 'none' | 'requested' | 'connected';
