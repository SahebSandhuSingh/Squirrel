import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { Logo } from '@/components/Brand';
import { isThemeReload } from '@/components/ThemeToggle';
import { NATIVE } from '@/components/ui';
import { colors, DISPLAY_SKEW, fonts } from '@/theme';

/**
 * The backers, shown under "Backed by". The image files are the exact logos supplied by each
 * organisation (assets/brand/backers) — displayed as-is, never redrawn or recoloured.
 */
const BACKERS = [
  { name: 'RISE Foundation', logo: require('../../assets/brand/backers/rise-foundation.jpg') },
  { name: 'SplitLabs VC', logo: require('../../assets/brand/backers/splitlabs-vc.jpg') },
] as const;

/** Minimum time the splash is on screen from app launch. Initialisation can make it longer, never shorter. */
export const SPLASH_MIN_MS = 3000;
const FADE_OUT_MS = 350;

// Once per app launch: a remount (fast refresh, provider re-render) never shows it again, and a
// theme switch (which reloads the app) lands you straight back where you were — no second splash.
let shownThisLaunch = isThemeReload();
const launchedAt = Date.now();

/**
 * App-launch splash: the Squirrel Social logo (the focus) → "Squirrel Social" → "Backed by" with the
 * RISE Foundation and SplitLabs VC logos and names, then a fade into
 * whatever the app's own startup flow picked. It's an overlay on the root layout, not a
 * route, so it can't be navigated back to, and routes/deep links mount underneath it.
 *
 * It hides when BOTH the minimum time has passed AND `ready` is true (fonts loaded, auth
 * restored): the app's initialisation stays authoritative. Themed: it follows Dark / Light.
 */
export function LaunchSplash({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(shownThisLaunch);
  const [minElapsed, setMinElapsed] = useState(() => Date.now() - launchedAt >= SPLASH_MIN_MS);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [logo] = useState(() => new Animated.Value(0));
  const [title] = useState(() => new Animated.Value(0));
  const [backer] = useState(() => new Animated.Value(0));
  const [out] = useState(() => new Animated.Value(1));
  const leaving = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  // Minimum presentation time, measured from launch (not from this component's mount).
  useEffect(() => {
    if (gone || minElapsed) return;
    const t = setTimeout(() => setMinElapsed(true), Math.max(0, SPLASH_MIN_MS - (Date.now() - launchedAt)));
    return () => clearTimeout(t);
  }, [gone, minElapsed]);

  // Entrance: logo, then the name, then the backer line. Text waits for the brand fonts.
  useEffect(() => {
    if (gone) return;
    const d = reduceMotion ? 0 : 1;
    const ease = Easing.out(Easing.cubic);
    Animated.timing(logo, { toValue: 1, duration: 520 * d, easing: ease, useNativeDriver: NATIVE }).start();
    if (!ready) return;
    Animated.sequence([
      Animated.timing(title, { toValue: 1, duration: 460 * d, delay: 180 * d, easing: ease, useNativeDriver: NATIVE }),
      Animated.timing(backer, { toValue: 1, duration: 420 * d, delay: 260 * d, easing: ease, useNativeDriver: NATIVE }),
    ]).start();
  }, [gone, ready, reduceMotion, logo, title, backer]);

  // Exit once both conditions hold.
  useEffect(() => {
    if (gone || !ready || !minElapsed || leaving.current) return;
    leaving.current = true;
    Animated.timing(out, { toValue: 0, duration: reduceMotion ? 0 : FADE_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }).start(() => {
      shownThisLaunch = true;
      setGone(true);
    });
  }, [gone, ready, minElapsed, reduceMotion, out]);

  if (gone) return null;

  const rise = (v: Animated.Value, from = 12) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: out }]}
      pointerEvents={minElapsed && ready ? 'none' : 'auto'}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Squirrel Social. Backed by ${BACKERS.map((b) => b.name).join(' and ')}`}>
      <Animated.View style={{ opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }}>
        {/* The official logo has its own dark backdrop: frame it as an app-icon tile so it sits right on both themes. */}
        <View style={styles.tile}>
          <Logo size={124} />
        </View>
      </Animated.View>
      {ready && (
        <>
          <Animated.View style={rise(title)}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              Squirrel <Text style={{ color: colors.primary }}>Social</Text>
            </Text>
          </Animated.View>
          <Animated.View style={[styles.backedBy, rise(backer, 8)]}>
            <View style={styles.backerRow}>
              <View style={styles.rule} />
              <Text style={styles.backer}>Backed by</Text>
              <View style={styles.rule} />
            </View>
            <View style={styles.backers}>
              {BACKERS.map((b) => (
                <View key={b.name} style={styles.org}>
                  <View style={styles.orgTile}>
                    <Image source={b.logo} style={styles.orgLogo} resizeMode="contain" accessibilityIgnoresInvertColors />
                  </View>
                  <Text style={styles.orgName}>{b.name}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 1000, elevation: 1000 },
  tile: { width: 124, height: 124, borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: colors.lineHi, backgroundColor: '#0C0C0C' },
  title: { marginTop: 18, color: colors.text, fontFamily: fonts.display, fontSize: 44, lineHeight: 52, letterSpacing: 0.5, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }], textAlign: 'center' },
  backedBy: { alignItems: 'center', marginTop: 34 },
  backerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { width: 22, height: 1, backgroundColor: colors.lineHi },
  // Exact wording and case: "Backed by" (no uppercase transform).
  backer: { color: colors.dim, fontFamily: fonts.label, fontSize: 14, letterSpacing: 0.8 },
  backers: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 28, marginTop: 16 },
  org: { alignItems: 'center', width: 116 },
  // A neutral frame so both logos (one on white, one on black) sit cleanly on either theme.
  orgTile: { width: 76, height: 76, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  orgLogo: { width: '100%', height: '100%' },
  orgName: { marginTop: 8, color: colors.sub, fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.3, textAlign: 'center' },
});
