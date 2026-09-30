/** A notification row: pokes get POKE BACK, friendships get VIEW PROFILE, others link through. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { AppNotification } from '@/api/campus/types';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { shortTime } from '@/components/campus/territoryUi';
import { PokeButton } from '@/components/social/PokeButton';
import { Icon } from '@/components/ui';
import { alpha, colors, fonts, radius } from '@/theme';
import { useLocks } from '@/components/Locked';

const ICON: Record<string, { icon: React.ComponentProps<typeof Icon>['name']; color: string }> = {
  poke: { icon: 'hand-wave', color: colors.secondary },
  friendship: { icon: 'account-heart', color: colors.primary },
  territory: { icon: 'shield-alert', color: colors.gold },
  invite: { icon: 'sword-cross', color: colors.secondary },
  event: { icon: 'calendar-star', color: colors.violet },
  study_break: { icon: 'coffee-outline', color: colors.secondary },
  meetup_rating: { icon: 'star-outline', color: colors.primary },
  media: { icon: 'image-check-outline', color: colors.violet },
  ambassador: { icon: 'star-four-points-outline', color: colors.violet },
  shared_zone: { icon: 'map-marker-radius', color: colors.primary },
  date_suggestion: { icon: 'map-marker-account-outline', color: colors.secondary },
};

export function PokeNotificationCard({ n }: { n: AppNotification }) {
  const locks = useLocks();
  const ui = ICON[n.type] ?? { icon: 'bell-outline' as const, color: colors.dim };
  const open = () => {
    const d = n.data ?? {};
    if (n.type === 'shared_zone' && d.user_id) router.push({ pathname: '/shared/[id]', params: { id: d.user_id } });
    else if (n.type === 'meetup_rating' && d.meetup_id) router.push({ pathname: '/meetup/[id]', params: { id: d.meetup_id } });
    else if (n.type === 'ambassador') router.push('/ambassador');
    else if (n.type === 'date_suggestion') router.push('/social');
    else if (d.user_id) router.push({ pathname: '/user/[id]', params: { id: d.user_id } });
    else if (d.zone_id) router.push({ pathname: '/zone/[id]', params: { id: d.zone_id } });
    else if (d.invite_id) router.push('/invites');
    else if (d.event_id) locks.guard('events', () => router.push({ pathname: '/event/[id]', params: { id: d.event_id! } }))();
  };
  return (
    <View style={[styles.row, !n.read && styles.unread]}>
      <Pressable onPress={open} style={styles.main} accessibilityRole="button" accessibilityLabel={`${n.text}, ${shortTime(n.created_at)}${n.read ? '' : ', unread'}`}>
        <View>
          {n.actor ? <PersonAvatar person={n.actor} size={44} link={false} /> : <View style={[styles.icon, { backgroundColor: `${ui.color}22` }]} />}
          <View style={[styles.kind, { backgroundColor: ui.color }]}>
            <Icon name={ui.icon} size={11} color={colors.onPrimary} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>{n.text}</Text>
          <Text style={styles.time}>{shortTime(n.created_at)}</Text>
        </View>
        {!n.read && <View style={styles.dot} accessibilityElementsHidden />}
      </Pressable>
      {n.type === 'poke' && n.actor && <PokeButton user={n.actor} size="sm" />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  unread: { borderColor: alpha(colors.primary, 0.35) },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22 },
  kind: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  text: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  time: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
