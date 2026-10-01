import { useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '@/api/campus';
import { getNotifications, markNotificationsRead } from '@/api/campus/poke';
import { EmptyNote, ErrorState, LoadingRows } from '@/components/campus/States';
import { PokeNotificationCard } from '@/components/social/PokeNotificationCard';
import { useCampus, useRealtime, useRefreshOnFocus } from '@/hooks/useCampus';
import { setUnread } from '@/state/socialStore';
import { router } from 'expo-router';
import { Header, Screen } from '@/components/ui';
import { colors, fonts } from '@/theme';

const styles = StyleSheet.create({
  section: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
});

/**
 * Notifications: pokes (with POKE BACK), friendships and campus events from the backend. Without a
 * campus backend the list says "Not live yet" — there are no sample notifications.
 */
export default function Notifications() {
  return <CampusNotifications />;
}

function CampusNotifications() {
  const r = useCampus<{ items: AppNotification[]; unread: number }>('notifications', () => getNotifications());
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
  const items = r.data?.items ?? [];
  // People first (pokes, friendships, shared ground, Squirrel Dates); everything campus after.
  const PEOPLE = new Set(['poke', 'friendship', 'shared_zone', 'date_suggestion']);
  const pokes = items.filter((n) => PEOPLE.has(n.type));
  const rest = items.filter((n) => !PEOPLE.has(n.type));
  return (
    <Screen tabBar={false} scroll={false}>
      <Header back title="Notifications" />
      <FlatList
        data={[...pokes, ...rest]}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ gap: 10, paddingTop: 10, paddingBottom: 40 }}
        ListHeaderComponent={pokes.length ? <Text style={styles.section}>People</Text> : null}
        renderItem={({ item, index }) => (
          <View>
            {index === pokes.length && rest.length > 0 && <Text style={[styles.section, { marginTop: 8, marginBottom: 10 }]}>Campus</Text>}
            <PokeNotificationCard n={item} />
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
