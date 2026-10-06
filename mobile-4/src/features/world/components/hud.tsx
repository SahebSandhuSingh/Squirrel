/**
 * HUD primitives for the territory network: crew emblems, level pips, stat cells, the battle bar
 * and the hold-to-confirm game button. The world is always drawn dark (like the live workout),
 * so these use the dark palette whatever the app theme is.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import type { Crew } from '../types';

export { W };

/** Map-side colours that the HUD mirrors. */
export const HUD = {
  panel: 'rgba(8,9,12,0.94)',
  /** Sheets and panels: opaque, so map labels never show through text. */
  solid: '#08090C',
  panelSoft: 'rgba(8,9,12,0.82)',
  hair: 'rgba(237,230,214,0.10)',
  hairHi: 'rgba(237,230,214,0.2)',
  ink: '#EDE6D6',
  inkDim: '#A9A49A',
  inkMute: '#6E6A61',
  gold: '#E6CF8A',
  attack: '#FF5A36',
  contested: '#FFD21F',
};

const hexPoints = (s: number) => {
  const r = s / 2 - 1.5;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(s / 2 + Math.cos(a) * r).toFixed(2)},${(s / 2 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
};

/** Crew emblem: a hex badge in the crew colour with its glyph. Unowned ground gets a dashed hex. */
export const CrewEmblem = memo(function CrewEmblem({ crew, size = 40, locked }: { crew: Crew | null; size?: number; locked?: boolean }) {
  const color = locked ? HUD.gold : crew?.color ?? HUD.inkMute;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Polygon points={hexPoints(size)} fill={alpha(color, 0.12)} stroke={color} strokeWidth={crew || locked ? 1.6 : 1} strokeDasharray={crew || locked ? undefined : '3,3'} />
      </Svg>
      <Icon name={(locked ? 'lock' : crew?.icon ?? 'flag-outline') as IconName} size={size * 0.46} color={color} />
    </View>
  );
});

