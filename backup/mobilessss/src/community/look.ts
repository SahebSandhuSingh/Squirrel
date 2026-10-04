/**
 * How crews and events from the Social service look: the illustrated scene, icon and colour come
 * from their interest (the server stores none of that), and they map onto the demo `Crew` /
 * `EventItem` shapes so the existing cards render them.
 */
import type { CrewOut, EventOut, Interest } from '@/api/community';
import type { Crew, EventItem } from '@/data/community';
import type { IconName } from '@/data/icons';
import type { SceneKind } from '@/types';
import { toAvatarUser } from '@/components/socialParts';
import type { AvatarUser } from '@/components/Avatar';

type Look = { icon: IconName; color: string; scene: SceneKind; label: string };

export const INTEREST_LOOK: Record<Interest, Look> = {
  running: { icon: 'run-fast', color: '#3DF0A0', scene: 'run', label: 'Running' },
  walking: { icon: 'walk', color: '#3DF0A0', scene: 'city-dawn', label: 'Walking' },
  cycling: { icon: 'bike', color: '#A855F7', scene: 'cycling', label: 'Cycling' },
  yoga: { icon: 'yoga', color: '#FF8A00', scene: 'yoga', label: 'Yoga' },
  hiit: { icon: 'lightning-bolt', color: '#D7FF1F', scene: 'hiit', label: 'HIIT' },
  climbing: { icon: 'stairs-up', color: '#5FB8FF', scene: 'stadium', label: 'Stairs & climbing' },
  nutrition: { icon: 'food-apple', color: '#5FB8FF', scene: 'brunch', label: 'Nutrition' },
  other: { icon: 'account-group', color: '#FF2D9B', scene: 'crew', label: 'Anything' },
};

export const INTERESTS = Object.keys(INTEREST_LOOK) as Interest[];
export const INTEREST_ICONS = Object.fromEntries(INTERESTS.map((i) => [i, INTEREST_LOOK[i].icon])) as Record<Interest, IconName>;

const DEMO_INTEREST: Record<Interest, Crew['interest']> = {
  running: 'running', walking: 'walking', cycling: 'cycling', yoga: 'yoga', hiit: 'hiit', climbing: 'climbing', nutrition: 'nutrition', other: 'walking',
};

/** A server crew as the demo `Crew` the cards take; `members` are the avatars to show. */
export function crewCard(c: CrewOut): { crew: Crew; members: AvatarUser[] } {
  const look = INTEREST_LOOK[c.interest] ?? INTEREST_LOOK.other;
  return {
    crew: {
      id: c.id,
      cityId: null,
      name: c.name,
      members: c.members_count,
      scope: c.scope === 'online' ? 'Online' : 'Campus',
      interest: DEMO_INTEREST[c.interest] ?? 'walking',
      icon: look.icon,
      color: look.color,
      scene: look.scene,
      tagline: c.tagline,
      meets: c.meets,
      memberIds: [],
    },
    members: c.preview.map((u) => toAvatarUser(u)),
  };
}

/** A server event as the demo `EventItem` the cards take. `going` excludes me: the cards add me back. */
export function eventCard(e: EventOut): { event: EventItem; attendees: AvatarUser[] } {
  const look = INTEREST_LOOK[e.kind] ?? INTEREST_LOOK.other;
  return {
    event: {
      id: e.id,
      cityId: null,
      title: e.title,
      venue: e.online ? 'Online' : e.venue || 'Place to be announced',
      startsAt: e.starts_at,
      online: e.online,
      going: Math.max(0, e.going_count - (e.my_rsvp === 'going' ? 1 : 0)),
      attendeeIds: [],
      scene: look.scene,
      icon: look.icon,
      xp: 0,
      host: e.crew ? e.crew.name : e.host.display_name,
      description: e.description,
    },
    attendees: e.attendees.map((u) => toAvatarUser(u)),
  };
}

/** "Member since Sep 2026". */
export const memberSince = (iso: string) =>
  `Member since ${new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;

export const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
