/**
 * Backend notification events. Persisted per user and pushed over realtime as notification.created.
 * Delivery channels (push, email) are out of scope; a delivery worker can consume this table.
 */
import { one, many, query, type Queryable, getPool } from '../db/pool.js';
import { publish } from '../realtime/bus.js';
import { getPersonLite } from '../users/repo.js';
import { isBlockedEitherWay } from '../blocks/service.js';

export type NotificationType =
  | 'territory.stolen' | 'territory.challenged' | 'territory.defended' | 'zone.claimed'
  | 'challenge.invitation' | 'challenge.reminder' | 'challenge.updated'
  | 'event.reminder' | 'meetup.check_in' | 'meetup.invited' | 'meetup.accepted' | 'meetup.declined' | 'meetup.cancelled'
  | 'activity.verification_complete';

export type NotificationRow = {
  id: string; user_id: string; type: string; actor_id: string | null; text: string; data: Record<string, unknown> | null; read: boolean; created_at: string;
};

export async function notify(userId: string, type: NotificationType, text: string, data: Record<string, unknown> = {}, actorId: string | null = null, q: Queryable = getPool()) {
  if (actorId && actorId === userId) return null; // never notify people about their own actions
  const row = await one<NotificationRow>(
    `INSERT INTO notifications (user_id, type, actor_id, text, data) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, type, actorId, text, data], q,
  );
  if (row) {
    const actor = await getPersonLite(actorId, q);
    publish({ type: 'notification.created', user_ids: [userId], data: { ...toApp(row), actor } });
  }
  return row;
}

/** Shape expected by the mobile client's AppNotification. Types are mapped to its coarse categories. */
export function toApp(n: NotificationRow) {
  const category = n.type.startsWith('territory') || n.type.startsWith('zone') ? 'territory' : n.type.startsWith('challenge') ? 'invite' : n.type.startsWith('event') || n.type.startsWith('meetup') ? 'event' : n.type;
  return { id: n.id, type: category, backend_type: n.type, actor: null as unknown, text: n.text, created_at: n.created_at, read: n.read, data: n.data };
}

export async function listNotifications(userId: string, limit = 50) {
  const rows = await many<NotificationRow>(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  const unreadRows = await many<NotificationRow>(`SELECT * FROM notifications WHERE user_id = $1 AND NOT read ORDER BY created_at DESC`, [userId]);
  const visible = async (n: NotificationRow) => {
    if (!n.type.startsWith('meetup.') || typeof n.data?.meetup_id !== 'string') return true;
    const parts = await many<{ user_id: string }>(`SELECT user_id FROM meetup_participants WHERE meetup_id = $1`, [n.data.meetup_id]);
    for (const p of parts) if (p.user_id !== userId && await isBlockedEitherWay(userId, p.user_id)) return false;
    return true;
  };
  const [shown, shownUnread] = await Promise.all([
    Promise.all(rows.map(async (n) => await visible(n) ? n : null)),
    Promise.all(unreadRows.map(async (n) => await visible(n) ? n : null)),
  ]);
  return { rows: shown.filter((n): n is NotificationRow => n !== null), unread: shownUnread.filter((n) => n !== null).length };
}

export async function markRead(userId: string, ids: string[]) {
  if (ids.length) await query(`UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2::uuid[])`, [userId, ids]);
  const unread = await one<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT read`, [userId]);
  return unread?.n ?? 0;
}
