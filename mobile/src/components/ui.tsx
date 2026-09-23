import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, gradients, radius } from '@/theme';
import type { IconName } from '@/data/mock';

export const Icon = MaterialCommunityIcons;

export const tap = () => {
  Haptics.selectionAsync().catch(() => {});
};

/** Space reserved at the bottom of scrollable screens for the floating tab bar. */
export const TAB_BAR_SPACE = 110;

// ---------- Typography ----------

export function Display({ children, size = 34, color = colors.text, style }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.12, color, letterSpacing: 0.5 }, style]}>{children}</Text>;
}

/** Hand-drawn neon tagline ("JUST ONE MORE KM", "Good people. Better habits."). */
export function Tagline({ children, size = 20, color = colors.text, rotate = -6, style }: { children: React.ReactNode; size?: number; color?: string; rotate?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.script,
          fontSize: size,
          lineHeight: size * 1.15,
          color,
          transform: [{ rotate: `${rotate}deg` }],
          textShadowColor: colors.pink,
          textShadowRadius: 10,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

// ---------- Buttons ----------

export function GradientButton({ label, onPress, icon, style, disabled }: { label: string; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.btnShadow, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      <LinearGradient colors={gradients.pinkButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        <Text style={styles.btnText}>{label}</Text>
        {icon && <Icon name={icon} size={22} color={colors.onPink} style={{ marginLeft: 8 }} />}
      </LinearGradient>
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, icon, style }: { label?: string; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.outline, { opacity: pressed ? 0.7 : 1 }, style]}>
      {icon && <Icon name={icon} size={18} color={colors.text} style={label ? { marginRight: 8 } : undefined} />}
      {label && <Text style={styles.outlineText}>{label}</Text>}
    </Pressable>
  );
}

export function PillButton({ label, active, onPress, activeLabel }: { label: string; active?: boolean; activeLabel?: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.pill, active && styles.pillActive, { opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[styles.pillText, active && { color: colors.dim }]}>{active ? activeLabel ?? label : label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, size = 22, color = colors.text, style }: { icon: IconName; onPress?: () => void; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable hitSlop={10} onPress={() => { tap(); onPress?.(); }} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, style]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

// ---------- Inputs / selectors ----------

export function SearchBar({ placeholder, value, onChangeText }: { placeholder: string; value?: string; onChangeText?: (t: string) => void }) {
  return (
    <View style={styles.search}>
      <Icon name="magnify" size={20} color={colors.dim} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        style={styles.searchInput}
        returnKeyType="search"
      />
    </View>
  );
}

export function Chips<T extends string>({ items, value, onChange, activeColor = colors.blue }: { items: readonly T[]; value: T; onChange: (v: T) => void; activeColor?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
      {items.map((i) => {
        const on = i === value;
        return (
          <Pressable key={i} onPress={() => { tap(); onChange(i); }} style={[styles.chip, on && { backgroundColor: activeColor, borderColor: activeColor }]}>
            <Text style={[styles.chipText, on && { color: colors.onBlue }]}>{i}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ items, value, onChange, activeColor = colors.pink }: { items: readonly T[]; value: T; onChange: (v: T) => void; activeColor?: string }) {
  return (
    <View style={styles.seg}>
      {items.map((i) => {
        const on = i === value;
        return (
          <Pressable key={i} onPress={() => { tap(); onChange(i); }} style={[styles.segItem, on && { backgroundColor: activeColor }]}>
            <Text style={[styles.segText, on && { color: activeColor === colors.pink ? colors.onPink : colors.onBlue }]}>{i}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Display bits ----------

export function ProgressBar({ progress, color = colors.pink, height = 5, style }: { progress: number; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const pct = `${Math.max(0, Math.min(1, progress)) * 100}%` as const;
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: colors.line, overflow: 'hidden' }, style]}>
      <LinearGradient colors={[color, colors.pinkSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: pct, height: '100%', borderRadius: height }} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function IconBadge({ icon, color, size = 44, bg }: { icon: IconName; color: string; size?: number; bg?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.55} color={color} />
    </View>
  );
}

export function AvatarCircle({ emoji, size = 52, ring = colors.pink, style }: { emoji: string; size?: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ring, backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  );
}

export function Coins({ amount, size = 14 }: { amount: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: size + 4, height: size + 4, borderRadius: size, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <Icon name="star-four-points" size={size - 4} color="#A86B00" />
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: size }}>{amount.toLocaleString('en-IN')}</Text>
    </View>
  );
}

/** The squirrel mascot. Swap for a real illustration (PNG/Lottie) when brand art is ready. */
export function Mascot({ size = 120, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View style={{ position: 'absolute', width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: colors.pink, opacity: 0.18 }} />
      <Text style={{ fontSize: size * 0.72 }}>🐿️</Text>
      <Text style={{ position: 'absolute', top: size * 0.2, right: size * 0.18, fontSize: size * 0.24 }}>🕶️</Text>
    </View>
  );
}

// ---------- Layout ----------

export function Header({ title, back, right, script }: { title: string; back?: boolean; right?: React.ReactNode; script?: boolean }) {
  return (
    <View style={styles.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        {back && <IconButton icon="chevron-left" size={30} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={{ marginRight: 4, marginLeft: -6 }} />}
        {script ? <Tagline size={30} rotate={-3}>{title}</Tagline> : <Display size={32}>{title}</Display>}
      </View>
      {right}
    </View>
  );
}

export function Screen({ children, scroll = true, padded = true, tabBar = true, style }: { children: React.ReactNode; scroll?: boolean; padded?: boolean; tabBar?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 6, paddingHorizontal: padded ? 16 : 0 };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.bg }, pad, style]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[pad, { paddingBottom: (tabBar ? TAB_BAR_SPACE : 24) + insets.bottom }, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  btnShadow: { borderRadius: radius.lg, shadowColor: colors.pink, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  btn: { borderRadius: radius.lg, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.display, fontSize: 20, color: colors.onPink, letterSpacing: 1 },
  outline: { borderWidth: 1.5, borderColor: colors.pink, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.5 },
  pill: { backgroundColor: colors.blue, borderRadius: radius.sm, paddingHorizontal: 18, paddingVertical: 8, minWidth: 72, alignItems: 'center' },
  pillActive: { backgroundColor: colors.line },
  pillText: { color: colors.onBlue, fontFamily: fonts.bold, fontSize: 14 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, color: colors.text, marginLeft: 8, fontFamily: fonts.regular, fontSize: 14 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  chipText: { color: colors.dim, fontFamily: fonts.semibold, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.line, marginVertical: 12 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  segText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
});
