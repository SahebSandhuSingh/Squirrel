/**
 * The network's game moments, choreographed with the map engine's effects:
 *
 *   CLAIM / CAPTURE  the boundary expands outward (engine) → the screen dims, the crew emblem
 *                    locks in, "TERRITORY CLAIMED" lands, XP counts up → everything settles.
 *   DISCOVERY        the fog burns off (engine) while a scanner banner reveals the name and XP.
 *   BATTLE           a VS card when you open a contested territory.
 *   SMALL MOVES      a compact stamp (defence held, challenge launched…).
 *
 * All transform/opacity animations on the native driver; every moment can be tapped away.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, NATIVE } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, DISPLAY_SKEW, fonts } from '@/theme';
import { crewOf } from '../data/crews';
import { clearMoment, getTerritory, type Moment } from '../state/worldStore';
import { BattleBar, CrewEmblem, HUD, W } from './hud';

export function WorldMoment({ m, top }: { m: Moment; top: number }) {
  if (m.kind === 'discover') return <Discovery key={m.id} m={m} top={top} />;
  if (m.kind === 'claim' || m.kind === 'capture') return <Claim key={m.id} m={m} />;
  return <Stamp key={m.id} m={m as StampMoment} />;
}

function useCountUp(to: number, delay: number, ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = Date.now() + delay;
    const step = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - t0) / ms));
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms]);
  return n;
}

// ---------------------------------------------------------------------------

function Discovery({ m, top }: { m: Extract<Moment, { kind: 'discover' }>; top: number }) {
  const t = getTerritory(m.territoryId);
  const [v] = useState(() => new Animated.Value(0));
  const [scan] = useState(() => new Animated.Value(0));
  const xp = useCountUp(m.xp, 500, 700);
  useEffect(() => {
    const a = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      Animated.delay(2300),
      Animated.timing(v, { toValue: 2, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]);
    Animated.timing(scan, { toValue: 1, duration: 1100, delay: 250, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }).start();
    a.start(({ finished }) => finished && clearMoment(m.id));
    return () => a.stop();
  }, [v, scan, m.id]);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.discWrap, { top, opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [-16, 0, -10] }) }] }]}>
      <Pressable onPress={() => clearMoment(m.id)} style={styles.disc} accessibilityRole="alert" accessibilityLabel={`New territory discovered: ${t?.name}. Plus ${m.xp} XP`}>
        <View style={styles.discInner}>
          <Animated.View style={[styles.scan, { transform: [{ translateX: scan.interpolate({ inputRange: [0, 1], outputRange: [-60, 420] }) }] }]} />
          <Icon name="radar" size={22} color={W.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.discKicker}>NEW TERRITORY DISCOVERED</Text>
            <Text style={styles.discName} numberOfLines={1}>{t?.name}</Text>
          </View>
          <Text style={styles.discXp}>+{xp} XP</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------

const CLAIM_MS = { in: 380, hold: 2100, out: 420 };

function Claim({ m }: { m: Extract<Moment, { kind: 'claim' | 'capture' }> }) {
  const t = getTerritory(m.territoryId);
  const crew = crewOf(m.crewId);
  const color = crew?.color ?? W.primary;
  const [dim] = useState(() => new Animated.Value(0));
  const [emblem] = useState(() => new Animated.Value(0));
  const [title] = useState(() => new Animated.Value(0));
  const [rays] = useState(() => new Animated.Value(0));
  const xp = useCountUp(m.xp, 900, 900);

  useEffect(() => {
    const a = Animated.sequence([
      Animated.timing(dim, { toValue: 1, duration: CLAIM_MS.in, useNativeDriver: NATIVE }),
      Animated.parallel([
        Animated.spring(emblem, { toValue: 1, useNativeDriver: NATIVE, speed: 14, bounciness: 6 }),
        Animated.timing(rays, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
        Animated.sequence([Animated.delay(160), Animated.spring(title, { toValue: 1, useNativeDriver: NATIVE, speed: 18, bounciness: 4 })]),
      ]),
      Animated.delay(CLAIM_MS.hold - 900),
      Animated.parallel([Animated.timing(dim, { toValue: 0, duration: CLAIM_MS.out, useNativeDriver: NATIVE }), Animated.timing(title, { toValue: 2, duration: CLAIM_MS.out, useNativeDriver: NATIVE }), Animated.timing(emblem, { toValue: 2, duration: CLAIM_MS.out, useNativeDriver: NATIVE })]),
    ]);
    a.start(({ finished }) => finished && clearMoment(m.id));
    return () => a.stop();
  }, [dim, emblem, title, rays, m.id]);

  const heading = m.kind === 'capture' ? 'Territory captured' : 'Territory claimed';
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={() => clearMoment(m.id)} accessibilityRole="alert" accessibilityLabel={`${heading}: ${t?.name}. Plus ${m.xp} XP`}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim }]} />
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.rays, { borderColor: alpha(color, 0.5), opacity: rays.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: rays.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.6] }) }] }]} />
        <Animated.View style={[styles.rays, { width: 140, height: 140, borderRadius: 70, borderColor: alpha(color, 0.35), opacity: rays.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: rays.interpolate({ inputRange: [0, 1], outputRange: [0.2, 3.2] }) }] }]} />
        <Animated.View style={{ opacity: emblem.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: emblem.interpolate({ inputRange: [0, 1, 2], outputRange: [1.8, 1, 0.9] }) }] }}>
          <CrewEmblem crew={crew} size={88} />
        </Animated.View>
        <Animated.View style={{ alignItems: 'center', marginTop: 18, opacity: title.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ translateY: title.interpolate({ inputRange: [0, 1, 2], outputRange: [24, 0, -12] }) }, { scale: title.interpolate({ inputRange: [0, 1, 2], outputRange: [1.15, 1, 1] }) }] }}>
          <Text style={[styles.claimKicker, { color }]}>{crew?.name}</Text>
          <Text style={styles.claimTitle}>{heading}</Text>
          <Text style={styles.claimName} numberOfLines={1}>{t?.name}</Text>
          <View style={[styles.xpPlate, { backgroundColor: color }]}>
            <Text style={styles.xpPlateText}>+{xp} XP</Text>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const STAMP: Record<Exclude<Moment['kind'], 'discover' | 'claim' | 'capture'>, { title: string; icon: IconName; color: string }> = {
  defend: { title: 'Defence held', icon: 'shield-check', color: W.primary },
  repel: { title: 'Attackers repelled', icon: 'shield-check', color: HUD.contested },
  challenge: { title: 'Challenge launched', icon: 'sword-cross', color: '#E8607A' },
  push: { title: 'Front line pushed', icon: 'sword-cross', color: '#E8607A' },
};

type StampMoment = Extract<Moment, { kind: 'defend' | 'repel' | 'challenge' | 'push' }>;

function Stamp({ m }: { m: StampMoment }) {
  const ui = STAMP[m.kind];
  const t = getTerritory(m.territoryId);
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 18, bounciness: 5 }),
      Animated.delay(1300),
      Animated.timing(v, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]);
    a.start(({ finished }) => finished && clearMoment(m.id));
    return () => a.stop();
  }, [v, m.id]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="box-none">
      <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [1.25, 1, 0.96] }) }, { rotate: '-3deg' }] }}>
        <Pressable onPress={() => clearMoment(m.id)} style={[styles.stamp, { borderColor: ui.color }]} accessibilityRole="alert" accessibilityLabel={`${ui.title}. ${t?.name}. Plus ${m.xp} XP`}>
          <Icon name={ui.icon} size={26} color={ui.color} />
          <View>
            <Text style={[styles.stampTitle, { color: ui.color }]}>{ui.title}</Text>
            <Text style={styles.stampSub}>
              {t?.name} · +{m.xp} XP
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------

/** The VS alert when a rival opens a front on one of your territories. Tap to go defend it. */
export function BattleBanner({ id, top, onDone, onOpen }: { id: string; top: number; onDone: () => void; onOpen: () => void }) {
  const t = getTerritory(id);
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      Animated.delay(4200),
      Animated.timing(v, { toValue: 2, duration: 300, useNativeDriver: NATIVE }),
    ]);
    a.start(({ finished }) => finished && onDone());
    return () => a.stop();
  }, [v, onDone]);
  const owner = crewOf(t?.state.ownerCrewId);
  const chal = crewOf(t?.state.challengerCrewId);
  if (!t || !owner || !chal) return null;
  const attack = t.state.status === 'under_attack';
  return (
    <Animated.View pointerEvents="box-none" style={[styles.discWrap, { top, opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.94, 1, 1] }) }] }]}>
      <Pressable onPress={onOpen} style={[styles.battle, { borderColor: alpha(attack ? HUD.attack : HUD.contested, 0.55) }]} accessibilityRole="alert" accessibilityHint="Opens the territory" accessibilityLabel={`${attack ? 'Under attack' : 'Territory contested'}: ${t.name}. ${owner.name} ${t.state.control} percent versus ${chal.name} ${100 - t.state.control} percent`}>
        <Text style={[styles.discKicker, { color: attack ? HUD.attack : HUD.contested, textAlign: 'center' }]}>{attack ? '⚠ UNDER ATTACK' : 'TERRITORY CONTESTED'}</Text>
        <Text style={[styles.discName, { textAlign: 'center' }]} numberOfLines={1}>{t.name}</Text>
        <View style={styles.vs}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.vsCrew, { color: owner.color }]} numberOfLines={1}>{owner.name}</Text>
            <Text style={[styles.vsPct, { color: owner.color }]}>{t.state.control}%</Text>
          </View>
          <Text style={styles.vsMid}>VS</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={[styles.vsCrew, { color: chal.color }]} numberOfLines={1}>{chal.name}</Text>
            <Text style={[styles.vsPct, { color: chal.color }]}>{100 - t.state.control}%</Text>
          </View>
        </View>
        <BattleBar left={owner.color} right={chal.color} leftPct={t.state.control} height={5} />
        <Text style={styles.battleCta}>TAP TO DEFEND ›</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  discWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  disc: { width: '100%', maxWidth: 440, backgroundColor: HUD.panel, borderWidth: 1, borderColor: alpha(W.primary, 0.45), overflow: 'hidden' },
  discInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  scan: { position: 'absolute', top: 0, bottom: 0, width: 60, backgroundColor: alpha(W.primary, 0.12) },
  discKicker: { color: W.primary, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2.2 },
  discName: { color: HUD.ink, fontFamily: fonts.display, fontSize: 26, lineHeight: 31, letterSpacing: 0.8, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  discXp: { color: W.primary, fontFamily: fonts.display, fontSize: 22, transform: [{ skewX: DISPLAY_SKEW }] },
  dim: { backgroundColor: 'rgba(3,4,6,0.72)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 2 },
  claimKicker: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase' },
  claimTitle: { color: HUD.ink, fontFamily: fonts.display, fontSize: 44, lineHeight: 50, letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center', transform: [{ skewX: DISPLAY_SKEW }] },
  claimName: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 3, textTransform: 'uppercase', marginTop: 2 },
  xpPlate: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 6, transform: [{ skewX: DISPLAY_SKEW }] },
  xpPlateText: { color: '#0B0B0B', fontFamily: fonts.display, fontSize: 26, letterSpacing: 1 },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: HUD.panel, borderWidth: 2, paddingHorizontal: 18, paddingVertical: 12 },
  stampTitle: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  stampSub: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  battle: { width: '100%', maxWidth: 440, backgroundColor: HUD.panel, borderWidth: 1, padding: 14, gap: 8 },
  vs: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  vsCrew: { fontFamily: fonts.labelBold, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase' },
  vsPct: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, transform: [{ skewX: DISPLAY_SKEW }] },
  battleCta: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2, textAlign: 'center', marginTop: 2 },
  vsMid: { color: HUD.inkMute, fontFamily: fonts.script, fontSize: 18, marginBottom: 6 },
});
