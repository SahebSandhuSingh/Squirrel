/**
 * Display helpers for social posts. The posts themselves come from the Social service
 * (src/api/social.ts); feed filtering is done server-side.
 */
import type { Activity, FeedKind, Post, PostSticker } from '@/api/social';
import type { IconName } from '@/data/icons';

export type { Activity, Post, PostSticker };

/** Feed tabs as labelled in the UI, mapped to the API's `feed` parameter. */
export type Feed = 'For You' | 'Following' | 'Nearby';
export const FEEDS: readonly Feed[] = ['For You', 'Following', 'Nearby'];
export const FEED_KIND: Record<Feed, FeedKind> = { 'For You': 'for_you', Following: 'following', Nearby: 'nearby' };

export const POST_STICKERS: PostSticker[] = ['one-more-km', 'fire', 'good-vibes', 'neon-heart', 'squirrel-flex', 'hydrate'];

/** "2h ago" from an ISO timestamp. */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  const d = Math.floor(minutes / 1440);
  return d === 1 ? 'Yesterday' : `${d}d ago`;
}

const ICONS: Record<Activity['type'], IconName> = { run: 'run-fast', ride: 'bike', workout: 'arm-flex', yoga: 'yoga', meal: 'food-apple' };

const join = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' · ');

/** Chip text on the post image: "7.2 km · 41 min · 5'42"/km". */
export const describeActivity = (a: Activity): { icon: IconName; text: string } => {
  const km = a.distance_km != null ? `${a.distance_km} km` : null;
  const min = a.duration_minutes != null ? `${a.duration_minutes} min` : null;
  switch (a.type) {
    case 'run':
      return { icon: ICONS.run, text: join(km, min, a.pace && `${a.pace}/km`) || 'Run' };
    case 'ride':
      return { icon: ICONS.ride, text: join(km, min) || 'Ride' };
    case 'workout':
      return { icon: ICONS.workout, text: join(a.name ?? 'Workout', min, a.calories != null && `${a.calories} kcal`) };
    case 'yoga':
      return { icon: ICONS.yoga, text: join('Yoga', min) };
    case 'meal':
      return { icon: ICONS.meal, text: a.name ?? 'Meal' };
  }
};

/** A one-line activity summary for a post ("ran 5.1 km · 32 min"), falling back to its caption. */
export function activityLine(p: Post): { icon: IconName; text: string } {
  const a = p.activity;
  if (!a) return { icon: 'image-outline', text: p.caption };
  const icon = ICONS[a.type];
  const km = a.distance_km != null ? `${a.distance_km} km` : null;
  const min = a.duration_minutes != null ? `${a.duration_minutes} min` : null;
  switch (a.type) {
    case 'run':
      return { icon, text: `ran ${join(km, min) || 'a run'}` };
    case 'ride':
      return { icon, text: `rode ${join(km, min) || 'a ride'}` };
    case 'workout':
      return { icon, text: `did ${join(a.name ?? 'a workout', min)}` };
    case 'yoga':
      return { icon, text: min ? `did ${min} of yoga` : 'did yoga' };
    case 'meal':
      return { icon, text: `shared ${a.name ?? 'a meal'}` };
  }
}
