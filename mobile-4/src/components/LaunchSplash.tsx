import { Fragment, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Logo } from '@/components/Brand';
import { isThemeReload } from '@/components/ThemeToggle';
import { NATIVE } from '@/components/ui';
import { colors, fonts } from '@/theme';

/**
 * The backers, shown under "Backed by". The image files are the exact logos supplied by each
 * organisation (assets/brand/backers) — displayed as-is, never redrawn or recoloured.
 */
const BACKERS = [
  { name: 'RISE Foundation', logo: require('../../assets/brand/backers/rise-foundation.jpg') },
  { name: 'SplitLabs VC', logo: require('../../assets/brand/backers/splitlabs-vc.jpg') },
] as const;

/** The full Squirrel Social artwork (squirrel over the graffiti wordmark), exactly as supplied. */
const WORDMARK = require('../../assets/brand/logo-wordmark.png');
const WORDMARK_ASPECT = 774 / 956;

/** Screen 1 (brand + loading bar) holds at least this long from launch, and until the app is ready. */
const BRAND_MS = 2400;
/** Screen 2 ("Backed by") holds at least this long once it's up. */
const BACKERS_MS = 1800;
const CROSSFADE_MS = 380;
const FADE_OUT_MS = 350;
/** Minimum time the splash is on screen from app launch. Initialisation can make it longer, never shorter. */
export const SPLASH_MIN_MS = BRAND_MS + CROSSFADE_MS + BACKERS_MS;

/** Screen 1 is the brand artwork on its own black, whatever the theme. */
const BLACK = '#000000';
const CREAM = '#F4ECDC';
const TRACK = '#262626';

// Once per app launch: a remount (fast refresh, provider re-render) never shows it again, and a
// theme switch (which reloads the app) lands you straight back where you were — no second splash.
let shownThisLaunch = isThemeReload();
const launchedAt = Date.now();

/**
 * App-launch splash, two screens, then a fade into whatever the app's own startup flow picked:
 *   1. The Squirrel Social artwork on black, "THE PARAS MANI EFFECT" and a lime loading bar.
 *   2. "Backed by" with the RISE Foundation and SplitLabs VC logos and names (themed).
 * It's an overlay on the root layout, not a route, so it can't be navigated back to, and
 * routes/deep links mount underneath it.
 *
 * Screen 1 moves on only when BOTH its minimum time has passed AND `ready` is true (fonts loaded,
 * auth restored): the app's initialisation stays authoritative, and the bar only completes then.
 */
