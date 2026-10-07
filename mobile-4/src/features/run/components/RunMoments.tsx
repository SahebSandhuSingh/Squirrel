/**
 * Moments while you move — short, readable mid-stride, never blocking the controls:
 *
 *   ENTERING    a banner slides down when you cross into a territory (crew colour, control,
 *               streak) — "NEW TERRITORY" the first time this run.
 *   POWERED     you've covered enough ground in a territory: a lime stamp and preview XP.
 *   SPLIT       every km: the split time, and whether it beat the last one.
 *
 * One at a time, from a small queue, so a burst of crossings never stacks up on screen.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Icon, NATIVE } from '@/components/ui';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import { crewOf } from '@/features/world/data/crews';
import { HUD } from '@/features/world/components/hud';
import { getTerritory } from '@/features/world/state/worldStore';
import type { RunEvent } from '../logic/runProgress';

export type RunMoment = RunEvent & { key: number; prevSplit?: number };

const HOLD = { enter: 2000, powered: 2200, split: 2400 } as const;

export function RunMomentView({ m, top, onDone }: { m: RunMoment; top: number; onDone: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 16, bounciness: 4 }),
      Animated.delay(HOLD[m.kind]),
      Animated.timing(v, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]);
    a.start(({ finished }) => finished && onDone());
    return () => a.stop();
  }, [v, m.key, m.kind, onDone]);
  const fade = { opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }) };

  if (m.kind === 'enter') {
    const t = getTerritory(m.id);
    if (!t) return null;
    const owner = crewOf(t.state.ownerCrewId);
    const color = t.state.status === 'locked' ? HUD.gold : owner?.color ?? HUD.inkMute;
    return (
      <Animated.View pointerEvents="none" style={[styles.bannerWrap, { top }, fade, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [-30, 0, -12] }) }] }]}>
        <View style={[styles.banner, { borderLeftColor: color }]} accessibilityRole="alert" accessibilityLabel={`${m.first ? 'New territory' : 'Entering'} ${t.name}`}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: m.first ? W.primary : HUD.inkDim }]}>{m.first ? 'NEW TERRITORY' : 'ENTERING'}</Text>
            <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
            <Text style={[styles.sub, { color }]} numberOfLines={1}>
              {owner ? `${owner.name} · ${t.state.control}%` : t.state.status === 'locked' ? 'Protected ground' : 'Unclaimed — first to claim it holds it'}
              {t.state.status === 'contested' ? ' · CONTESTED' : t.state.status === 'under_attack' ? ' · UNDER ATTACK' : ''}
            </Text>
          </View>
          {m.first && m.streak >= 2 && (
            <View style={styles.streak}>
              <Icon name="lightning-bolt" size={14} color={W.onPrimary} />
              <Text style={styles.streakText}>×{m.streak}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  const scale = { transform: [{ scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [1.3, 1, 0.96] }) }, { rotate: '-3deg' }] };
  if (m.kind === 'powered') {
    const t = getTerritory(m.id);
    return (
      <Animated.View pointerEvents="none" style={[styles.stampWrap, { top: top + 90 }, fade]}>
        <Animated.View style={[styles.stamp, { borderColor: W.primary }, scale]} accessibilityRole="alert" accessibilityLabel={`Territory powered: ${t?.name}`}>
          <Icon name="flash" size={28} color={W.primary} />
          <View>
            <Text style={[styles.stampTitle, { color: W.primary }]}>Territory powered</Text>
            <Text style={styles.stampSub}>{t?.name} · +60 XP · PREVIEW</Text>
          </View>
        </Animated.View>
      </Animated.View>
    );
  }

  // split
  const faster = m.prevSplit != null && m.sec < m.prevSplit;
  const diff = m.prevSplit != null ? Math.abs(m.sec - m.prevSplit) : null;
  return (
    <Animated.View pointerEvents="none" style={[styles.stampWrap, { top: top + 90 }, fade]}>
      <Animated.View style={[styles.split, scale]} accessibilityRole="alert" accessibilityLabel={`Kilometre ${m.km}, split ${fmt(m.sec)}`}>
        <Text style={styles.splitKm}>KM {m.km}</Text>
        <Text style={styles.splitTime}>{fmt(m.sec)}</Text>
        {diff != null && (
          <View style={[styles.delta, { backgroundColor: faster ? W.primaryFill : alpha(HUD.ink, 0.12) }]}>
            <Icon name={faster ? 'arrow-up-bold' : 'arrow-down-bold'} size={12} color={faster ? W.onPrimary : HUD.inkDim} />
            <Text style={[styles.deltaText, { color: faster ? W.onPrimary : HUD.inkDim }]}>{faster ? `${diff}s faster` : `${diff}s slower`}</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;

// ---------------------------------------------------------------------------

/** 3 · 2 · 1 · GO — each number lands with a ring that sweeps out, then GO flashes lime. */
export function RunCountdown({ count, where }: { count: number; where: string | null }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 820, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [count, v]);
  return (
    <View style={styles.cd} accessibilityLiveRegion="assertive" accessibilityLabel={`Starting in ${count}`}>
      <Animated.View style={[styles.ring, { opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }] }]} />
      <Animated.Text style={[styles.cdNum, { opacity: v.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0.2] }), transform: [{ scale: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1.8, 1, 0.92] }) }, { skewX: DISPLAY_SKEW }] }]}>{count}</Animated.Text>
      <Text style={styles.cdSub}>GET READY</Text>
      {where && <Text style={styles.cdWhere}>STARTING IN {where.toUpperCase()}</Text>}
    </View>
  );
}

/** The flash after 1: "GO". */
export function GoFlash({ onDone }: { onDone: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }).start(({ finished }) => finished && onDone());
  }, [v, onDone]);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.go, { opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }) }]}>
      <Animated.Text style={[styles.goText, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.6] }) }, { skewX: DISPLAY_SKEW }] }]}>GO</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  banner: { width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#08090C', borderWidth: 1, borderColor: HUD.hair, borderLeftWidth: 4, paddingHorizontal: 14, paddingVertical: 10 },
  kicker: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2.4 },
  name: { color: HUD.ink, fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: 0.8, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  sub: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: W.primaryFill, paddingHorizontal: 8, paddingVertical: 5, transform: [{ skewX: DISPLAY_SKEW }] },
  streakText: { color: W.onPrimary, fontFamily: fonts.display, fontSize: 18 },
  stampWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#08090C', borderWidth: 2, paddingHorizontal: 18, paddingVertical: 12 },
  stampTitle: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  stampSub: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  split: { alignItems: 'center', backgroundColor: '#08090C', borderWidth: 2, borderColor: HUD.ink, paddingHorizontal: 26, paddingVertical: 12 },
  splitKm: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 3 },
  splitTime: { color: HUD.ink, fontFamily: fonts.display, fontSize: 52, lineHeight: 58, transform: [{ skewX: DISPLAY_SKEW }] },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  deltaText: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  cd: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,4,6,0.78)' },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 3, borderColor: W.primary },
  cdNum: { color: W.primary, fontFamily: fonts.display, fontSize: 170, lineHeight: 190 },
  cdSub: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 15, letterSpacing: 5, marginTop: 4 },
  cdWhere: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 2.4, marginTop: 10 },
  go: { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(W.primaryFill, 0.16) },
  goText: { color: W.primary, fontFamily: fonts.display, fontSize: 150, letterSpacing: 4 },
});
