import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { CityMap } from '@/art/CityMap';
import { CityChip } from '@/components/TopBar';
import { Button, Display, FadeIn, Header, Icon, Kicker, ProgressBar, Screen, Tagline, tap } from '@/components/ui';
import { statusColor, statusLabel, type District, type TerritoryStatus } from '@/data/territory';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const MAP_W = 400;
const MAP_H = 600;

/** OWN YOUR BLOCK — territory map, zone card and rules (mirrors the website's #territory). */
export default function Territory() {
  const { districts, city } = useApp();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [selId, setSelId] = useState(districts.find((d) => d.status === 'yours')?.id ?? districts[0]?.id);
  const sel = districts.find((d) => d.id === selId) ?? districts[0];
  const yours = districts.filter((d) => d.status === 'yours');
  const ownedKm2 = yours.reduce((s, d) => s + d.areaKm2 * d.control, 0);

  // Map units → on-screen pixels for the `slice` fit used by CityMap.
  const s = box.w ? Math.max(box.w / MAP_W, box.h / MAP_H) : 1;
  const ox = (MAP_W * s - box.w) / 2;
  const oy = (MAP_H * s - box.h) / 2;
  const px = (x: number, y: number) => ({ left: x * s - ox, top: y * s - oy });

  return (
    <Screen tabBar={false}>
      <Header back title="" right={<CityChip />} />
      <Kicker>Territory · {city.name}</Kicker>
      <Display size={52} style={{ marginTop: 6, lineHeight: 54 }}>
        Own{'\n'}
        <Text style={{ color: colors.primary }}>your</Text>
        {'\n'}block.
      </Display>
      <Tagline size={18} color={colors.secondary} rotate={-3} style={{ marginTop: 6 }}>Every run leaves a mark.</Tagline>

      <View style={styles.stats}>
        {[
          [String(yours.length), 'Zones held'],
          [`${ownedKm2.toFixed(1)} km²`, 'Your ground'],
          [String(districts.filter((d) => d.status === 'contested').length), 'Contested'],
        ].map(([v, l]) => (
          <View key={l} style={styles.stat}>
            <Text style={styles.statV}>{v}</Text>
            <Text style={styles.statL}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Map */}
      <View style={styles.map} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <CityMap seed={city.id.length * 7} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} />
        {box.w > 0 && (
          <Svg width={box.w} height={box.h} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
            {districts.map((d) => (
              <Polygon
                key={d.id}
                points={d.poly.map((p) => p.join(',')).join(' ')}
                fill={statusColor[d.status]}
                fillOpacity={d.id === sel?.id ? 0.32 : d.status === 'neutral' ? 0.06 : 0.16}
                stroke={statusColor[d.status]}
                strokeWidth={d.id === sel?.id ? 3 : 2}
                strokeDasharray={d.status === 'contested' || d.status === 'neutral' ? '8 6' : undefined}
                strokeLinejoin="round"
                onPress={() => { tap(); setSelId(d.id); }}
              />
            ))}
          </Svg>
        )}
        {box.w > 0 &&
          districts.map((d) => {
            const p = px(d.label[0], d.label[1]);
            const on = d.id === sel?.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => { tap(); setSelId(d.id); }}
                accessibilityLabel={`${d.name}, ${statusLabel[d.status]}`}
                style={[styles.zoneLabel, { left: p.left - 58, top: p.top - 18, borderColor: statusColor[d.status] }, on && { backgroundColor: d.status === 'yours' ? colors.primary : colors.card }]}>
                <Text style={[styles.zoneName, on && d.status === 'yours' && { color: colors.onPrimary }]} numberOfLines={1}>{d.name}</Text>
                <Text style={[styles.zoneMeta, { color: on && d.status === 'yours' ? colors.onPrimary : statusColor[d.status] }]} numberOfLines={1}>
                  {d.status === 'yours' ? `Your crew · ${Math.round(d.control * 100)}%` : d.status === 'rival' ? d.rivalCrew : statusLabel[d.status]}
                </Text>
              </Pressable>
            );
          })}
      </View>

      <View style={styles.legend}>
        {(['yours', 'rival', 'contested', 'neutral'] as TerritoryStatus[]).map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.swatch, { borderColor: statusColor[k], borderStyle: k === 'contested' || k === 'neutral' ? 'dashed' : 'solid' }]} />
            <Text style={styles.legendText}>{statusLabel[k]}</Text>
          </View>
        ))}
      </View>

      {sel && <ZoneCard d={sel} />}

      <View style={{ marginTop: 22, gap: 2 }}>
        {['Move through real places.', 'Build XP.', 'Claim territory.', 'Defend it.'].map((t, i) => (
          <FadeIn key={t} index={i}>
            <View style={styles.step}>
              <Text style={styles.stepNo}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={styles.stepText}>{t}</Text>
            </View>
          </FadeIn>
        ))}
      </View>
      <Text style={styles.rules}>
        A closed run captures the ground it loops. Rival crews can carve into your zones, and anything you don't refresh decays after 14 days.
      </Text>
      <Button label="Territory leaderboard" variant="secondary" size="md" iconLeft="trophy-outline" onPress={() => router.push('/leaderboard')} style={{ marginTop: 16 }} />
    </Screen>
  );
}

