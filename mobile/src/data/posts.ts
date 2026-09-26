import type { SceneKind } from '@/types';

export type Activity =
  | { type: 'run'; km: number; minutes: number; pace: string }
  | { type: 'ride'; km: number; minutes: number }
  | { type: 'workout'; name: string; minutes: number; kcal: number }
  | { type: 'yoga'; minutes: number }
  | { type: 'meal'; name: string };

export type Post = {
  id: string;
  authorId: string;
  cityId: string;
  area: string;
  minutesAgo: number;
  caption: string;
  scene: SceneKind;
  seed: number;
  likes: number;
  comments: number;
  activity?: Activity;
  sticker?: 'one-more-km' | 'fire' | 'good-vibes' | 'neon-heart' | 'squirrel-flex' | 'hydrate';
  crewName?: string;
};

export const seedPosts: Post[] = [
  { id: 'p1', authorId: 'u_rhea', cityId: 'pune', area: 'Koregaon Park', minutesAgo: 120, caption: 'Morning run crew 🏃‍♀️🏃\nDiscipline over mood.', scene: 'run', seed: 3, likes: 241, comments: 12, activity: { type: 'run', km: 7.2, minutes: 41, pace: `5'42"` }, crewName: 'Pune Runners' },
  { id: 'p2', authorId: 'u_aarav', cityId: 'pune', area: 'Baner', minutesAgo: 240, caption: 'Post-workout happiness 💪', scene: 'gym', seed: 5, likes: 88, comments: 4, activity: { type: 'workout', name: 'Push day', minutes: 62, kcal: 480 }, sticker: 'squirrel-flex' },
  { id: 'p3', authorId: 'u_meera', cityId: 'pune', area: 'Aundh', minutesAgo: 300, caption: 'Golden hour flow with 24 of you. Same time Thursday? 🧘‍♀️', scene: 'yoga', seed: 8, likes: 412, comments: 37, activity: { type: 'yoga', minutes: 60 }, crewName: 'Yoga Vibes' },
  { id: 'p4', authorId: 'u_isha', cityId: 'pune', area: 'Kalyani Nagar', minutesAgo: 380, caption: 'Day 12 of no sugar and this bowl slaps. Recipe in comments 🥣', scene: 'brunch', seed: 2, likes: 199, comments: 58, activity: { type: 'meal', name: 'Açaí + granola bowl' }, sticker: 'good-vibes' },
  { id: 'p5', authorId: 'u_kabir', cityId: 'pune', area: 'Kothrud', minutesAgo: 600, caption: 'Night Riders did 42 km. City looked unreal tonight.', scene: 'cycling', seed: 11, likes: 156, comments: 14, activity: { type: 'ride', km: 42, minutes: 96 }, crewName: 'Pune Night Riders' },
  { id: 'p6', authorId: 'u_zoya', cityId: 'pune', area: 'Viman Nagar', minutesAgo: 720, caption: 'HIIT Takeover was LOUD. 26 legends, zero quitters. 🔥', scene: 'hiit', seed: 4, likes: 301, comments: 22, activity: { type: 'workout', name: 'HIIT', minutes: 45, kcal: 520 }, sticker: 'fire' },
  { id: 'p7', authorId: 'u_dev', cityId: 'pune', area: 'Hinjewadi', minutesAgo: 900, caption: '5:30 AM club. The lake was all ours.', scene: 'lake', seed: 6, likes: 74, comments: 5, activity: { type: 'run', km: 5.1, minutes: 30, pace: `5'53"` }, crewName: 'Early Birds' },
  { id: 'p8', authorId: 'u_aanya', cityId: 'pune', area: 'Koregaon Park', minutesAgo: 1440, caption: 'Just one more km turned into three. 😅', scene: 'city-sunset', seed: 9, likes: 322, comments: 19, activity: { type: 'run', km: 8.4, minutes: 52, pace: `6'11"` }, sticker: 'one-more-km' },
  { id: 'p9', authorId: 'u_neil', cityId: 'mumbai', area: 'Bandra', minutesAgo: 180, caption: 'Marine Drive never misses. 🌊', scene: 'run', seed: 14, likes: 530, comments: 41, activity: { type: 'run', km: 10.2, minutes: 55, pace: `5'23"` } },
  { id: 'p10', authorId: 'u_tara', cityId: 'bangalore', area: 'Indiranagar', minutesAgo: 420, caption: 'Rooftop stretch + filter coffee = perfect Sunday.', scene: 'rooftop', seed: 7, likes: 187, comments: 9, activity: { type: 'yoga', minutes: 35 } },
  { id: 'p11', authorId: 'u_sam', cityId: 'london', area: 'Shoreditch', minutesAgo: 540, caption: 'Canal miles in the rain. Worth it.', scene: 'city-night', seed: 12, likes: 612, comments: 33, activity: { type: 'run', km: 12, minutes: 63, pace: `5'15"` } },
  { id: 'p12', authorId: 'u_maya', cityId: 'nyc', area: 'Williamsburg', minutesAgo: 660, caption: 'Track day under the lights ⚡️', scene: 'stadium', seed: 10, likes: 448, comments: 27, activity: { type: 'workout', name: 'Intervals', minutes: 40, kcal: 390 } },
  { id: 'p13', authorId: 'u_rhea', cityId: 'pune', area: 'Koregaon Park', minutesAgo: 2000, caption: 'Crew brunch after the long run. We earned this 🥑', scene: 'cafe', seed: 13, likes: 265, comments: 18, crewName: 'Pune Runners' },
  { id: 'p14', authorId: 'u_zoya', cityId: 'pune', area: 'Viman Nagar', minutesAgo: 2600, caption: 'Rooftop session with the crew. Pune, you’re beautiful.', scene: 'crew', seed: 15, likes: 377, comments: 25 },
];

export const timeAgo = (minutes: number) => {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  const d = Math.floor(minutes / 1440);
  return d === 1 ? 'Yesterday' : `${d}d ago`;
};

export const describeActivity = (a: Activity) => {
  switch (a.type) {
    case 'run':
      return { icon: 'run-fast' as const, text: `${a.km} km · ${a.minutes} min · ${a.pace}/km` };
    case 'ride':
      return { icon: 'bike' as const, text: `${a.km} km · ${a.minutes} min` };
    case 'workout':
      return { icon: 'arm-flex' as const, text: `${a.name} · ${a.minutes} min · ${a.kcal} kcal` };
    case 'yoga':
      return { icon: 'yoga' as const, text: `Yoga · ${a.minutes} min` };
    case 'meal':
      return { icon: 'food-apple' as const, text: a.name };
  }
};
