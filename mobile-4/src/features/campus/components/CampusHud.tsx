/**
 * The HUD around the IISER Kolkata map: kept to the edges so the map stays the hero.
 *
 *   top      IISER KOLKATA · your XP · your crew            (and the way back to the network)
 *            the five map modes, one compact segmented control
 *            a live line: squirrels nearby, the nearest battle
 *   right    locate · fit campus · north (· zoom, with a mouse)
 *   bottom   YOUR TERRITORY  3 zones  1,240 XP
 */
import { memo, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import { HUD } from '@/features/world/components/hud';
import type { MapMode } from '../engine/protocol';
import type { Crew } from '../types';

export { HUD };

export const MODES: { id: MapMode; label: string; icon: IconName; hint: string }[] = [
  { id: 'explore', label: 'Explore', icon: 'compass-outline', hint: 'The campus itself: buildings, grounds, water' },
  { id: 'territory', label: 'Territory', icon: 'hexagon-slice-6', hint: 'Who holds each zone, and how strongly' },
  { id: 'crews', label: 'Crews', icon: 'vector-polyline', hint: 'Each crew’s region and network' },
  { id: 'activity', label: 'Activity', icon: 'pulse', hint: 'Where squirrels are active right now' },
  { id: 'challenges', label: 'Battles', icon: 'sword-cross', hint: 'Zones under attack and who’s pushing' },
];

const hexPoints = (s: number) => {
  const r = s / 2 - 1.2;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(s / 2 + Math.cos(a) * r).toFixed(2)},${(s / 2 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
};

/** A crew's mark: a hex in its colour (dashed grey when nobody holds the zone). */
export const CrewHex = memo(function CrewHex({ color, size = 18, filled, dashed, children }: { color: string; size?: number; filled?: boolean; dashed?: boolean; children?: React.ReactNode }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Polygon points={hexPoints(size)} fill={filled ? color : alpha(color, 0.14)} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? '3,3' : undefined} />
      </Svg>
      {children}
    </View>
  );
});

export function TopBar({ top, xp, crew, preview, onBack, onBoard, compact }: { top: number; xp: number | null; crew: Crew | null; preview: boolean; onBack: () => void; onBoard?: () => void; compact: boolean }) {
  return (
    <View style={[st.topBar, { top }]}>
      <Pressable onPress={() => { tap(); onBack(); }} hitSlop={8} style={st.back} accessibilityRole="button" accessibilityLabel="Back to the Territory Network">
        <Icon name="chevron-left" size={22} color={HUD.ink} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.title} numberOfLines={1}>IISER KOLKATA</Text>
        <Text style={st.sub} numberOfLines={1}>{preview ? 'MOHANPUR · PREVIEW SEASON' : 'MOHANPUR · SEASON LIVE'}</Text>
      </View>
      <View style={st.chip} accessibilityLabel={`Your XP: ${xp ?? 'loading'}`}>
        <Text style={st.chipLabel}>XP</Text>
        <Text style={st.chipValue}>{xp == null ? '—' : xp.toLocaleString('en-IN')}</Text>
      </View>
      <View style={[st.chip, crew && { borderColor: alpha(crew.color, 0.45) }]} accessibilityLabel={crew ? `Your crew: ${crew.name}` : 'No crew'}>
        <CrewHex color={crew?.color ?? HUD.inkMute} size={15} filled={!!crew} />
        {!compact && <Text style={[st.chipValue, { color: crew?.color ?? HUD.inkDim }]} numberOfLines={1}>{crew?.short ?? 'NO CREW'}</Text>}
      </View>
      {onBoard && (
        <Pressable onPress={() => { tap(); onBoard(); }} hitSlop={6} style={st.chip} accessibilityRole="button" accessibilityLabel="Live campus board: squirrels near you">
          <Icon name="account-group-outline" size={17} color={HUD.ink} />
        </Pressable>
      )}
    </View>
  );
}

