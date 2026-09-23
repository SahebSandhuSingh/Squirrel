import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CityBackdrop } from '@/components/art';
import { Coins, Display, GradientButton, Icon, IconBadge, Mascot, ProgressBar, Screen, Segmented, Tagline, tap } from '@/components/ui';
import { useApp, type MissionTab } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS: MissionTab[] = ['Daily', 'Weekly', 'Special'];

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toFixed(1));

/** Home — Today's Missions. */
export default function Missions() {
  const { missions, logMission, claimable, claimRewards, claimed, coins, level } = useApp();
  const [tab, setTab] = useState<MissionTab>('Daily');

  const onClaim = () => {
    const res = claimRewards();
    router.push({ pathname: '/level-up', params: { gained: String(res.xp), leveledUp: res.leveledUp ? '1' : '0' } });
  };

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable style={styles.levelChip} onPress={() => router.push('/progress')}>
          <Icon name="crown" size={16} color={colors.gold} />
          <Text style={styles.levelText}>Lv {level}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/shop')}>
          <Coins amount={coins} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Display size={46} style={{ lineHeight: 48 }}>TODAY'S{'\n'}MISSIONS</Display>
        <Icon name="crown-outline" size={34} color={colors.gold} style={{ marginLeft: 6, marginBottom: 8 }} />
      </View>

      <Segmented items={TABS} value={tab} onChange={setTab} />

      <View style={{ gap: 10 }}>
        {missions[tab].map((m) => {
          const done = m.current >= m.goal;
          const isClaimed = claimed.has(m.id);
          return (
            <View key={m.id} style={[styles.mission, done && { borderColor: `${m.color}88` }]}>
              <IconBadge icon={m.icon} color={m.color} />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.mTitle}>{m.title}</Text>
                <Text style={styles.mSub}>
                  {fmt(m.current)} / {fmt(m.goal)}
                  {m.unit ? ` ${m.unit}` : ''}
                </Text>
                <ProgressBar progress={m.current / m.goal} color={m.color} style={{ marginTop: 6 }} />
              </View>
              {done ? (
                <View style={{ alignItems: 'center' }}>
                  <Icon name={isClaimed ? 'check-circle' : 'gift'} size={22} color={isClaimed ? colors.green : colors.gold} />
                  <Text style={styles.xp}>+{m.xp} XP</Text>
                </View>
              ) : (
                <Pressable hitSlop={8} onPress={() => { tap(); logMission(tab, m.id); }} style={{ alignItems: 'center' }}>
                  <Icon name="plus-circle-outline" size={22} color={colors.dim} />
                  <Text style={styles.xp}>+{m.xp} XP</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <GradientButton
        label={claimable > 0 ? `CLAIM REWARDS · +${claimable} XP` : 'CLAIM REWARDS'}
        onPress={onClaim}
        disabled={claimable === 0}
        style={{ marginTop: 16 }}
      />
      {claimable === 0 && <Text style={styles.hint}>Tap + on a mission to log progress. Finish one to claim.</Text>}

      <View style={styles.banner}>
        <CityBackdrop height={170} style={StyleSheet.absoluteFill} seed={5} />
        <Mascot size={130} style={{ position: 'absolute', left: 0, bottom: -6 }} />
        <Tagline size={20} style={{ position: 'absolute', right: 14, top: 26, textAlign: 'right' }}>
          DISCIPLINE{'\n'}TODAY,{'\n'}A BIGGER{'\n'}YOU TOMORROW.
        </Tagline>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  levelText: { color: colors.text, fontFamily: fonts.bold, fontSize: 13 },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  mTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  mSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  xp: { color: colors.gold, fontFamily: fonts.black, fontSize: 13, marginTop: 2 },
  hint: { color: colors.mute, fontSize: 12, textAlign: 'center', marginTop: 8, fontFamily: fonts.regular },
  banner: { height: 170, marginTop: 18, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
});
