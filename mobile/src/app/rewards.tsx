import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BadgeArt } from '@/art/Badge';
import { StickerArt } from '@/art/Sticker';
import { RewardArt } from '@/art/Reward';
import { Card, FadeIn, Header, Icon, LevelBadge, ProgressBar, Screen, Segmented, XPBar } from '@/components/ui';
import { achievements, levelRewards } from '@/data/rewards';
import { shopItems } from '@/data/shop';
import { useApp, XP_PER_LEVEL } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Road', 'Badges', 'Stickers'] as const;
type Tab = (typeof TABS)[number];

/** All rewards: level road, achievement badges and sticker collection. */
export default function Rewards() {
  const { level, levelXp, owned } = useApp();
  const [tab, setTab] = useState<Tab>('Road');
  const stickers = shopItems.filter((i) => i.art.type === 'sticker');

  return (
    <Screen tabBar={false}>
      <Header back title="Rewards" />
      <Card glow={colors.purple} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <LevelBadge level={level} size="lg" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>Level {level}</Text>
          <XPBar value={levelXp} max={XP_PER_LEVEL} style={{ marginTop: 6 }} />
        </View>
      </Card>

      <Segmented items={TABS} value={tab} onChange={setTab} style={{ marginTop: 14 }} />

      {tab === 'Road' && (
        <View style={{ paddingLeft: 8 }}>
          {levelRewards.map((r, i) => {
            const unlocked = r.level <= level;
            return (
              <FadeIn key={`${r.level}-${r.title}`} index={i}>
                <View style={styles.roadRow}>
                  <View style={{ alignItems: 'center', width: 40 }}>
                    <View style={[styles.node, unlocked && { backgroundColor: colors.pink, borderColor: colors.pinkSoft }]}>
                      <Text style={styles.nodeText}>{r.level}</Text>
                    </View>
                    {i < levelRewards.length - 1 && <View style={[styles.rail, unlocked && { backgroundColor: colors.pink }]} />}
                  </View>
                  <View style={[styles.roadCard, !unlocked && { opacity: 0.6 }]}>
                    <RewardArt kind={r.kind} size={62} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.title}>{r.title}</Text>
                      <Text style={styles.sub}>{r.subtitle}</Text>
                    </View>
                    <Icon name={unlocked ? 'check-circle' : 'lock'} size={22} color={unlocked ? colors.green : colors.dim} />
                  </View>
                </View>
              </FadeIn>
            );
          })}
        </View>
      )}

      {tab === 'Badges' && (
        <View style={styles.grid}>
          {achievements.map((a, i) => (
            <FadeIn key={a.id} index={i} style={styles.badgeCell}>
              <BadgeArt kind={a.kind} size={78} locked={a.progress < 1} />
              <Text style={styles.badgeName} numberOfLines={1}>{a.name}</Text>
              <Text style={styles.badgeDesc} numberOfLines={2}>{a.description}</Text>
              {a.progress < 1 ? <ProgressBar progress={a.progress} height={4} style={{ width: '80%', marginTop: 6 }} /> : <Text style={styles.unlocked}>{a.unlockedAt}</Text>}
            </FadeIn>
          ))}
        </View>
      )}

      {tab === 'Stickers' && (
        <View style={styles.grid}>
          {stickers.map((s, i) => (
            <FadeIn key={s.id} index={i} style={[styles.badgeCell, !owned.has(s.id) && { opacity: 0.45 }]}>
              {s.art.type === 'sticker' && <StickerArt kind={s.art.kind} size={80} />}
              <Text style={styles.badgeName} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.unlocked}>{owned.has(s.id) ? 'Collected' : `${s.price} coins`}</Text>
            </FadeIn>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  sub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  roadRow: { flexDirection: 'row', alignItems: 'stretch' },
  node: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardHi, borderWidth: 2, borderColor: colors.lineHi, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  nodeText: { color: colors.text, fontFamily: fonts.display, fontSize: 14 },
  rail: { flex: 1, width: 3, backgroundColor: colors.line, marginVertical: 2 },
  roadCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, marginLeft: 8, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  badgeCell: { width: '48.5%', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, paddingHorizontal: 8 },
  badgeName: { color: colors.text, fontFamily: fonts.bold, fontSize: 13, marginTop: 8 },
  badgeDesc: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11, textAlign: 'center', marginTop: 2 },
  unlocked: { color: colors.green, fontFamily: fonts.semibold, fontSize: 11, marginTop: 6 },
});
