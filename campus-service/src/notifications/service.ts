/** Forward campus notifications to Social, the owner of the in-app list and push delivery. */
import { createHash } from 'node:crypto';
import { publish } from '../realtime/bus.js';
import { postSocialNotification } from '../identity/index.js';

export type NotificationType =
  | 'territory.stolen' | 'territory.challenged' | 'territory.defended' | 'zone.claimed'
  | 'challenge.invitation' | 'challenge.reminder' | 'challenge.updated'
  | 'event.reminder' | 'meetup.check_in' | 'meetup.invited' | 'meetup.accepted' | 'meetup.declined' | 'meetup.cancelled'
  | 'activity.verification_complete';

export function campusNotificationDedupeKey(type: NotificationType, sourceId: string, recipientId: string, transition = ''): string {
  const digest = createHash('sha256').update(`${type}\0${sourceId}\0${recipientId}\0${transition}`).digest('hex');
  return `campus:${type}:${digest}`;
}

function routeFor(type: NotificationType, data: Record<string, unknown>): string {
  if (typeof data.route === 'string' && data.route.startsWith('/')) return data.route;
  if (typeof data.zone_id === 'string') return `/zone/${encodeURIComponent(data.zone_id)}`;
  if (typeof data.crew_id === 'string') return `/crew/${encodeURIComponent(data.crew_id)}`;
  if (typeof data.meetup_id === 'string') return `/meetup/${encodeURIComponent(data.meetup_id)}`;
  if (type.startsWith('challenge.')) return '/invites';
  return '/notifications';
}

function appCategory(type: NotificationType): string {
  if (type.startsWith('territory.') || type.startsWith('zone.')) return 'territory';
  if (type.startsWith('challenge.')) return 'invite';
  if (type.startsWith('meetup.') || type.startsWith('event.')) return 'event';
  return type;
}

/** Best-effort Social delivery: a missing/down Social never rolls back the campus action. */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string | null,
  data: Record<string, unknown>,
  actorId: string | null,
  dedupeKey: string,
) {
  const routedData = { ...data, route: routeFor(type, data) };
  const result = await postSocialNotification({
    user_subject: userId,
    kind: type,
    ...(actorId && actorId !== userId ? { actor_subject: actorId } : {}),
    title,
    ...(body === null ? {} : { body }),
    actor_fallback: 'Someone',
    data: routedData,
    dedupe_key: dedupeKey,
  });

  // The app consumes this shape immediately, then reconciles it from Social's list. Never publish
  // an id Social did not return, or replay a duplicate event when dedupe_key already existed.
  if (result?.created && result.notification_id) {
    const text = body ? `${title} · ${body}` : title;
    publish({
      type: 'notification.created',
      user_ids: [userId],
      data: {
        id: result.notification_id,
        type: appCategory(type),
        actor: null,
        text,
        created_at: new Date().toISOString(),
        read: false,
        data: routedData,
      },
    });
  }
  return result;
}
