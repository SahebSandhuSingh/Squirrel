import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { MissionCard, SceneImage } from '@/components/cards';
import { Button, Coins, Display, FadeIn, Header, Icon, ProgressBar, Screen, Segmented, Tagline } from '@/components/ui';
import type { MissionTab } from '@/data/missions';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS: MissionTab[] = ['Daily', 'Weekly', 'Special'];
const RESETS: Record<MissionTab, string> = { Daily: 'Resets in 5h 12m', Weekly: 'Resets Monday', Special: 'Limited time · 6 days left' };

/** TODAY'S MISSIONS — full list with Daily / Weekly / Special. */
export default function Missions() {
  const { missions, logMission, claimed, claimable, claimRewards, coins } = useApp();
  const [tab, setTab] = useState<MissionTab>('Daily');
  const list = missions.filter((m) => m.tab === tab);
  const done = list.filter((m) => m.current >= m.goal).length;
  const totalXp = list.reduce((s, m) => s + m.xp, 0);

  const onClaim = () => {
    const r = claimRewards();
    router.push({ pathname: '/level-up', params: { gained: String(r.xp), coins: String(r.coins), leveledUp: r.leveledUp ? '1' : '0' } });
  };

  return (
    <Screen tabBar={false}>
      <Header back title="" right={<Coins amount={coins} />} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Display size={56} style={{ lineHeight: 56, flex: 1 }}>
          Today's{'\n'}
          <Text style={{ color: colors.pink }}>Missions</Text>
        </Display>
        <Mascot pose="cheer" accessory="crown" size={108} animated style={{ marginBottom: -6 }} />
      </View>

      <Segmented items={TABS} value={tab} onChange={setTab} />

      <View style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sumTitle}>{done}/{list.length} complete · {totalXp} XP available</Text>
          <ProgressBar progress={done / list.length} color={colors.pink} color2={colors.gold} height={6} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.reset}>
          <Icon name="timer-sand" size={14} color={colors.cyan} />
          <Text style={styles.resetText}>{RESETS[tab]}</Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {list.map((m, i) => (
          <FadeIn key={`${tab}-${m.id}`} index={i}>
            <MissionCard mission={m} claimed={claimed.has(m.id)} onLog={() => logMission(m.id)} />
          </FadeIn>
        ))}
      </View>

      <Button label={claimable.count ? `Claim rewards · +${claimable.xp} XP` : 'Claim rewards'} iconLeft="gift" disabled={!claimable.count} onPress={onClaim} style={{ marginTop: 18 }} />
      {claimable.count > 0 && (
        <Text style={styles.hint}>
          {claimable.count} mission{claimable.count > 1 ? 's' : ''} ready · +{claimable.coins} coins
        </Text>
      )}

      <SceneImage kind="city-sunset" seed={31} height={170} style={{ marginTop: 22 }} scrim={false}>
        <Mascot pose="run" size={170} style={{ position: 'absolute', right: -4, bottom: -12 }} animated />
        <View style={{ position: 'absolute', left: 16, top: 26 }}>
          <Tagline size={24}>Discipline{'\n'}today.</Tagline>
          <Tagline size={18} color={colors.pinkSoft} style={{ marginTop: 6 }}>A bigger you{'\n'}tomorrow.</Tagline>
        </View>
      </SceneImage>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  sumTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 130 },
  resetText: { color: colors.cyan, fontFamily: fonts.semibold, fontSize: 11, flexShrink: 1 },
  hint: { color: colors.gold, fontSize: 12, textAlign: 'center', marginTop: 8, fontFamily: fonts.semibold },
});
