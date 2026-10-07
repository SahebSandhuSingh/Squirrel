/**
 * The top of the results screen, in the game's language: a hero line, the big numbers, km
 * splits (fastest lit), and every territory you crossed with the influence you built there.
 * The verdict, backend zone checks, XP and upload status follow below it (run.tsx).
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Icon, NATIVE } from '@/components/ui';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import { crewOf } from '@/features/world/data/crews';
import { CrewEmblem, HUD } from '@/features/world/components/hud';
import { getTerritory } from '@/features/world/state/worldStore';
import { influenceOf, type RunProgress } from '../logic/runProgress';

const fmt = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`;

export function ResultsHero({ kind, km, time, pace, kcal, progress, demo }: { kind: 'run' | 'walk'; km: number; time: string; pace: string; kcal: number; progress: RunProgress | null; demo: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [v]);
  const territories = progress?.order.length ?? 0;
  const powered = progress ? Object.values(progress.byTerritory).filter((t) => t.powered).length : 0;
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <Text style={styles.kicker}>{demo ? 'DEMO ROUTE · NOT A REAL ACTIVITY' : `${kind === 'walk' ? 'WALK' : 'RUN'} COMPLETE`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={styles.km}>{km.toFixed(2)}</Text>
        <Text style={styles.kmUnit}>KM</Text>
      </View>
      <View style={styles.grid}>
        <Cell label="Time" value={time} />
        <Cell label="Avg pace" value={pace} />
        <Cell label="Kcal" value={String(kcal)} />
      </View>
      {progress && territories > 0 && (
        <View style={[styles.grid, { marginTop: -1 }]}>
          <Cell label="Territories" value={String(territories)} accent />
          <Cell label="Powered" value={String(powered)} accent={powered > 0} />
          <Cell label="Best streak" value={`×${progress.bestStreak}`} />
        </View>
      )}
    </Animated.View>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.cellValue, accent && { color: W.primary }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** One bar per km; taller = faster. The fastest km is lit. */
export function Splits({ splits }: { splits: number[] }) {
  if (!splits.length) return null;
  const best = Math.min(...splits);
  const worst = Math.max(...splits);
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>KM SPLITS</Text>
      <View style={styles.bars}>
        {splits.map((s, i) => {
          const h = worst === best ? 1 : 0.45 + 0.55 * ((worst - s) / (worst - best));
          const top = s === best;
          return (
            <View key={i} style={styles.barCol} accessibilityLabel={`Kilometre ${i + 1}: ${fmt(s)}${top ? ', fastest' : ''}`}>
              <Text style={[styles.barTime, top && { color: W.primary }]}>{fmt(s)}</Text>
              <View style={[styles.bar, { height: 70 * h, backgroundColor: top ? W.primary : alpha(HUD.ink, 0.22) }]} />
              <Text style={styles.barKm}>{i + 1}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Every territory crossed, in order, with your influence there. */
export function TerritoriesCrossed({ progress }: { progress: RunProgress | null }) {
  if (!progress || !progress.order.length) return null;
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>TERRITORIES CROSSED · {progress.order.length}</Text>
      {progress.order.map((id, i) => {
        const t = getTerritory(id);
        if (!t) return null;
        const run = progress.byTerritory[id];
        const owner = crewOf(t.state.ownerCrewId);
        const inf = influenceOf(t, run.meters);
        return (
          <View key={id} style={styles.terr}>
            <Text style={styles.terrIdx}>{String(i + 1).padStart(2, '0')}</Text>
            <CrewEmblem crew={owner} size={30} locked={t.state.status === 'locked'} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.terrName} numberOfLines={1}>{t.name}</Text>
              <View style={styles.infTrack}>
                <View style={[styles.infFill, { width: `${Math.round(inf * 100)}%` }]} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {run.powered ? (
                <View style={styles.powered}>
                  <Icon name="flash" size={11} color={W.onPrimary} />
                  <Text style={styles.poweredText}>POWERED</Text>
                </View>
              ) : (
                <Text style={styles.terrPct}>{Math.round(inf * 100)}%</Text>
              )}
              <Text style={styles.terrM}>{Math.round(run.meters)} m</Text>
            </View>
          </View>
        );
      })}
      <Text style={styles.note}>Influence is a Preview Season preview. Claiming, defending and challenging happen on the Territory map.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { color: W.primary, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 3 },
  km: { color: HUD.ink, fontFamily: fonts.display, fontSize: 84, lineHeight: 92, letterSpacing: 0.5, transform: [{ skewX: DISPLAY_SKEW }] },
  kmUnit: { color: W.primary, fontFamily: fonts.display, fontSize: 26, marginLeft: 8 },
  grid: { flexDirection: 'row', borderWidth: 1, borderColor: HUD.hair, marginTop: 10 },
  cell: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderLeftWidth: 1, borderLeftColor: HUD.hair, marginLeft: -1 },
  cellLabel: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.6 },
  cellValue: { color: HUD.ink, fontFamily: fonts.display, fontSize: 22, marginTop: 2, transform: [{ skewX: DISPLAY_SKEW }] },
  block: { marginTop: 18 },
  blockTitle: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11.5, letterSpacing: 2, marginBottom: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, minHeight: 110 },
  barCol: { flex: 1, alignItems: 'center', maxWidth: 56 },
  barTime: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 10.5, marginBottom: 4 },
  bar: { width: '100%', transform: [{ skewX: '-6deg' }] },
  barKm: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 11, marginTop: 4 },
  terr: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: HUD.hair },
  terrIdx: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 12, width: 18 },
  terrName: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 15, letterSpacing: 0.8, textTransform: 'uppercase' },
  infTrack: { height: 3, backgroundColor: alpha(HUD.ink, 0.1), marginTop: 5 },
  infFill: { height: 3, backgroundColor: W.primary },
  terrPct: { color: HUD.ink, fontFamily: fonts.display, fontSize: 17 },
  terrM: { color: HUD.inkMute, fontFamily: fonts.label, fontSize: 11 },
  powered: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: W.primaryFill, paddingHorizontal: 6, paddingVertical: 2 },
  poweredText: { color: W.onPrimary, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1 },
  note: { color: HUD.inkMute, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
});
