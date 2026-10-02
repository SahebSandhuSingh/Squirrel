import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { campusApi, type AppNotification } from '@/api/campus';
import { getNotifications, markNotificationsRead } from '@/api/campus/poke';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { EmptyNote, ErrorState, LoadingRows } from '@/components/campus/States';
import { shortTime } from '@/components/campus/territoryUi';
import { useLocks } from '@/components/Locked';
import { PokeButton } from '@/components/social/PokeButton';
import { useCampus, useRealtime, useRefreshOnFocus } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { setUnread } from '@/state/socialStore';
import { Button, Header, Icon, Screen } from '@/components/ui';
import { alpha, colors, fonts, radius } from '@/theme';

type IconName = React.ComponentProps<typeof Icon>['name'];
type Kind = { icon: IconName; color: string; label?: string };

// Every type the Social service (via api/campus/socialAdapter.ts) or the campus backend sends.
const KIND: Record<string, Kind> = {
  poke: { icon: 'hand-wave', color: colors.secondary },
  friendship: { icon: 'account-heart', color: colors.primary },
  territory: { icon: 'shield-alert', color: colors.gold, label: 'Territory alert' },
  invite: { icon: 'sword-cross', color: colors.secondary, label: 'Challenge' },
  event: { icon: 'calendar-star', color: colors.violet },
  badge: { icon: 'medal-outline', color: colors.gold },
  checkin: { icon: 'map-marker-check-outline', color: colors.green },
  crew: { icon: 'account-group', color: colors.blue },
  comment: { icon: 'comment-text-outline', color: colors.blue },
  like: { icon: 'heart', color: colors.pink },
  study_break: { icon: 'coffee-outline', color: colors.secondary },
  meetup_rating: { icon: 'star-outline', color: colors.primary },
  media: { icon: 'image-check-outline', color: colors.violet },
  ambassador: { icon: 'star-four-points-outline', color: colors.violet },
  shared_zone: { icon: 'map-marker-radius', color: colors.primary },
  date_suggestion: { icon: 'map-marker-account-outline', color: colors.secondary },
};
const FALLBACK: Kind = { icon: 'bell-outline', color: colors.dim };

/** Territory FOMO alerts arrive as one type; the wording tells lost / captured / expiring apart. */
function territoryKind(text: string): Kind {
  if (/\b(lost|stolen)\b|\b(captured|took|taken|stole|claimed)\s+(your|from you)/i.test(text)) return { icon: 'shield-off-outline', color: colors.coral, label: 'Zone lost' };
  if (/\b(expir|fading|decay|about to)/i.test(text)) return { icon: 'timer-sand', color: colors.orange, label: 'Zone expiring' };
  if (/\b(captur|claimed|conquer)/i.test(text)) return { icon: 'flag-checkered', color: colors.primary, label: 'Zone captured' };
  return KIND.territory;
}

const kindOf = (n: AppNotification): Kind => (n.type === 'territory' ? territoryKind(n.text) : KIND[n.type] ?? FALLBACK);

/**
 * Notifications: pokes (with POKE BACK), friendships, territory alerts and campus activity from the
 * backend. Without a backend the list says "Not live yet" — there are no sample notifications.
 */
export default function Notifications() {
  return <CampusNotifications />;
}

