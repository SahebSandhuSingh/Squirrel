import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CityBackdrop, MiniMap, RouteArt } from '@/components/art';
import { Header, Icon, IconButton, Tagline, tap } from '@/components/ui';
import { colors, fonts, gradients, radius } from '@/theme';

const PACE_SEC_PER_KM = 378; // 6'18" — simulated until GPS tracking is wired in
const START_SEC = 32 * 60 + 16;

const two = (n: number) => String(n).padStart(2, '0');

/** Live run tracker. Distance is simulated from pace until expo-location is added. */
export default function Run() {
  const insets = useSafeAreaInsets();
  const [sec, setSec] = useState(START_SEC);
  const [running, setRunning] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSec((s) => s + 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  const km = sec / PACE_SEC_PER_KM;
  const kcal = Math.round(km * 80.5);
  const time = `${two(Math.floor(sec / 60))}:${two(sec % 60)}`;
  const pace = `${Math.floor(PACE_SEC_PER_KM / 60)}'${two(PACE_SEC_PER_KM % 60)}"`;

  const finish = () => {
    setRunning(false);
    Alert.alert('Finish run?', `${km.toFixed(2)} km in ${time}`, [
      { text: 'Keep going', onPress: () => setRunning(true), style: 'cancel' },
      { text: 'Finish', onPress: () => router.replace('/progress') },
    ]);
  };

  return (
    <View style={styles.root}>
      <CityBackdrop height={360} style={styles.sky} seed={9} palms={false} />
      <RouteArt style={StyleSheet.absoluteFill} progress={Math.min(1, 0.35 + (km % 1) * 0.65)} />

      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16 }}>
        <Header
          title="Running"
          back
          right={
            <View style={styles.gps}>
              <Icon name="wifi" size={14} color={colors.green} />
              <Text style={styles.gpsText}>GPS</Text>
            </View>
          }
        />
        <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
          <MiniMap size={84} />
        </View>
      </View>

      <Tagline size={34} style={styles.tagline}>JUST{'\n'}ONE{'\n'}MORE{'\n'}KM</Tagline>

      <View style={{ flex: 1 }} />

      <View style={[styles.panel, { marginHorizontal: 16 }]}>
        <Text style={styles.km}>{km.toFixed(2)} km</Text>
        <View style={styles.row}>
          {[
            [time, 'Time'],
            [pace, 'Pace'],
            [String(kcal), 'Calories'],
          ].map(([v, l]) => (
            <View key={l} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.metricV}>{v}</Text>
              <Text style={styles.metricL}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <IconButton icon="music-note" size={28} style={styles.side} />
        <Pressable
          onPress={() => { tap(); setRunning((r) => !r); }}
          onLongPress={finish}
          accessibilityLabel={running ? 'Pause run' : 'Resume run'}
          style={({ pressed }) => [styles.pauseWrap, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
          <LinearGradient colors={gradients.pinkButton} style={styles.pause}>
            <Icon name={running ? 'pause' : 'play'} size={44} color={colors.onPink} />
          </LinearGradient>
        </Pressable>
        <IconButton icon="camera-outline" size={28} style={styles.side} />
      </View>
      <Text style={styles.hint}>Long-press to finish</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sky: { position: 'absolute', top: 0, left: 0, right: 0 },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,6,16,0.8)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.green },
  gpsText: { color: colors.green, fontFamily: fonts.bold, fontSize: 12 },
  tagline: { position: 'absolute', right: 24, top: '38%', textAlign: 'right' },
  panel: { backgroundColor: 'rgba(22,14,31,0.92)', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 18 },
  km: { color: colors.text, fontFamily: fonts.display, fontSize: 52, textAlign: 'center' },
  row: { flexDirection: 'row', marginTop: 8 },
  metricV: { color: colors.text, fontFamily: fonts.bold, fontSize: 22 },
  metricL: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 22 },
  side: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  pauseWrap: { borderRadius: 50, shadowColor: colors.pink, shadowOpacity: 0.9, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  pause: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', bottom: 8, alignSelf: 'center', color: colors.mute, fontSize: 11, fontFamily: fonts.regular },
});
