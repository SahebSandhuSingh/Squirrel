import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, NATIVE } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { useApp, type ToastMsg } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/** Renders the toast queue from AppState at the top of the screen. */
export function ToastHost() {
  const { toasts } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </View>
  );
}

function ToastItem({ t }: { t: ToastMsg }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 16, bounciness: 8 }),
      Animated.delay(1900),
      Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]).start();
  }, [v]);
  const c = t.color ?? colors.primary;
  return (
    <Animated.View style={[styles.toast, { borderColor: `${c}66`, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <View style={[styles.dot, { backgroundColor: `${c}26` }]}>
        <Icon name={(t.icon ?? 'star-four-points') as IconName} size={16} color={c} />
      </View>
      <Text style={styles.text} numberOfLines={2}>{t.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: MAX_WIDTH - 32, backgroundColor: 'rgba(26,29,20,0.97)', borderRadius: radius.md, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13, flex: 1 },
});