/** Five pips, filled up to the territory level. */
export function LevelPips({ level, color, size = 6 }: { level: number; color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }} accessibilityLabel={`Level ${level} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: size * 0.62, height: size + i * (size * 0.36), backgroundColor: i < level ? color : alpha(W.text, 0.12), transform: [{ skewX: '-12deg' }] }} />
      ))}
    </View>
  );
}

/** Small caps label with a tick, like a tactical HUD. */
export function HudKicker({ children, color = HUD.inkDim, style }: { children: React.ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
      <View style={{ width: 8, height: 1.5, backgroundColor: color }} />
      <Text style={[s.kicker, { color }]}>{children}</Text>
    </View>
  );
}

export function Stat({ label, value, color = HUD.ink, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={s.stat} accessibilityLabel={`${label} ${value}${sub ? ` ${sub}` : ''}`}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={s.statSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

/** Owner vs challenger, as one bar. The split animates when control changes. */
export function BattleBar({ left, right, leftPct, height = 8 }: { left: string; right: string; leftPct: number; height?: number }) {
  // Opens from an even split, then the front line slides to where it really is.
  const [v] = useState(() => new Animated.Value(50));
  useEffect(() => {
    Animated.timing(v, { toValue: leftPct, duration: 900, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [leftPct, v]);
  return (
    <View style={{ height, flexDirection: 'row', backgroundColor: right, overflow: 'hidden' }}>
      <Animated.View style={{ width: v.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), backgroundColor: left }} />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: HUD.ink, left: v.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export type GameButtonTone = 'primary' | 'danger' | 'gold' | 'scout' | 'ghost';

const TONE: Record<GameButtonTone, { bg: string; fg: string; border: string }> = {
  primary: { bg: W.primaryFill, fg: W.onPrimary, border: W.primaryFill },
  danger: { bg: '#E8607A', fg: '#0B0B0B', border: '#E8607A' },
  gold: { bg: HUD.contested, fg: '#0B0B0B', border: HUD.contested },
  scout: { bg: 'transparent', fg: HUD.ink, border: HUD.ink },
  ghost: { bg: 'transparent', fg: HUD.inkDim, border: HUD.hairHi },
};

/**
 * The game control: a slanted plate. With `hold`, it charges while pressed (≈0.75 s) and fires
 * when full, so a big move can't happen by accident. Screen readers get a plain "activate".
 */
export function GameButton({ label, sub, icon, tone = 'primary', hold, disabled, busy, onFire, style }: { label: string; sub?: string; icon?: IconName; tone?: GameButtonTone; hold?: boolean; disabled?: boolean; busy?: boolean; onFire: () => void; style?: StyleProp<ViewStyle> }) {
  const t = TONE[tone];
  const [charge] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(0));
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [sr, setSr] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setSr);
  }, []);
  const holdMode = !!hold && !sr;
  const begin = () => {
    if (disabled || busy) return;
    Animated.spring(press, { toValue: 1, useNativeDriver: NATIVE, speed: 40, bounciness: 0 }).start();
    if (!holdMode) return;
    tap();
    anim.current = Animated.timing(charge, { toValue: 1, duration: 750, easing: Easing.in(Easing.quad), useNativeDriver: false });
    anim.current.start(({ finished }) => {
      if (finished) {
        tap('success');
        onFire();
        charge.setValue(0);
      }
    });
  };
  const end = () => {
    Animated.spring(press, { toValue: 0, useNativeDriver: NATIVE, speed: 30, bounciness: 4 }).start();
    if (!holdMode) return;
    anim.current?.stop();
    Animated.timing(charge, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };
  return (
    <Pressable
      onPressIn={begin}
      onPressOut={end}
      onPress={() => {
        if (disabled || busy || holdMode) return;
        tap('impact');
        onFire();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}${sub ? `, ${sub}` : ''}`}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      accessibilityHint={holdMode ? 'Press and hold to confirm' : undefined}
      style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
      <Animated.View style={[s.plate, { backgroundColor: t.bg, borderColor: t.border, transform: [{ skewX: DISPLAY_SKEW }, { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] }]}>
        {holdMode && (
          <>
            {/* The charge: a dark sweep across the plate with a bright leading edge and a meter. */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', 0.22), width: charge.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#FFFFFF', opacity: charge.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.9, 0.9] }), left: charge.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
            <Animated.View style={{ position: 'absolute', left: 0, bottom: 0, height: 4, backgroundColor: t.fg, width: charge.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
          </>
        )}
        <View style={[s.plateInner, { transform: [{ skewX: '6deg' }] }]}>
          {icon && <Icon name={icon} size={18} color={t.fg} />}
          <Text style={[s.plateLabel, { color: t.fg }]}>{busy ? 'Working…' : label}</Text>
          {sub ? <Text style={[s.plateSub, { color: t.fg }]}>{sub}</Text> : null}
        </View>
      </Animated.View>
      {holdMode && !disabled && <Text style={s.holdHint}>HOLD TO CONFIRM</Text>}
    </Pressable>
  );
}

/** Corner brackets — the tactical frame around HUD cards. */
export function Brackets({ color = HUD.hairHi, size = 10 }: { color?: string; size?: number }) {
  const c = (style: ViewStyle) => <View style={[{ position: 'absolute', width: size, height: size, borderColor: color }, style]} />;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {c({ left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5 })}
      {c({ right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5 })}
      {c({ left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5 })}
      {c({ right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5 })}
    </View>
  );
}

export function Chevron({ color = HUD.inkMute }: { color?: string }) {
  return (
    <Svg width={8} height={10} accessibilityElementsHidden>
      <Path d="M1 1 L6 5 L1 9" stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

export const compact = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : n.toLocaleString('en-IN'));

export const s = StyleSheet.create({
  kicker: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  stat: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 1, borderLeftColor: HUD.hair, minWidth: 0 },
  statLabel: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
  statValue: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.5, marginTop: 2, transform: [{ skewX: DISPLAY_SKEW }] },
  statSub: { color: HUD.inkDim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.6 },
  plate: { minHeight: 54, borderWidth: 1.5, overflow: 'hidden', justifyContent: 'center' },
  plateInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  plateLabel: { fontFamily: fonts.display, fontSize: 19, letterSpacing: 1.6, textTransform: 'uppercase' },
  plateSub: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1, opacity: 0.8 },
  holdHint: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 2, textAlign: 'center', marginTop: 5 },
});
