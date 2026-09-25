import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { CityMap, RunRoute } from '@/art/CityMap';
import { Mascot } from '@/art/Mascot';
import { Button, Display, Icon, IconButton, NATIVE, Pulse, Tagline, tap } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { colors, fonts, gradients, MAX_WIDTH, radius } from '@/theme';

// Distance is simulated from pace until expo-location is wired in.
const PACE = 378; // sec per km (6'18")
const START = 32 * 60 + 16; // matches the design: 5.12 km in 32:16
const two = (n: number) => String(Math.floor(n)).padStart(2, '0');

type Phase = 'countdown' | 'running' | 'paused' | 'done';

export default function Run() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { finishRun, toast, city } = useApp();
  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const [sec, setSec] = useState(START);
  const [music, setMusic] = useState(true);
  const [photos, setPhotos] = useState(0);
  const [result, setResult] = useState<{ xp: number; leveledUp: boolean } | null>(null);
  const progress = useRef(new Animated.Value(0.62)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const lastKmMarker = useRef(0);

  // 3-2-1 countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(2)), useNativeDriver: NATIVE }).start();
    const t = setTimeout(() => {
      if (count <= 1) {
        tap('success');
        setPhase('running');
      } else {
        tap('impact');
        setCount(count - 1);
      }
    }, 850);
    return () => clearTimeout(t);
  }, [phase, count, pop]);

  // Timer
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const km = sec / PACE;

  // Haptic feedback on km milestones
  useEffect(() => {
    if (phase !== 'running') return;
    const currentKm = Math.floor(km);
    if (currentKm > lastKmMarker.current && currentKm > 0) {
      lastKmMarker.current = currentKm;
      tap('success');
      toast(`${currentKm} km! 🎉`, 'flag-checkered', colors.gold);
    }
  }, [km, phase, toast]);

  useEffect(() => {
    Animated.timing(progress, { toValue: Math.min(1, 0.55 + (km % 1) * 0.45), duration: 900, useNativeDriver: false }).start();
  }, [km, progress]);

  const time = `${two(sec / 60)}:${two(sec % 60)}`;
  const pace = `${Math.floor(PACE / 60)}'${two(PACE % 60)}"`;
  const kcal = Math.round(km * 80.5);
  const toNextKm = (1 - (km % 1)) * 1000;

  const finish = () => {
    tap('success');
    setPhase('done');
    setResult(finishRun(+km.toFixed(2), Math.round(sec / 60)));
  };

  const heroH = Math.max(300, height * 0.5);

  return (
    <View style={styles.root}>
      {/* World */}
      <View style={{ height: heroH }}>
        <Scene kind="city-night" seed={9} aspect={width / heroH} style={StyleSheet.absoluteFill} />
        <RunRoute progress={progress} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', colors.bg]} style={[StyleSheet.absoluteFill, { top: '65%' }]} />
      </View>

      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <IconButton icon="chevron-down" size={26} onPress={() => router.back()} label="Minimise" />
          <Display size={30} style={{ flex: 1, marginLeft: 10 }}>Running</Display>
          <View style={styles.gps}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }}>
              <Pulse size={8} color={colors.green} />
            </View>
            <Text style={styles.gpsText}>GPS</Text>
            <Icon name="signal-cellular-3" size={14} color={colors.green} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
          <View style={styles.chip}>
            <Icon name="map-marker-path" size={14} color={colors.pink} />
            <Text style={styles.chipText}>{city.venues?.runs?.[0] ?? 'City Loop'} loop</Text>
          </View>
          <View style={styles.mini}>
            <CityMap seed={4} route routeProgress={progress} style={StyleSheet.absoluteFill} />
          </View>
        </View>
        <Tagline size={34} style={styles.tagline}>Just{'\n'}one more{'\n'}km</Tagline>
      </View>

      {/* Stats */}
      <View style={[styles.col, { flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.panel}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <Text style={styles.km}>{km.toFixed(2)}</Text>
            <Text style={styles.kmUnit}> KM</Text>
          </View>
          <Text style={styles.next}>{Math.round(toNextKm)} m to the next km · +20 XP</Text>
          <View style={styles.metrics}>
            {[
              [time, 'Time'],
              [pace, 'Pace'],
              [String(kcal), 'Calories'],
            ].map(([v, l], i) => (
              <View key={l} style={[styles.metric, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
                <Text style={styles.metricV}>{v}</Text>
                <Text style={styles.metricL}>{l}</Text>
              </View>
            ))}
          </View>
          {music && (
            <View style={styles.nowPlaying}>
              <Icon name="music-note" size={14} color={colors.cyan} />
              <Text style={styles.npText} numberOfLines={1}>Neon Miles · Squirrel Radio</Text>
              <Icon name="equalizer" size={16} color={colors.cyan} />
            </View>
          )}
        </View>

        <View style={styles.controls}>
          <Pressable style={[styles.side, music && { borderColor: colors.cyan }]} onPress={() => { tap(); setMusic((m) => !m); }} accessibilityLabel="Music">
            <Icon name={music ? 'music' : 'music-off'} size={26} color={music ? colors.cyan : colors.text} />
          </Pressable>
          <View style={{ position: 'relative' }}>
            <Pressable
              onPress={() => { tap('impact'); setPhase((p) => (p === 'running' ? 'paused' : 'running')); }}
              onLongPress={finish}
              disabled={phase === 'countdown'}
              accessibilityLabel={phase === 'running' ? 'Pause' : 'Resume'}
              accessibilityHint="Long press to finish run"
              style={({ pressed }) => [styles.pauseWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              {phase === 'running' && <Pulse size={104} color={colors.pink} />}
              <LinearGradient colors={gradients.pink} style={styles.pause}>
                <Icon name={phase === 'running' ? 'pause' : 'play'} size={48} color={colors.onPink} />
              </LinearGradient>
            </Pressable>
            {phase === 'running' && (
              <View style={styles.longPressHint}>
                <Icon name="timer-sand" size={12} color={colors.onPink} />
                <Text style={styles.longPressText}>Hold to finish</Text>
              </View>
            )}
          </View>
          <Pressable
            style={styles.side}
            onPress={() => {
              tap();
              setPhotos((n) => n + 1);
              toast(`Photo pinned at ${km.toFixed(2)} km`, 'camera', colors.cyan);
            }}
            accessibilityLabel="Camera">
            <Icon name="camera-outline" size={26} color={colors.text} />
            {photos > 0 && (
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>{photos}</Text>
              </View>
            )}
          </Pressable>
        </View>
        {phase === 'paused' ? (
          <Button label="Finish run" variant="secondary" size="md" iconLeft="flag-checkered" onPress={finish} style={{ marginTop: 14 }} />
        ) : (
          <Text style={styles.hint}>Pause run, then hold center button to finish</Text>
        )}
      </View>

      {/* Countdown */}
      {phase === 'countdown' && (
        <View style={styles.countdown}>
          <Animated.Text style={[styles.countText, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [2, 1] }) }] }]}>{count}</Animated.Text>
          <Text style={styles.countSub}>Get ready…</Text>
        </View>
      )}

      {/* Summary */}
      {phase === 'done' && result && (
        <View style={styles.countdown}>
          <View style={[styles.summary, { marginTop: insets.top }]}>
            <Mascot pose="celebrate" size={150} animated />
            <Display size={40} color={colors.pink}>Run complete!</Display>
            <Text style={styles.sumLine}>
              {km.toFixed(2)} km · {time} · {pace}/km
            </Text>
            <View style={styles.sumXp}>
              <Icon name="star-four-points" size={18} color={colors.gold} />
              <Text style={styles.sumXpText}>+{result.xp} XP · +{Math.round(result.xp / 2)} coins</Text>
            </View>
            <Button
              label="Share to feed"
              iconLeft="send"
              onPress={() => router.replace({ pathname: '/compose', params: { km: km.toFixed(2), min: String(Math.round(sec / 60)), pace } })}
              style={{ alignSelf: 'stretch', marginTop: 18 }}
            />
            <Button label={result.leveledUp ? 'See level up' : 'Done'} variant="secondary" size="md" onPress={() => (result.leveledUp ? router.replace('/level-up') : router.back())} style={{ alignSelf: 'stretch', marginTop: 10 }} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(7,5,13,0.75)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(61,240,160,0.5)' },
  gpsText: { color: colors.green, fontFamily: fonts.bold, fontSize: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(7,5,13,0.7)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 12 },
  mini: { width: 92, height: 92, borderRadius: 46, overflow: 'hidden', borderWidth: 2, borderColor: colors.cyan, backgroundColor: colors.bg2 },
  tagline: { position: 'absolute', right: 22, top: 190, textAlign: 'right' },
  panel: { backgroundColor: 'rgba(22,13,35,0.94)', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 12 },
  km: { color: colors.text, fontFamily: fonts.display, fontSize: 64, lineHeight: 70, letterSpacing: 1 },
  kmUnit: { color: colors.pink, fontFamily: fonts.display, fontSize: 24 },
  next: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center' },
  metrics: { flexDirection: 'row', marginTop: 12 },
  metric: { flex: 1, alignItems: 'center' },
  metricV: { color: colors.text, fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.5 },
  metricL: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12 },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(53,223,255,0.08)', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  npText: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 20 },
  side: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  pauseWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 56, shadowColor: colors.pink, shadowOpacity: 0.9, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 14 },
  pause: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.25)' },
  photoBadge: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center' },
  photoBadgeText: { color: colors.onCyan, fontFamily: fonts.bold, fontSize: 11 },
  hint: { color: colors.mute, fontSize: 12, fontFamily: fonts.medium, textAlign: 'center', marginTop: 14 },
  longPressHint: { position: 'absolute', bottom: -36, left: '50%', transform: [{ translateX: -50 }], flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(7,5,13,0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,53,181,0.3)' },
  longPressText: { color: colors.onPink, fontFamily: fonts.semibold, fontSize: 10 },
  longPressIcon: { color: colors.onPink },
  countdown: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,5,13,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  countText: { color: colors.pink, fontFamily: fonts.display, fontSize: 160, textShadowColor: colors.pink, textShadowRadius: 30 },
  countSub: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 2, textTransform: 'uppercase' },
  summary: { width: '100%', maxWidth: 420, alignItems: 'center', backgroundColor: colors.bg2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 20 },
  sumLine: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 15, marginTop: 4 },
  sumXp: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: 'rgba(255,212,59,0.1)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  sumXpText: { color: colors.gold, fontFamily: fonts.bold, fontSize: 14 },
});
