import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { FadeIn, Header, Icon, PressScale, Screen } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { userById } from '@/data/users';
import { colors, fonts, radius } from '@/theme';

type Note = { id: string; user?: string; icon: IconName; color: string; text: string; time: string; go: Href; unread?: boolean };

const NOTES: Note[] = [
  { id: 'n1', user: 'u_rhea', icon: 'heart', color: colors.primary, text: 'Rhea and 23 others liked your run', time: '2m', go: '/profile', unread: true },
  { id: 'n2', icon: 'trophy', color: colors.gold, text: 'You reached Level 13 · 3 rewards to open', time: '1h', go: '/level-up', unread: true },
  { id: 'n3', user: 'u_meera', icon: 'calendar-star', color: colors.violet, text: 'Meera invited you to Yoga in the Park', time: '3h', go: '/events', unread: true },
  { id: 'n4', user: 'u_zoya', icon: 'account-plus', color: colors.secondary, text: 'Zoya started following you', time: '5h', go: { pathname: '/user/[id]', params: { id: 'u_zoya' } } },
  { id: 'n5', icon: 'fire', color: colors.orange, text: '12-day streak! Keep it alive with a 10-minute walk', time: '8h', go: '/missions' },
  { id: 'n6', user: 'u_aarav', icon: 'comment', color: colors.primary, text: 'Aarav commented: "that pace though 🔥"', time: '1d', go: '/social' },
  { id: 'n7', icon: 'shopping', color: colors.gold, text: 'New drop in the Shop: Sunset Collection', time: '2d', go: '/shop' },
];

export default function Notifications() {
  return (
    <Screen tabBar={false}>
      <Header back title="Notifications" />
      <View style={{ gap: 10, marginTop: 10 }}>
        {NOTES.map((n, i) => (
          <FadeIn key={n.id} index={i}>
            <PressScale onPress={() => router.push(n.go)} style={[styles.row, n.unread && { borderColor: 'rgba(255,107,0,0.35)' }]}>
              {n.user ? (
                <Avatar user={userById(n.user)} size={44} link={false} />
              ) : (
                <View style={[styles.icon, { backgroundColor: `${n.color}22` }]}>
                  <Icon name={n.icon} size={22} color={n.color} />
                </View>
              )}
              <Text style={styles.text}>{n.text}</Text>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.time}>{n.time}</Text>
                {n.unread && <View style={styles.dot} />}
              </View>
            </PressScale>
          </FadeIn>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, color: colors.sub, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  time: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
