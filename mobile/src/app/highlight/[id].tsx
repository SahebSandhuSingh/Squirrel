import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { Avatar } from '@/components/Avatar';
import { Display, IconButton, Scrim } from '@/components/ui';
import { highlightById } from '@/data/highlights';
import { useApp } from '@/state/AppState';
import { colors, fonts } from '@/theme';

const DURATION = 4500;

/** Full-screen story viewer for profile highlights. Tap left/right to navigate. */
export default function HighlightViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { me } = useApp();
  const h = highlightById(id);
  const [i, setI] = useState(0);
  const bar = useRef(new Animated.Value(0)).current;
  const count = h?.slides.length ?? 0;

  useEffect(() => {
    if (!h) return;
    bar.setValue(0);
    const a = Animated.timing(bar, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: false });
    a.start(({ finished }) => {
      if (!finished) return;
      if (i < count - 1) setI(i + 1);
      else router.back();
    });
    return () => a.stop();
  }, [i, h, count, bar]);

  if (!h) return null;
  const s = h.slides[i];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Scene kind={s.scene} seed={s.seed} aspect={width / height} style={StyleSheet.absoluteFill} />
      <Scrim strong style={{ top: '55%' }} />
      <View style={[styles.bars, { top: insets.top + 8 }]}>
        {h.slides.map((_, k) => (
          <View key={k} style={styles.track}>
            <Animated.View style={[styles.fill, { width: k < i ? '100%' : k > i ? '0%' : bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        ))}
      </View>
      <View style={[styles.head, { top: insets.top + 20 }]}>
        <Avatar user={me} size={34} link={false} />
        <Text style={styles.name}>{h.label}</Text>
        <View style={{ flex: 1 }} />
        <IconButton icon="close" onPress={() => router.back()} label="Close" />
      </View>
      <View style={styles.nav}>
        <Pressable style={{ flex: 1 }} onPress={() => (i > 0 ? setI(i - 1) : bar.setValue(0))} accessibilityLabel="Previous" />
        <Pressable style={{ flex: 2 }} onPress={() => (i < count - 1 ? setI(i + 1) : router.back())} accessibilityLabel="Next" />
      </View>
      <View style={[styles.caption, { bottom: insets.bottom + 36 }]} pointerEvents="none">
        <Display size={38}>{s.caption}</Display>
        <Text style={styles.meta}>{s.meta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 2 },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#fff' },
  head: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  nav: { ...StyleSheet.absoluteFill, flexDirection: 'row', zIndex: 1 },
  caption: { position: 'absolute', left: 20, right: 20, zIndex: 2 },
  meta: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14, marginTop: 4 },
});
