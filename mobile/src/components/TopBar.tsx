import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { Coins, Icon, IconButton, LevelBadge, ProgressBar, tap } from '@/components/ui';
import { useApp, XP_PER_LEVEL } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

/** Home/tab top bar: avatar + level/XP, coins, notifications. */
export function TopBar() {
  const { me, level, levelXp, coins } = useApp();
  return (
    <View style={styles.row}>
      <Pressable onPress={() => { tap(); router.push('/profile'); }} style={styles.me}>
        <Avatar user={me} size={42} link={false} />
        <View style={{ marginLeft: 8, width: 86 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LevelBadge level={level} size="sm" />
            <Text style={styles.lv}>LV {level}</Text>
          </View>
          <ProgressBar progress={levelXp / XP_PER_LEVEL} color={colors.primary} color2={colors.violet} height={4} style={{ marginTop: 5 }} />
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => { tap(); router.push('/shop'); }} style={styles.coins} accessibilityLabel="Coins, open shop">
          <Coins amount={coins} size={14} />
        </Pressable>
        <IconButton icon="bell-outline" badge={3} size={20} onPress={() => router.push('/notifications')} label="Notifications" />
      </View>
    </View>
  );
}

/** Tappable "📍 Pune ▾" chip that opens the city picker. */
export function CityChip() {
  const { city } = useApp();
  return (
    <Pressable onPress={() => { tap(); router.push('/city'); }} style={styles.city} accessibilityLabel={`City: ${city.name}. Change city`}>
      <Icon name="map-marker" size={14} color={colors.secondary} />
      <Text style={styles.cityText} numberOfLines={1}>{city.name}</Text>
      <Icon name="chevron-down" size={14} color={colors.dim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  me: { flexDirection: 'row', alignItems: 'center' },
  lv: { color: colors.text, fontFamily: fonts.display, fontSize: 15, letterSpacing: 0.5 },
  city: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(53,223,255,0.08)', borderWidth: 1, borderColor: 'rgba(53,223,255,0.25)', flexShrink: 1 },
  cityText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 12, maxWidth: 110 },
  coins: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(255,212,59,0.08)', borderWidth: 1, borderColor: 'rgba(255,212,59,0.25)' },
});
