import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CityBackdrop } from '@/components/art';
import { Card, GradientButton, Icon, IconButton, Mascot, ProgressBar, Tagline } from '@/components/ui';
import { rewards } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

/** Level Up / rewards celebration. */
export default function LevelUp() {
  const insets = useSafeAreaInsets();
  const { level, levelXp, xpPerLevel } = useApp();
  const { gained, leveledUp } = useLocalSearchParams<{ gained?: string; leveledUp?: string }>();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }]}>
      <CityBackdrop height={460} style={styles.bg} seed={13} />
      <IconButton icon="chevron-left" size={30} onPress={() => router.back()} style={{ marginLeft: 10 }} />

      <View style={{ alignItems: 'center', marginTop: 4 }}>
        <Tagline size={58} color={colors.pink} rotate={-6}>
          {leveledUp === '1' || !gained ? 'LEVEL UP!' : 'NICE WORK!'}
        </Tagline>
        <Tagline size={28} rotate={-6} style={{ marginTop: -4 }}>
          Level {level}
        </Tagline>
        {gained ? <Text style={styles.gained}>+{gained} XP earned</Text> : null}
      </View>

      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <Icon name="crown" size={54} color={colors.gold} style={{ marginBottom: -24, zIndex: 1, transform: [{ rotate: '12deg' }], marginLeft: 70 }} />
        <Mascot size={210} />
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <ProgressBar progress={levelXp / xpPerLevel} height={10} />
        <Text style={styles.xp}>
          {levelXp.toLocaleString('en-IN')} / {xpPerLevel.toLocaleString('en-IN')} XP
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {rewards.map((r) => (
            <Card key={r.label} style={styles.reward}>
              <Icon name={r.icon} size={36} color={r.color} />
              <Text style={styles.rewardText}>{r.label}</Text>
            </Card>
          ))}
        </View>

        <Card style={styles.next}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextTitle}>Next Unlock</Text>
            <Text style={styles.nextSub}>Neon Trail Effect{'\n'}at Level {level + 2}</Text>
          </View>
          <Icon name="shoe-sneaker" size={56} color={colors.pink} style={{ textShadowColor: colors.purple, textShadowRadius: 14 }} />
        </Card>

        <GradientButton label="View All Rewards" onPress={() => router.replace('/shop')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bg: { position: 'absolute', top: 0, left: 0, right: 0 },
  gained: { color: colors.gold, fontFamily: fonts.bold, marginTop: 6 },
  xp: { color: colors.dim, textAlign: 'center', fontFamily: fonts.medium, marginVertical: 10 },
  reward: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16 },
  rewardText: { color: colors.text, fontSize: 12, fontFamily: fonts.medium },
  next: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, borderRadius: radius.lg },
  nextTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  nextSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
});
