/**
 * The live run HUD, over the run map: where you are on the network and how much of it you're
 * powering, the numbers that matter at a glance (distance huge, time and pace next), an
 * intensity gauge, progress to the next km, and controls that can't be hit by accident —
 * tap to pause, HOLD to finish (a ring charges while you hold).
 *
 * Built to be read mid-stride: big type, high contrast, nothing that needs a second look.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import { crewOf } from '@/features/world/data/crews';
import { CrewEmblem, HUD } from '@/features/world/components/hud';
import type { Territory } from '@/features/world/types';
import { INFLUENCE_M, influenceOf, type PaceZone } from '../logic/runProgress';

export const RUN = {
  panel: '#08090C',
  zone: ['#5AA9E6', '#3CC9A0', '#E8893A', '#E8607A'] as const,
};

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

export function RunTopBar({ top, kind, time, live, gps, onClose, closeLabel }: { top: number; kind: 'run' | 'walk'; time: string; live: boolean; gps: { text: string; color: string }; onClose: () => void; closeLabel: string }) {
  return (
    <View style={[styles.top, { top }]} pointerEvents="box-none">
      <Pressable onPress={onClose} style={styles.round} hitSlop={8} accessibilityRole="button" accessibilityLabel={closeLabel}>
        <Icon name="close" size={22} color={HUD.ink} />
      </Pressable>
      <View style={styles.livePill} accessibilityLabel={`${kind === 'walk' ? 'Walk' : 'Run'} ${live ? 'live' : 'paused'}, ${time}`}>
        <LiveDot on={live} />
        <Text style={styles.liveKind}>{kind === 'walk' ? 'WALK' : 'RUN'}</Text>
        <View style={styles.liveSep} />
        <Text style={styles.liveTime}>{time}</Text>
      </View>
      <View style={[styles.gps, { borderColor: alpha(gps.color, 0.5) }]} accessibilityLabel={gps.text}>
        <View style={[styles.gpsDot, { backgroundColor: gps.color }]} />
        <Text style={[styles.gpsText, { color: gps.color }]} numberOfLines={1}>{gps.text}</Text>
      </View>
    </View>
  );
}

function LiveDot({ on }: { on: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on) return;
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }));
    a.start();
    return () => a.stop();
  }, [on, v]);
  const c = on ? '#FF4D4D' : HUD.gold;
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      {on && <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: c, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] }} />}
      <View style={{ width: 8, height: 8, borderRadius: on ? 4 : 1, backgroundColor: c }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Where you are: territory + your influence in it
// ---------------------------------------------------------------------------

export const ZoneCard = memo(function ZoneCard({ territory, meters, powered }: { territory: Territory | null; meters: number; powered: boolean }) {
  const inf = territory ? influenceOf(territory, meters) : 0;
  const [v] = useState(() => new Animated.Value(inf));
  useEffect(() => {
    Animated.timing(v, { toValue: inf, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [inf, v]);
  if (!territory) {
    return (
      <View style={[styles.zone, { borderLeftColor: HUD.inkMute }]}>
        <Icon name="map-marker-radius-outline" size={20} color={HUD.inkMute} />
        <Text style={styles.zoneOff}>Off the network — keep moving to reach a territory</Text>
      </View>
    );
  }
  const owner = crewOf(territory.state.ownerCrewId);
  const locked = territory.state.status === 'locked';
  const color = locked ? HUD.gold : owner?.color ?? HUD.inkMute;
  const left = Math.max(0, Math.round((territory.tier === 5 ? INFLUENCE_M.micro : INFLUENCE_M.zone) - meters));
  return (
    <View style={[styles.zone, { borderLeftColor: color }]} accessibilityLiveRegion="polite" accessibilityLabel={`In ${territory.name}. ${owner ? `${owner.name}, ${territory.state.control} percent` : locked ? 'Locked' : 'Unclaimed'}. Your influence ${Math.round(inf * 100)} percent`}>
      <CrewEmblem crew={owner} size={40} locked={locked} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.zoneKicker} numberOfLines={1}>
          YOU’RE IN · {owner ? `${owner.short} ${territory.state.control}%` : locked ? 'LOCKED' : 'UNCLAIMED'}
        </Text>
        <Text style={styles.zoneName} numberOfLines={1}>{territory.name}</Text>
        <View style={styles.infTrack}>
          <Animated.View style={[styles.infFill, { width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 64 }}>
        <Text style={[styles.infPct, powered && { color: W.primary }]}>{Math.round(inf * 100)}%</Text>
        <Text style={styles.infLabel}>{powered ? 'POWERED' : `${left} M TO POWER`}</Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

export function StatsPanel({ km, pace, avgPace, kcal, zone, nextKmProgress, territories, streak, powered, demo }: { km: number; pace: string; avgPace: string; kcal: number; zone: PaceZone | null; nextKmProgress: number; territories: number; streak: number; powered: number; demo: boolean }) {
  const zc = zone ? RUN.zone[zone.index] : HUD.inkMute;
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={{ flex: 1.25 }}>
          <Text style={styles.label}>DISTANCE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.km} accessibilityLabel={`${km.toFixed(2)} kilometres`}>{km.toFixed(2)}</Text>
            <Text style={styles.kmUnit}>KM</Text>
          </View>
        </View>
        <View style={styles.side}>
          <View>
            <Text style={styles.label}>PACE · NOW</Text>
            <Text style={[styles.sideVal, { color: zc }]}>{pace}</Text>
          </View>
          <View>
            <Text style={styles.label}>AVG</Text>
            <Text style={styles.sideValSmall}>{avgPace}</Text>
          </View>
        </View>
      </View>

      <View style={styles.gaugeRow} accessibilityLabel={zone ? `Intensity ${zone.label}` : 'Intensity: finding your pace'}>
        {(['EASY', 'STEADY', 'TEMPO', 'FAST'] as const).map((l, i) => {
          const on = zone && zone.index >= i;
          const active = zone?.index === i;
          return (
            <View key={l} style={{ flex: 1 }}>
              <View style={[styles.gaugeBar, { backgroundColor: on ? RUN.zone[i] : alpha(HUD.ink, 0.1), opacity: on && !active ? 0.55 : 1 }]} />
              <Text style={[styles.gaugeText, active && { color: RUN.zone[i] }]}>{l}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.kmRow}>
        <Text style={styles.label}>NEXT KM</Text>
        <View style={styles.kmTrack}>
          <View style={[styles.kmFill, { width: `${Math.round(nextKmProgress * 100)}%` }]} />
        </View>
        <Text style={styles.kmLeft}>{Math.max(0, Math.round((1 - nextKmProgress) * 1000))} M</Text>
      </View>

      <View style={styles.chips}>
        <Chip icon="hexagon-multiple-outline" text={`${territories} ${territories === 1 ? 'TERRITORY' : 'TERRITORIES'}`} />
        {streak >= 2 && <Chip icon="lightning-bolt" text={`STREAK ×${streak}`} color={W.primary} />}
        {powered > 0 && <Chip icon="flash" text={`${powered} POWERED`} color={W.primary} />}
        <Chip icon="fire" text={`${kcal} KCAL`} />
        {demo && <Chip icon="test-tube" text="DEMO" color={HUD.gold} />}
      </View>
    </View>
  );
}

function Chip({ icon, text, color = HUD.inkDim }: { icon: IconName; text: string; color?: string }) {
  return (
    <View style={[styles.chip, color !== HUD.inkDim && { borderColor: alpha(color, 0.45) }]}>
      <Icon name={icon} size={12} color={color} />
      <Text style={[styles.chipText, { color }]}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls: recenter · pause (tap) · finish (hold)
// ---------------------------------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const HOLD_MS = 1100;

export function RunControls({ running, onPause, onFinish, onRecenter, following }: { running: boolean; onPause: () => void; onFinish: () => void; onRecenter: () => void; following: boolean }) {
  return (
    <View style={styles.controls}>
      <Pressable onPress={() => { tap(); onRecenter(); }} style={[styles.small, following && { borderColor: alpha(W.primary, 0.5) }]} accessibilityRole="button" accessibilityLabel={following ? 'Following you' : 'Follow me'}>
        <Icon name={following ? 'navigation-variant' : 'crosshairs-gps'} size={22} color={following ? W.primary : HUD.ink} />
      </Pressable>
      <Pressable onPress={onPause} style={({ pressed }) => [styles.pauseBtn, !running && styles.resumeBtn, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityRole="button" accessibilityLabel={running ? 'Pause' : 'Resume'}>
        <Icon name={running ? 'pause' : 'play'} size={40} color={running ? HUD.ink : W.onPrimary} />
      </Pressable>
      <HoldToFinish onFinish={onFinish} />
    </View>
  );
}

/** A flag button wrapped in a ring that fills while you hold; releasing early cancels. */
function HoldToFinish({ onFinish }: { onFinish: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [holding, setHolding] = useState(false);
  const R = 26;
  const C = 2 * Math.PI * R;
  const begin = () => {
    tap();
    setHolding(true);
    anim.current = Animated.timing(v, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      setHolding(false);
      if (finished) {
        tap('success');
        onFinish();
      }
      v.setValue(0);
    });
  };
  const end = () => anim.current?.stop();
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPressIn={begin} onPressOut={end} accessibilityRole="button" accessibilityLabel="Finish" accessibilityHint="Press and hold to finish" accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onFinish()} style={styles.small}>
        <Svg width={64} height={64} style={StyleSheet.absoluteFill}>
          <AnimatedCircle cx={32} cy={32} r={R} stroke={W.primary} strokeWidth={3} fill="none" strokeDasharray={`${C},${C}`} strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [C, 0] })} strokeLinecap="round" rotation={-90} origin="32,32" />
        </Svg>
        <Icon name="flag-checkered" size={22} color={holding ? W.primary : HUD.ink} />
      </Pressable>
      <Text style={styles.holdText}>{holding ? 'KEEP HOLDING' : 'HOLD TO FINISH'}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Paused