function ZoneCard({ d }: { d: District }) {
  const c = statusColor[d.status];
  return (
    <FadeIn key={d.id}>
      <View style={[styles.zoneCard, { borderColor: c, shadowColor: c }]}>
        <Kicker color={c}>{statusLabel[d.status]}</Kicker>
        <Display size={32} style={{ marginTop: 4 }}>{d.name}</Display>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <ProgressBar progress={d.control} color={c} height={10} style={{ flex: 1 }} />
          <Text style={[styles.pct, { color: c }]}>{Math.round(d.control * 100)}%</Text>
        </View>
        <Text style={styles.zoneInfo}>
          {d.xpToClaim.toLocaleString('en-IN')} XP to claim · Defended by {d.defenders} movers · {d.areaKm2} km²
        </Text>
        <View style={styles.decay}>
          <Icon name="timer-sand" size={14} color={d.decayDays <= 5 ? colors.orange : colors.dim} />
          <Text style={[styles.zoneInfo, { marginTop: 0, color: d.decayDays <= 5 ? colors.orange : colors.dim }]}>
            {d.status === 'yours' ? `Decays in ${d.decayDays} days unless you run it again` : d.status === 'neutral' ? 'Unclaimed — first closed run takes it' : `Held by ${d.rivalCrew}`}
          </Text>
        </View>
        <Button
          label={d.status === 'yours' ? 'Defend this zone' : d.status === 'neutral' ? 'Claim this zone' : 'Take it back'}
          icon="arrow-right"
          size="md"
          onPress={() => router.push('/run')}
          style={{ marginTop: 14 }}
        />
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 12 },
  stat: { flex: 1 },
  statV: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 22 },
  statL: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  map: { height: 380, marginTop: 16, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg2 },
  zoneLabel: { position: 'absolute', width: 116, backgroundColor: 'rgba(14,16,11,0.88)', borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  zoneName: { color: colors.text, fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  zoneMeta: { fontFamily: fonts.mono, fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 16, height: 10, borderWidth: 2 },
  legendText: { color: colors.sub, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  zoneCard: { marginTop: 16, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 2, padding: 16, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, transform: [{ rotate: '-0.6deg' }] },
  pct: { fontFamily: fonts.labelBold, fontSize: 20 },
  zoneInfo: { color: colors.sub, fontFamily: fonts.mono, fontSize: 11, marginTop: 8 },
  decay: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, borderStyle: 'dashed' },
  stepNo: { color: colors.primary, fontFamily: fonts.monoBold, fontSize: 12 },
  stepText: { color: colors.text, fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, textTransform: 'uppercase' },
  rules: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 14 },
});
