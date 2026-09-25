import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';
import { Scene } from '@/art/Scene';
import { Mascot } from '@/art/Mascot';
import { RewardArt } from '@/art/Reward';
import { RewardCard } from '@/components/cards';
import { Button, Display, IconButton, NATIVE, Scrim, Tagline, XPBar, Icon, tap } from '@/components/ui';
import { levelRewards } from '@/data/rewards';
import { useApp, XP_PER_LEVEL } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

function Rays({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const c = size / 2;
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = a0 + Math.PI / 32;
    return `M${c},${c} L${c + Math.cos(a0) * c},${c + Math.sin(a0) * c} L${c + Math.cos(a1) * c},${c + Math.sin(a1) * c} Z`;
  }).join(' ');
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rays" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.gold} stopOpacity="0.55" />
            <Stop offset="0.6" stopColor={colors.primary} stopOpacity="0.18" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Path d={rays} fill="url(#rays)" />
        <Circle cx={c} cy={c} r={c * 0.42} fill="url(#rays)" />
      </Svg>
    </Animated.View>
  );
}

function Confetti({ visible }: { visible: boolean }) {
  const pieces = useRef(
    Array.from({ length: 30 }, () => ({
      x: Math.random(),
      y: -0.1 - Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 0.02,
      vy: 0.003 + Math.random() * 0.005,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.05,
      color: ['#FF6B00', '#FFB020', '#FFFFFF', '#BDBDBD', '#FF8A4C', '#F5F5F5'][Math.floor(Math.random() * 6)],
      size: 6 + Math.random() * 10,
      delay: Math.random() * 200,
    }))
  ).current;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [visible, anim]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            {
              position: 'absolute',
              left: `${p.x * 100}%`,
              top: 0,
              width: p.size,
              height: p.size,
              borderRadius: p.size * 0.3,
              backgroundColor: p.color,
            },
            {
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [`${p.y * 100}%`, `${(p.y + p.vy * 2000) * 100}%`] }) },
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${p.vx * 2000}%`] }) },
                { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}rad`, `${p.rot + p.vr * 2000}rad`] }) },
              ],
              opacity: anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 1, 0] }),
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

/** LEVEL UP — RPG-style progression / reward reveal. */
export default function LevelUp() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { level, levelXp } = useApp();
  const { gained, coins, leveledUp } = useLocalSearchParams<{ gained?: string; coins?: string; leveledUp?: string }>();
  const title = useRef(new Animated.Value(0)).current;
  const cards = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const showConfetti = useRef(false);
  const isLevelUp = leveledUp === '1' || !gained;

  useEffect(() => {
    if (isLevelUp) {
      tap('success');
      // Trigger haptic pattern for level up
      setTimeout(() => tap('impact'), 100);
      setTimeout(() => tap('success'), 200);
      showConfetti.current = true;
    }
    Animated.sequence([
      Animated.spring(title, { toValue: 1, useNativeDriver: NATIVE, speed: 8, bounciness: 14 }),
      Animated.stagger(140, cards.map((c) => Animated.spring(c, { toValue: 1, useNativeDriver: NATIVE, speed: 10, bounciness: 10 }))),
    ]).start();
  }, [title, cards, isLevelUp]);

  const current = levelRewards.filter((r) => r.level === 13).slice(0, 3);
  const next = levelRewards.find((r) => r.level > level && r.kind === 'trail') ?? levelRewards.find((r) => r.level > level);
  const heroSize = Math.min(width, MAX_WIDTH) * 0.62;

  return (
    <View style={styles.root}>
      <Scene kind="city-night" seed={13} aspect={width / height} style={StyleSheet.absoluteFill} />
      <Scrim strong style={{ top: '30%' }} />
      <Confetti visible={isLevelUp && showConfetti.current} />
      <View style={[styles.col, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }]}>
        <IconButton icon="close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} label="Close" />

        <Animated.View style={{ alignItems: 'center', opacity: title, transform: [{ scale: title.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <Tagline size={Math.min(64, width * 0.15)} color={colors.primary} rotate={-6}>{isLevelUp ? 'Level Up!' : 'Nice work!'}</Tagline>
          <Display size={30} style={{ marginTop: -2, transform: [{ rotate: '-4deg' }] }}>Level {level}</Display>
          {!!gained && (
            <View style={styles.gains}>
              <View style={styles.gain}>
                <Icon name="star-four-points" size={14} color={colors.primary} />
                <Text style={styles.gainText}>+{gained} XP</Text>
              </View>
              {!!coins && (
                <View style={styles.gain}>
                  <Icon name="circle-multiple" size={14} color={colors.gold} />
                  <Text style={[styles.gainText, { color: colors.gold }]}>+{coins} coins</Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: heroSize * 0.8 }}>
          <Rays size={heroSize * 1.35} />
          <Mascot pose="celebrate" accessory="crown" size={heroSize} animated />
        </View>

        <XPBar value={levelXp} max={XP_PER_LEVEL} />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {current.map((r, i) => (
            <Animated.View key={r.title} style={{ flex: 1, opacity: cards[i], transform: [{ translateY: cards[i].interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }, { scale: cards[i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
              <RewardCard kind={r.kind} title={r.title} subtitle={r.subtitle} />
            </Animated.View>
          ))}
        </View>

        {next && (
          <View style={styles.next}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nextKicker}>Next unlock</Text>
              <Text style={styles.nextTitle}>{next.title}</Text>
              <Text style={styles.nextSub}>at Level {next.level} · {((next.level - level) * XP_PER_LEVEL - levelXp).toLocaleString('en-IN')} XP to go</Text>
            </View>
            <RewardArt kind={next.kind} size={78} />
          </View>
        )}

        <Button label="View all rewards" icon="arrow-right" onPress={() => router.replace('/rewards')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  col: { flex: 1, paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  gains: { flexDirection: 'row', gap: 8, marginTop: 10 },
  gain: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(10,10,10,0.7)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.line },
  gainText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },
  next: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, backgroundColor: 'rgba(22,22,22,0.94)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', padding: 14 },
  nextKicker: { color: colors.violet, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  nextTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 22, marginTop: 2 },
  nextSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
});