export function ModeBar({ mode, onChange, labels }: { mode: MapMode; onChange: (m: MapMode) => void; labels: 'all' | 'active' }) {
  return (
    <View style={st.modes} accessibilityRole="tablist">
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <Pressable
            key={m.id}
            onPress={() => {
              if (on) return;
              tap();
              onChange(m.id);
            }}
            style={[st.mode, on && st.modeOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${m.label} mode`}
            accessibilityHint={m.hint}>
            <Icon name={m.icon} size={16} color={on ? W.onPrimary : HUD.inkDim} />
            {(labels === 'all' || on) && <Text style={[st.modeText, { color: on ? W.onPrimary : HUD.inkDim }]} numberOfLines={1}>{m.label.toUpperCase()}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** One live line at a time; changes cross-fade. */
export function LiveLine({ lines }: { lines: { key: string; text: string; color?: string; icon?: IconName }[] }) {
  const [i, setI] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));
  const [dot] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(dot, { toValue: 1, duration: 900, useNativeDriver: NATIVE }), Animated.timing(dot, { toValue: 0, duration: 900, useNativeDriver: NATIVE })]));
    loop.start();
    return () => loop.stop();
  }, [dot]);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: NATIVE }).start(() => {
        setI((n) => n + 1);
        Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }).start();
      });
    }, 4200);
    return () => clearInterval(t);
  }, [lines.length, fade]);
  if (!lines.length) return null;
  const line = lines[i % lines.length];
  return (
    <View style={st.live} accessibilityLiveRegion="polite" accessibilityLabel={line.text}>
      <Animated.View style={[st.liveDot, { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: fade, flexShrink: 1 }}>
        {line.icon && <Icon name={line.icon} size={13} color={line.color ?? HUD.inkDim} />}
        <Text style={[st.liveText, line.color ? { color: line.color } : null]} numberOfLines={1}>{line.text}</Text>
      </Animated.View>
    </View>
  );
}

export function MapButtons({ onLocate, onFit, onNorth, bearing, zoom, located }: { onLocate: () => void; onFit: () => void; onNorth: () => void; bearing: number; zoom?: (by: number) => void; located: boolean }) {
  const b = (icon: IconName, label: string, on: () => void, extra?: React.ReactNode) => (
    <Pressable key={label} onPress={() => { tap(); on(); }} style={st.mapBtn} accessibilityRole="button" accessibilityLabel={label}>
      {extra ?? <Icon name={icon} size={20} color={HUD.ink} />}
    </Pressable>
  );
  return (
    <View style={{ gap: 8 }}>
      {zoom && b('plus', 'Zoom in', () => zoom(1))}
      {zoom && b('minus', 'Zoom out', () => zoom(-1))}
      {b('compass-outline', 'Point north', onNorth, <View style={{ transform: [{ rotate: `${-bearing}deg` }] }}><Icon name="navigation-variant" size={19} color={bearing ? W.primary : HUD.ink} /></View>)}
      {b('image-filter-center-focus-weak', 'Show the whole campus', onFit)}
      {b(located ? 'crosshairs-gps' : 'crosshairs', 'Go to my position', onLocate)}
    </View>
  );
}

export function TerritoryBar({ zones, xp, crew, onPress, battles, onBattles }: { zones: number; xp: number | null; crew: Crew | null; onPress: () => void; battles: number; onBattles: () => void }) {
  const color = crew?.color ?? HUD.inkMute;
  return (
    <View style={st.terrRow}>
      <Pressable onPress={() => { tap(); onPress(); }} style={[st.terr, { borderLeftColor: color }]} accessibilityRole="button" accessibilityLabel={`Your territory: ${zones} zones, ${xp ?? 0} XP. Show them on the map.`}>
        <Text style={st.terrKicker}>YOUR TERRITORY</Text>
        <View style={st.terrNums}>
          <Text style={[st.terrBig, { color }]}>{zones}</Text>
          <Text style={st.terrUnit}>{zones === 1 ? 'ZONE' : 'ZONES'}</Text>
          <View style={st.terrSep} />
          <Text style={st.terrBig}>{xp == null ? '—' : xp.toLocaleString('en-IN')}</Text>
          <Text style={st.terrUnit}>XP</Text>
        </View>
      </Pressable>
      {battles > 0 && (
        <Pressable onPress={() => { tap(); onBattles(); }} style={st.battleChip} accessibilityRole="button" accessibilityLabel={`${battles} battles involving your crew`}>
          <Icon name="sword-cross" size={16} color={HUD.attack} />
          <Text style={st.battleN}>{battles}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Crews mode: who holds how much. */
export function CrewLegend({ crews, counts, mine }: { crews: Crew[]; counts: Record<string, number>; mine: string | null }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
      {[...crews].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0)).map((c) => (
        <View key={c.id} style={[st.legend, c.id === mine && { borderColor: alpha(c.color, 0.6) }]} accessibilityLabel={`${c.name}: ${counts[c.id] ?? 0} zones`}>
          <CrewHex color={c.color} size={14} filled />
          <Text style={[st.legendName, { color: c.color }]}>{c.short}</Text>
          <Text style={st.legendN}>{counts[c.id] ?? 0}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Battles mode: every running battle, tap to look. */
export function BattleList({ items, onPick }: { items: { id: string; name: string; attacker: Crew | null; defender: Crew | null; progress: number; mine: boolean }[]; onPick: (id: string) => void }) {
  if (!items.length) return <View style={st.legend}><Text style={st.legendN}>NO BATTLES RIGHT NOW</Text></View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
      {items.map((b) => (
        <Pressable key={b.id} onPress={() => { tap(); onPick(b.id); }} style={[st.legend, b.mine && { borderColor: alpha(HUD.attack, 0.6) }]} accessibilityRole="button" accessibilityLabel={`${b.name}: ${b.attacker?.name} attacking ${b.defender?.name}, ${b.progress}%`}>
          <Text style={st.legendName} numberOfLines={1}>{b.name.toUpperCase()}</Text>
          <View style={st.miniBar}>
            <View style={{ width: `${b.progress}%`, backgroundColor: b.attacker?.color ?? HUD.attack }} />
            <View style={{ flex: 1, backgroundColor: alpha(b.defender?.color ?? HUD.inkMute, 0.5) }} />
          </View>
          <Text style={[st.legendN, { color: b.attacker?.color }]}>{b.progress}%</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export const st = StyleSheet.create({
  topBar: { position: 'absolute', left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hair, paddingVertical: 7, paddingLeft: 4, paddingRight: 8 },
  back: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: HUD.ink, fontFamily: fonts.display, fontSize: 21, letterSpacing: 1.2, lineHeight: 25, transform: [{ skewX: DISPLAY_SKEW }] },
  sub: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 9, borderWidth: 1, borderColor: HUD.hairHi, backgroundColor: '#0C0E12' },
  chipLabel: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.4 },
  chipValue: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 14, letterSpacing: 0.8 },
  modes: { flexDirection: 'row', backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hair, padding: 3, gap: 3 },
  mode: { flexGrow: 1, flexBasis: 0, minWidth: 40, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6 },
  modeOn: { backgroundColor: W.primaryFill, flexGrow: 1.6 },
  modeText: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: alpha('#08090C', 0.86), borderWidth: 1, borderColor: HUD.hair, paddingHorizontal: 10, paddingVertical: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF5A6E' },
  liveText: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12.5, letterSpacing: 0.9, textTransform: 'uppercase', flexShrink: 1 },
  mapBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hairHi },
  terrRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  terr: { flex: 1, backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hair, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 7 },
  terrKicker: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 2 },
  terrNums: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  terrBig: { color: HUD.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.4, transform: [{ skewX: DISPLAY_SKEW }] },
  terrUnit: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1.4 },
  terrSep: { width: 1, height: 16, backgroundColor: HUD.hairHi, marginHorizontal: 6 },
  battleChip: { width: 58, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: HUD.solid, borderWidth: 1, borderColor: alpha(HUD.attack, 0.45) },
  battleN: { color: HUD.attack, fontFamily: fonts.display, fontSize: 16 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 10, backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hair },
  legendName: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2, maxWidth: 150 },
  legendN: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1 },
  miniBar: { width: 46, height: 4, flexDirection: 'row', overflow: 'hidden' },
});
