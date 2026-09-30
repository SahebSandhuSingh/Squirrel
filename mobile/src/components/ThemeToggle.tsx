/**
 * Appearance: Dark / Light — two controls, one switch:
 *   <ThemeToggle>      the labelled Dark | Light control on Profile → More
 *   <ThemeIconButton>  the sun/moon icon in the tab headers (Home, Map, Social, Profile)
 * The choice is saved on the device (SecureStore on phones,
 * localStorage on web) and the app reloads once so every screen, sheet and map layer is
 * rebuilt with the new palette — no half-themed screens. You land back where you were.
 */
import { useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { reloadAppAsync } from 'expo';
import { Icon, NATIVE, PressScale, Segmented, tap } from '@/components/ui';
import { alpha, colors, fonts, radius, saveThemePreference, THEME, type ThemeName } from '@/theme';

const LABELS = { Dark: 'dark', Light: 'light' } as const;
const RETURN_KEY = 'squirrel.theme.return';

/** Remember where to come back to after the reload (web: sessionStorage; native: in-memory is lost, so use the route param). */
function rememberReturn(path: string) {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Not critical: without it you land on Home.
  }
}
/** True right after a theme-switch reload (without consuming it) — the launch splash skips itself then. */
export function isThemeReload(): boolean {
  try {
    return Platform.OS === 'web' && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RETURN_KEY) != null;
  } catch {
    return false;
  }
}
export function takeThemeReturn(): string | null {
  try {
    if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return null;
    const v = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

/** The one switch both controls use: save, remember where you were, show the overlay, rebuild. */
function useThemeSwitch(returnTo: string, delayMs = 250) {
  const [switching, setSwitching] = useState<ThemeName | null>(null);
  const switchTo = (next: ThemeName) => {
    if (next === THEME || switching) return;
    tap('impact');
    setSwitching(next);
    saveThemePreference(next);
    rememberReturn(returnTo);
    // Let the overlay (and the icon's turn) paint, then rebuild the app with the new palette.
    setTimeout(() => {
      if (Platform.OS === 'web') window.location.reload();
      else reloadAppAsync('Theme changed').catch(() => setSwitching(null));
    }, delayMs);
  };
  const overlay = (
    <Modal visible={!!switching} transparent animationType="fade">
      <View style={styles.overlay} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.overlayText}>Switching to {switching} mode…</Text>
      </View>
    </Modal>
  );
  return { switching, switchTo, overlay };
}

/**
 * Sun/moon icon: one tap flips Dark ↔ Light. Dark shows the sun (tap for daylight), Light shows
 * the moon (tap for night). The glyph turns and cross-fades into the other one before the switch.
 */
export function ThemeIconButton({ size = 20, style }: { size?: number; style?: React.ComponentProps<typeof PressScale>['style'] }) {
  const path = usePathname();
  const { switching, switchTo, overlay } = useThemeSwitch(path || '/home', 420);
  const [turn] = useState(() => new Animated.Value(0));
  const toLight = THEME !== 'light';
  const next: ThemeName = toLight ? 'light' : 'dark';
  const label = toLight ? 'Switch to light mode' : 'Switch to dark mode';
  const press = () => {
    if (switching) return;
    Animated.timing(turn, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: NATIVE }).start();
    switchTo(next);
  };
  const spin = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const fadeOut = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] });
  const fadeIn = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const tone = toLight ? colors.gold : colors.violet;
  return (
    <PressScale onPress={press} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Reloads the app in the other theme" style={[styles.iconBtn, { borderColor: alpha(tone, 0.45), backgroundColor: alpha(tone, 0.1) }, style]}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeOut }]}>
          <Icon name={toLight ? 'white-balance-sunny' : 'weather-night'} size={size} color={tone} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeIn }]}>
          <Icon name={toLight ? 'weather-night' : 'white-balance-sunny'} size={size} color={toLight ? colors.violet : colors.gold} />
        </Animated.View>
      </Animated.View>
      {overlay}
    </PressScale>
  );
}

export function ThemeToggle({ returnTo = '/profile' }: { returnTo?: string }) {
  const { switchTo, overlay } = useThemeSwitch(returnTo);
  const change = (label: keyof typeof LABELS) => switchTo(LABELS[label]);
  return (
    <View style={styles.box} accessibilityLabel="Appearance">
      <View style={styles.head}>
        <Icon name={THEME === 'light' ? 'white-balance-sunny' : 'weather-night'} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Appearance</Text>
          <Text style={styles.sub}>Dark is the classic night-campus look. Light is the daytime twin.</Text>
        </View>
      </View>
      <Segmented items={['Dark', 'Light'] as const} value={THEME === 'light' ? 'Light' : 'Dark'} onChange={change} style={{ marginVertical: 0, marginTop: 10 }} />
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  box: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  sub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.backdrop },
  overlayText: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, overflow: 'hidden' },
});