export function LaunchSplash({ ready }: { ready: boolean }) {
  const { width, height } = useWindowDimensions();
  const [gone, setGone] = useState(shownThisLaunch);
  const [phase, setPhase] = useState<'brand' | 'backers'>('brand');
  const [brandElapsed, setBrandElapsed] = useState(() => Date.now() - launchedAt >= BRAND_MS);
  const [backersElapsed, setBackersElapsed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [logo] = useState(() => new Animated.Value(0));
  const [lockup] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(0));
  const [brand] = useState(() => new Animated.Value(1));
  const [backer] = useState(() => new Animated.Value(0));
  const [out] = useState(() => new Animated.Value(1));
  const leaving = useRef(false);
  const advancing = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  // Screen 1's minimum time, measured from launch (not from this component's mount).
  useEffect(() => {
    if (gone || brandElapsed) return;
    const t = setTimeout(() => setBrandElapsed(true), Math.max(0, BRAND_MS - (Date.now() - launchedAt)));
    return () => clearTimeout(t);
  }, [gone, brandElapsed]);

  // Entrance: the artwork, then the lockup once the serif has loaded. The bar creeps towards
  // ~90% over screen 1's minimum time; only readiness takes it the rest of the way.
  useEffect(() => {
    if (gone) return;
    const d = reduceMotion ? 0 : 1;
    const ease = Easing.out(Easing.cubic);
    Animated.timing(logo, { toValue: 1, duration: 560 * d, easing: ease, useNativeDriver: NATIVE }).start();
    const left = Math.max(0, BRAND_MS - (Date.now() - launchedAt));
    Animated.timing(progress, { toValue: 0.9, duration: left, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [gone, reduceMotion, logo, progress]);

  useEffect(() => {
    if (gone || !ready) return;
    Animated.timing(lockup, { toValue: 1, duration: reduceMotion ? 0 : 480, delay: reduceMotion ? 0 : 140, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [gone, ready, reduceMotion, lockup]);

  // Screen 1 → 2: finish the bar, cross-fade to "Backed by".
  useEffect(() => {
    if (gone || phase !== 'brand' || !ready || !brandElapsed || advancing.current) return;
    advancing.current = true;
    const d = reduceMotion ? 0 : 1;
    Animated.timing(progress, { toValue: 1, duration: 220 * d, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
      setPhase('backers');
      Animated.parallel([
        Animated.timing(brand, { toValue: 0, duration: CROSSFADE_MS * d, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(backer, { toValue: 1, duration: 460 * d, delay: 160 * d, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      ]).start();
    });
  }, [gone, phase, ready, brandElapsed, reduceMotion, progress, brand, backer]);

  // Screen 2's minimum time.
  useEffect(() => {
    if (gone || phase !== 'backers') return;
    const t = setTimeout(() => setBackersElapsed(true), CROSSFADE_MS + BACKERS_MS);
    return () => clearTimeout(t);
  }, [gone, phase]);

  // Exit.
  useEffect(() => {
    if (gone || phase !== 'backers' || !backersElapsed || leaving.current) return;
    leaving.current = true;
    Animated.timing(out, { toValue: 0, duration: reduceMotion ? 0 : FADE_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }).start(() => {
      shownThisLaunch = true;
      setGone(true);
    });
  }, [gone, phase, backersElapsed, reduceMotion, out]);

  if (gone) return null;

  const rise = (v: Animated.Value, from = 12) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] });
  // The artwork takes the room the lockup and bar leave, never wider than ~360pt.
  const artW = Math.min(width * 0.86, (height * 0.52) * WORDMARK_ASPECT, 360);
  const barW = Math.min(width * 0.5, 220);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { opacity: out }]}
      pointerEvents={phase === 'backers' && backersElapsed ? 'none' : 'auto'}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Squirrel Social. The Paras Mani Effect. Backed by ${BACKERS.map((b) => b.name).join(' and ')}`}>
      {/* Screen 2 — Backed by (underneath; revealed by the cross-fade). */}
      {phase === 'backers' && (
        <Animated.View style={[styles.backedBy, rise(backer, 10)]}>
          <View style={styles.tile}>
            <Logo size={96} />
          </View>
          <View style={[styles.backerRow, { marginTop: 30 }]}>
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
      )}

      {/* Screen 1 — brand artwork, the lockup and the loading bar, on black. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.brand, { opacity: brand }]} pointerEvents="none">
        <View style={styles.brandMain}>
          <Animated.View style={{ opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
            <Image source={WORDMARK} style={{ width: artW, height: artW / WORDMARK_ASPECT }} resizeMode="contain" accessibilityIgnoresInvertColors />
          </Animated.View>
          {ready && (
            <Animated.View style={[styles.lockup, rise(lockup, 8)]}>
              <Text style={styles.the}>THE</Text>
              <Text style={styles.paras} numberOfLines={1} adjustsFontSizeToFit>
                <SmallCaps text="PARAS MANI" />
              </Text>
              <Text style={styles.effect}>EFFECT</Text>
            </Animated.View>
          )}
        </View>
        <View style={[styles.track, { width: barW }]}>
          <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, barW] }) }]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** Classic small caps: each word's first letter full height, the rest a size down. */
function SmallCaps({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          {i > 0 ? ' ' : ''}
          {word[0]}
          <Text style={styles.smallCap}>{word.slice(1)}</Text>
        </Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 1000, elevation: 1000 },
  brand: { backgroundColor: BLACK, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 72, paddingBottom: 64 },
  brandMain: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockup: { alignItems: 'center', marginTop: 18 },
  the: { color: CREAM, fontFamily: fonts.serifBold, fontSize: 15, letterSpacing: 6, marginRight: -6 },
  paras: { color: CREAM, fontFamily: fonts.serif, fontSize: 46, lineHeight: 52, letterSpacing: 0.5, marginTop: 2 },
  smallCap: { fontSize: 36 },
  effect: { color: CREAM, fontFamily: fonts.serifBold, fontSize: 16, letterSpacing: 9, marginRight: -9, marginTop: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: TRACK, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#D7FF1F' },
  tile: { width: 96, height: 96, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.lineHi, backgroundColor: '#0C0C0C' },
  backedBy: { alignItems: 'center' },
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
