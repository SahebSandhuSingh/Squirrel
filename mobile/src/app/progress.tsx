import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { MiniBars, SceneImage, StatCard } from '@/components/cards';
import { Card, Display, FadeIn, Header, Icon, IconButton, Ring, Screen, Segmented, SectionHeader, Tagline } from '@/components/ui';
import { heatmap, recentActivities, stats, type Period } from '@/data/stats';
import { colors, fonts, radius } from '@/theme';

const PERIODS: Period[] = ['Day', 'Week', 'Month', 'Year'];
const HEAT = ['rgba(255,255,255,0.05)', 'rgba(255,53,181,0.25)', 'rgba(255,53,181,0.45)', 'rgba(255,53,181,0.7)', '#FF35B5'];

/** YOUR PROGRESS — fitness-game analytics dashboard. */
export default function Progress() {
  const [period, setPeriod] = useState<Period>('Week');
  const data = stats[period];
  const steps = data[0];

  return (
    <Screen tabBar={false}>
      <Header back title="Your Progress" right={<IconButton icon="share-variant-outline" color={colors.pink} onPress={() => router.push('/compose')} label="Share progress" />} />
      <Segmented items={PERIODS} value={period} onChange={setPeriod} accent="cyan" />

      {/* Hero chart */}
      <FadeIn key={period}>
        <Card glow={colors.green}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ring progress={steps.progress ?? 0} size={92} stroke={9} color={colors.green} color2={colors.cyan}>
              <Text style={styles.ringPct}>{Math.round((steps.progress ?? 0) * 100)}%</Text>
              <Text style={styles.ringLbl}>of goal</Text>
            </Ring>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.kicker}>Steps this {period.toLowerCase()}</Text>
              <Display size={36}>{steps.value}</Display>
              <Text style={styles.sub}>{steps.unit} · {steps.delta ?? 'on track'} vs last {period.toLowerCase()}</Text>
            </View>
          </View>
          <View style={{ marginTop: 16 }}>
            <MiniBars values={steps.series.values} color={colors.green} height={90} barWidth={steps.series.values.length > 8 ? 12 : 22} />
            <View style={styles.axis}>
              {steps.series.labels.map((l, i) => (
                <Text key={i} style={[styles.axisLbl, { width: steps.series.values.length > 8 ? 12 : 22 }]}>{l}</Text>
              ))}
            </View>
          </View>
        </Card>
      </FadeIn>

      <View style={{ gap: 10, marginTop: 12 }}>
        {data.slice(1).map((s, i) => (
          <FadeIn key={`${period}-${s.id}`} index={i}>
            <StatCard stat={s} />
          </FadeIn>
        ))}
      </View>

      {/* Streak heatmap */}
      <SectionHeader title="Streak Calendar" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="fire" size={22} color={colors.orange} />
          <Text style={styles.streak}>12-day streak</Text>
          <Text style={styles.sub}>· personal best</Text>
        </View>
        <View style={{ gap: 6 }}>
          {heatmap.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
              {row.map((v, c) => (
                <View key={c} style={[styles.cell, { backgroundColor: HEAT[v] }]} />
              ))}
            </View>
          ))}
        </View>
        <View style={[styles.axis, { marginTop: 6 }]}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <Text key={i} style={[styles.axisLbl, { flex: 1 }]}>{d}</Text>
          ))}
        </View>
      </Card>

      {/* Recent */}
      <SectionHeader title="Recent Activity" />
      <View style={{ gap: 10 }}>
        {recentActivities.map((a) => (
          <View key={a.id} style={styles.activity}>
            <SceneImage kind={a.scene} seed={a.id.length * 5} height={56} style={{ width: 56, borderRadius: radius.sm }} scrim={false} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.actTitle} numberOfLines={1}>{a.title}</Text>
              <Text style={styles.sub}>{a.when}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.actBig}>{a.km ? `${a.km} km` : `${a.minutes} min`}</Text>
              <Text style={styles.sub}>{a.kcal} kcal</Text>
            </View>
          </View>
        ))}
      </View>

      <SceneImage kind="city-dawn" seed={77} height={160} style={{ marginTop: 20 }} scrim={false}>
        <Tagline size={22} style={{ position: 'absolute', left: 16, top: 28 }}>
          Consistency{'\n'}looks good{'\n'}on you.
        </Tagline>
        <Mascot pose="drink" size={160} animated style={{ position: 'absolute', right: -4, bottom: -12 }} />
      </SceneImage>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ringPct: { color: colors.text, fontFamily: fonts.display, fontSize: 22 },
  ringLbl: { color: colors.dim, fontFamily: fonts.medium, fontSize: 10, marginTop: -2 },
  kicker: { color: colors.green, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  sub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisLbl: { color: colors.mute, fontFamily: fonts.semibold, fontSize: 10, textAlign: 'center' },
  streak: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 6 },
  activity: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10 },
  actTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  actBig: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
});