function CampusNotifications() {
  const { toast } = useApp();
  const r = useCampus<{ items: AppNotification[]; unread: number }>('notifications', () => getNotifications());
  const [markingAll, setMarkingAll] = useState(false);
  useRefreshOnFocus(r.reload, 20_000);
  useRealtime((m) => {
    if (m.type === 'notification.created' && r.data) r.mutate({ items: [m.data, ...r.data.items.filter((n) => n.id !== m.data.id)], unread: r.data.unread + 1 });
  });
  // Opening the list marks what you've seen as read (the backend keeps the truth).
  const unreadIds = (r.data?.items ?? []).filter((n) => !n.read).map((n) => n.id).join(',');
  useEffect(() => {
    if (!unreadIds) {
      if (r.data) setUnread(0);
      return;
    }
    const t = setTimeout(() => {
      markNotificationsRead(unreadIds.split(','))
        .then((x) => setUnread(x.unread))
        .catch(() => undefined);
    }, 1200);
    return () => clearTimeout(t);
  }, [unreadIds, r.data]);

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const x = await campusApi.markNotificationsRead([]); // empty = all
      setUnread(x.unread);
      if (r.data) r.mutate({ items: r.data.items.map((n) => ({ ...n, read: true })), unread: x.unread });
    } catch {
      toast('Couldn’t mark as read — try again', 'alert-circle-outline', colors.coral);
    } finally {
      setMarkingAll(false);
    }
  };

  const items = r.data?.items ?? [];
  const hasUnread = items.some((n) => !n.read) || (r.data?.unread ?? 0) > 0;
  // People first (pokes, friendships, shared ground, Squirrel Dates); everything campus after.
  const PEOPLE = new Set(['poke', 'friendship', 'shared_zone', 'date_suggestion']);
  const pokes = items.filter((n) => PEOPLE.has(n.type));
  const rest = items.filter((n) => !PEOPLE.has(n.type));
  return (
    <Screen tabBar={false} scroll={false}>
      <Header
        back
        title="Notifications"
        right={hasUnread ? <Button label="Mark all read" size="sm" variant="ghost" iconLeft="check-all" onPress={markAll} disabled={markingAll} /> : undefined}
      />
      <FlatList
        data={[...pokes, ...rest]}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ gap: 10, paddingTop: 10, paddingBottom: 40 }}
        ListHeaderComponent={pokes.length ? <Text style={styles.section}>People</Text> : null}
        renderItem={({ item, index }) => (
          <View>
            {index === pokes.length && rest.length > 0 && <Text style={[styles.section, { marginTop: 8, marginBottom: 10 }]}>Campus</Text>}
            <NotificationCard n={item} />
          </View>
        )}
        ListEmptyComponent={
          r.signedOut ? (
            <EmptyNote icon="account-lock-outline" title="Sign in to see notifications" action="Sign in" onAction={() => router.push('/sign-in')} />
          ) : r.error ? (
            <ErrorState cause={r.cause} onRetry={r.reload} feature="Notifications" />
          ) : r.loading ? (
            <LoadingRows rows={4} height={68} />
          ) : (
            <EmptyNote icon="bell-sleep-outline" title="All quiet" body="Pokes, new friends and territory alerts land here." action="Open the map" onAction={() => router.push('/explore')} />
          )
        }
      />
    </Screen>
  );
}

/** One row. Taps open `data.route` when the backend sent one, else route by type. */
function NotificationCard({ n }: { n: AppNotification }) {
  const locks = useLocks();
  const ui = kindOf(n);
  const territory = n.type === 'territory';
  const open = () => {
    const d = n.data ?? {};
    if (typeof d.route === 'string' && d.route.startsWith('/') && !d.route.startsWith('//')) router.push(d.route as Href);
    else if (n.type === 'shared_zone' && d.user_id) router.push({ pathname: '/shared/[id]', params: { id: d.user_id } });
    else if (n.type === 'meetup_rating' && d.meetup_id) router.push({ pathname: '/meetup/[id]', params: { id: d.meetup_id } });
    else if (n.type === 'ambassador') router.push('/ambassador');
    else if (n.type === 'date_suggestion') router.push('/social');
    else if (territory && d.zone_id) router.push({ pathname: '/zone/[id]', params: { id: d.zone_id } });
    else if (d.user_id) router.push({ pathname: '/user/[id]', params: { id: d.user_id } });
    else if (d.zone_id) router.push({ pathname: '/zone/[id]', params: { id: d.zone_id } });
    else if (d.invite_id) router.push('/invites');
    else if (d.event_id) locks.guard('events', () => router.push({ pathname: '/event/[id]', params: { id: d.event_id! } }))();
  };
  return (
    <View style={[styles.row, !n.read && styles.unread, territory && { borderColor: alpha(ui.color, n.read ? 0.4 : 0.8), backgroundColor: alpha(ui.color, 0.08), borderWidth: 1.5 }]}>
      <Pressable onPress={open} style={styles.main} accessibilityRole="button" accessibilityLabel={`${ui.label ? `${ui.label}. ` : ''}${n.text}, ${shortTime(n.created_at)}${n.read ? '' : ', unread'}`}>
        {n.actor && !territory ? (
          <View>
            <PersonAvatar person={n.actor} size={44} link={false} />
            <View style={[styles.kind, { backgroundColor: ui.color }]}>
              <Icon name={ui.icon} size={11} color={colors.onPrimary} />
            </View>
          </View>
        ) : (
          <View style={[styles.icon, { backgroundColor: alpha(ui.color, 0.16), borderColor: alpha(ui.color, 0.5) }]}>
            <Icon name={ui.icon} size={22} color={ui.color} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {territory && !!ui.label && <Text style={[styles.label, { color: ui.color }]}>{ui.label}</Text>}
          <Text style={[styles.text, territory && styles.textStrong]}>{n.text}</Text>
          <Text style={styles.time}>{shortTime(n.created_at)}</Text>
        </View>
        {!n.read && <View style={[styles.dot, territory && { backgroundColor: ui.color }]} accessibilityElementsHidden />}
      </Pressable>
      {n.type === 'poke' && n.actor && <PokeButton user={n.actor} size="sm" />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  unread: { borderColor: alpha(colors.primary, 0.35) },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kind: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  label: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  text: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  textStrong: { color: colors.text, fontFamily: fonts.semibold },
  time: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
