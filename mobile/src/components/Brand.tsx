import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { NATIVE } from '@/components/ui';
import { colors, fonts } from '@/theme';

/** The Squirrel Social mark from the website (assets/logo.svg): lime line-art squirrel head. */
export function Logo({ size = 32, color = colors.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M10 6 L22 20 Q32 16 42 20 L54 6 L55 30 Q55 50 32 58 Q9 50 9 30 Z" />
      <Path d="M15 14 L20 22 M49 14 L44 22" />
      <Path d="M18 32 Q23 27 28 32 Q23 36 18 32 Z" fill={color} />
      <Path d="M36 32 Q41 27 46 32 Q41 36 36 32 Z" fill={color} />
      <Path d="M28 42 L32 46 L36 42 Z" fill={color} />
      <Path d="M24 49 Q32 54 40 49" />
    </Svg>
  );
}

/** Logo + wordmark, as in the website's nav bar. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Logo size={size} />
      <Text style={{ color: colors.text, fontFamily: fonts.label, fontSize: size * 0.62, letterSpacing: 1.2, textTransform: 'uppercase' }}>Squirrel Social</Text>
    </View>
  );
}

/**
 * The website's marquee "tape" strip: a tilted lime (or pink) band with scrolling caps.
 * Loops forever; motion is subtle and linear.
 */
export function Tape({ items, color = colors.primary, rotate = -3, style }: { items: string[]; color?: string; rotate?: number; style?: StyleProp<ViewStyle> }) {
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!w) return;
    x.setValue(0);
    const loop = Animated.loop(Animated.timing(x, { toValue: -w, duration: w * 28, easing: Easing.linear, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [w, x]);
  const text = items.map((i) => `${i}  ✦  `).join('');
  const fg = color === colors.primary ? colors.onPrimary : '#FFFFFF';
  return (
    <View style={[styles.tape, { backgroundColor: color, transform: [{ rotate: `${rotate}deg` }] }, style]} pointerEvents="none">
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }] }}>
        <Text onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[styles.tapeText, { color: fg }]} numberOfLines={1}>{text}</Text>
        <Text style={[styles.tapeText, { color: fg }]} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tape: { marginHorizontal: -40, paddingVertical: 9, overflow: 'hidden' },
  tapeText: { fontFamily: fonts.label, fontSize: 16, letterSpacing: 1.4, textTransform: 'uppercase' },
});