// ---------------------------------------------------------------------------

export function PausedCard({ kind, onResume, onFinish, onDiscard, confirmDiscard }: { kind: 'run' | 'walk'; onResume: () => void; onFinish: () => void; onDiscard: () => void; confirmDiscard: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 18, bounciness: 3 }).start();
  }, [v]);
  return (
    <Animated.View style={[styles.paused, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
      <Text style={styles.pausedTitle}>Paused</Text>
      <Text style={styles.pausedSub}>Your route and territories are safe. Nothing counts while paused.</Text>
      <Pressable onPress={() => { tap('impact'); onResume(); }} style={styles.resume} accessibilityRole="button">
        <Icon name="play" size={22} color={W.onPrimary} />
        <Text style={styles.resumeText}>RESUME {kind === 'walk' ? 'WALK' : 'RUN'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => { tap('success'); onFinish(); }} style={[styles.secondary, { flex: 1 }]} accessibilityRole="button">
          <Icon name="flag-checkered" size={18} color={HUD.ink} />
          <Text style={styles.secondaryText}>FINISH</Text>
        </Pressable>
        <Pressable onPress={onDiscard} style={[styles.secondary, { flex: 1, borderColor: confirmDiscard ? alpha('#E8607A', 0.7) : HUD.hairHi }]} accessibilityRole="button">
          <Icon name="delete-outline" size={18} color={confirmDiscard ? '#E8607A' : HUD.inkDim} />
          <Text style={[styles.secondaryText, { color: confirmDiscard ? '#E8607A' : HUD.inkDim }]} numberOfLines={1}>{confirmDiscard ? 'TAP AGAIN' : 'DISCARD'}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: HUD.panelSoft, borderWidth: 1, borderColor: HUD.hair },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hair, paddingHorizontal: 12, height: 42 },
  liveKind: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 14, letterSpacing: 2 },
  liveSep: { width: 1, height: 16, backgroundColor: HUD.hairHi },
  liveTime: { color: HUD.ink, fontFamily: fonts.display, fontSize: 18, letterSpacing: 1, minWidth: 54 },
  gps: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, alignSelf: 'center', paddingHorizontal: 10, height: 30, backgroundColor: HUD.panelSoft, borderWidth: 1, marginLeft: 'auto', maxWidth: 170 },
  gpsDot: { width: 6, height: 6, borderRadius: 3 },
  gpsText: { fontFamily: fonts.labelBold, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' },

  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: RUN.panel, borderWidth: 1, borderColor: HUD.hair, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 9 },
  zoneOff: { flex: 1, color: HUD.inkDim, fontFamily: fonts.medium, fontSize: 13 },
  zoneKicker: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.6 },
  zoneName: { color: HUD.ink, fontFamily: fonts.display, fontSize: 21, letterSpacing: 0.6, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  infTrack: { height: 4, backgroundColor: alpha(HUD.ink, 0.1), marginTop: 5 },
  infFill: { height: 4, backgroundColor: W.primary },
  infPct: { color: HUD.ink, fontFamily: fonts.display, fontSize: 22, transform: [{ skewX: DISPLAY_SKEW }] },
  infLabel: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.2 },

  panel: { backgroundColor: RUN.panel, borderWidth: 1, borderColor: HUD.hair, padding: 14, paddingBottom: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  label: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10.5, letterSpacing: 1.8 },
  km: { color: HUD.ink, fontFamily: fonts.display, fontSize: 68, lineHeight: 76, letterSpacing: 0.5, transform: [{ skewX: DISPLAY_SKEW }] },
  kmUnit: { color: W.primary, fontFamily: fonts.display, fontSize: 22, marginLeft: 6, letterSpacing: 1 },
  side: { flex: 1, gap: 8, paddingBottom: 8, borderLeftWidth: 1, borderLeftColor: HUD.hair, paddingLeft: 12 },
  sideVal: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, transform: [{ skewX: DISPLAY_SKEW }] },
  sideValSmall: { color: HUD.ink, fontFamily: fonts.display, fontSize: 19, transform: [{ skewX: DISPLAY_SKEW }] },
  gaugeRow: { flexDirection: 'row', gap: 4 },
  gaugeBar: { height: 6, transform: [{ skewX: '-20deg' }] },
  gaugeText: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.2, marginTop: 4 },
  kmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kmTrack: { flex: 1, height: 3, backgroundColor: alpha(HUD.ink, 0.1) },
  kmFill: { height: 3, backgroundColor: HUD.ink },
  kmLeft: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1, minWidth: 46, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: HUD.hair, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  small: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hairHi },
  pauseBtn: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: RUN.panel, borderWidth: 2, borderColor: HUD.ink },
  resumeBtn: { backgroundColor: W.primaryFill, borderColor: W.primaryFill },
  holdText: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9, letterSpacing: 1.4, marginTop: 4, position: 'absolute', bottom: -16, width: 120, textAlign: 'center' },

  paused: { backgroundColor: RUN.panel, borderWidth: 1, borderColor: HUD.hairHi, padding: 16, gap: 12 },
  pausedTitle: { color: HUD.gold, fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: 1.5, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  pausedSub: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  resume: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: W.primaryFill, height: 58, transform: [{ skewX: DISPLAY_SKEW }] },
  resumeText: { color: W.onPrimary, fontFamily: fonts.display, fontSize: 21, letterSpacing: 1.6 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderWidth: 1, borderColor: HUD.hairHi },
  secondaryText: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 14, letterSpacing: 1.6 },
});
