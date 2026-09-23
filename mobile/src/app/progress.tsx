import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CityBackdrop } from '@/components/art';
import { Header, Icon, IconButton, Mascot, ProgressBar, Screen, Segmented, Tagline } from '@/components/ui';
import { stats } from '@/data/mock';
import { colors, fonts, radius } from '@/theme';

const PERIODS = ['Day', 'Week', 'Month', 'Year'] as const;
type Period = (typeof PERIODS)[number];

/** Your Progress — stats with mini bar charts. */
export default function Progress() {
  const [period, setPeriod] = useState<Period>('Week');

  return (
    <Screen tabBar={false}>
      <Header title="Your Progress" back right={<IconButton icon="share-variant-outline" color={colors.pink} onPress={() => router.push('/social')} />} />
      <Segmented items={PERIODS} value={period} onChange={setPeriod} activeColor={colors.blue} />

      <View style={{ gap: 10 }}>
        {stats[period].map((s) => {
          const max = Math.max(...s.bars, 1);
          return (
            <View key={s.id} style={styles.card}>
              <Icon name={s.icon} size={30} color={s.color} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{s.label}</Text>
                <Text style={styles.value}>
                  {s.value}
                  {s.unit ? <Text style={styles.unit}> {s.unit}</Text> : null}
                </Text>
                {s.progress != null && <ProgressBar progress={s.progress} color={s.color} style={{ marginTop: 6, width: '80%' }} />}
              </View>
              <View style={styles.bars} accessibilityLabel={`${s.label} trend`}>
                {s.bars.map((b, i) => (
                  <View key={i} style={{ width: 7, height: 6 + (b / max) * 40, borderRadius: 3, backgroundColor: s.color, opacity: 0.45 + (i / s.bars.length) * 0.55 }} />
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.banner}>
        <CityBackdrop height={150} style={StyleSheet.absoluteFill} seed={77} />
        <Tagline size={20} style={{ position: 'absolute', left: 16, top: 30 }}>
          CONSISTENCY{'\n'}LOOKS GOOD{'\n'}ON YOU.
        </Tagline>
        <Mascot size={130} style={{ position: 'absolute', right: 0, bottom: -8 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14 },
  label: { color: colors.dim, fontFamily: fonts.medium, fontSize: 13 },
  value: { color: colors.text, fontFamily: fonts.bold, fontSize: 24, marginTop: 2 },
  unit: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 48 },
  banner: { height: 150, marginTop: 16, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
});
