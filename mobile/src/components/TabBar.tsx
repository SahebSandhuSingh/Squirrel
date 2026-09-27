import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { colors, fonts, gradients, MAX_WIDTH } from '@/theme';

type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, [IconName, IconName]> = {
  home: ['home-variant', 'home-variant-outline'],
  explore: ['compass', 'compass-outline'],
  social: ['account-group', 'account-group-outline'],
  profile: ['account-circle', 'account-circle-outline'],
};

function TabItem({ focused, label, icons, onPress }: { focused: boolean; label: string; icons: [IconName, IconName]; onPress: () => void }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: NATIVE, speed: 20, bounciness: 8 }).start();
  }, [focused, v]);
  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}>
      <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <Icon name={focused ? icons[0] : icons[1]} size={25} color={focused ? colors.primary : colors.dim} />
      </Animated.View>
      <Text style={[styles.label, focused && { color: colors.text }]}>{label}</Text>
      <Animated.View style={[styles.dot, { opacity: v, transform: [{ scaleX: v }] }]} />
    </Pressable>
  );
}

/** Bottom navigation with a dominant, glowing CREATE button in the middle. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const onPress = () => {
      tap();
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return <TabItem key={route.key} focused={focused} label={String(options.title ?? route.name)} icons={ICONS[route.name] ?? ['circle', 'circle-outline']} onPress={onPress} />;
  });

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <LinearGradient colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.99)']} style={StyleSheet.absoluteFill} />
      <View style={styles.bar}>
        {items.slice(0, 2)}
        <Pressable
          accessibilityLabel="Create"
          onPress={() => {
            tap('impact');
            router.push('/create');
          }}
          style={({ pressed }) => [styles.plusWrap, { transform: [{ scale: pressed ? 0.93 : 1 }] }]}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
            <Icon name="plus" size={36} color={colors.onPrimary} />
          </LinearGradient>
        </Pressable>
        {items.slice(2)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  label: { fontSize: 11, color: colors.dim, fontFamily: fonts.semibold },
  dot: { width: 16, height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 2 },
  plusWrap: { marginTop: -34, marginHorizontal: 4, borderRadius: 36, shadowColor: colors.primary, shadowOpacity: 0.85, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 14 },
  plus: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bg },
});
