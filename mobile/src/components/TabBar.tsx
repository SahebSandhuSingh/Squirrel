import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, tap } from '@/components/ui';
import { colors, fonts, gradients } from '@/theme';
import type { IconName } from '@/data/mock';

type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, [IconName, IconName]> = {
  home: ['home-variant', 'home-variant-outline'],
  explore: ['compass', 'compass-outline'],
  social: ['account-group', 'account-group-outline'],
  profile: ['account', 'account-outline'],
};

/** Floating bottom bar with a raised pink "+" that starts a run (as in the design). */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const [on, off] = ICONS[route.name] ?? ['circle', 'circle-outline'];
    const onPress = () => {
      tap();
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
        <Icon name={focused ? on : off} size={24} color={focused ? colors.pink : colors.dim} />
        <Text style={[styles.label, focused && { color: colors.pink }]}>{options.title}</Text>
      </Pressable>
    );
  });

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.slice(0, 2)}
      <Pressable
        accessibilityLabel="Start a run"
        onPress={() => {
          tap();
          router.push('/run');
        }}
        style={({ pressed }) => [styles.plusWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <LinearGradient colors={gradients.pinkButton} style={styles.plus}>
          <Icon name="plus" size={34} color={colors.onPink} />
        </LinearGradient>
      </Pressable>
      {items.slice(2)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12,7,20,0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  label: { fontSize: 11, color: colors.dim, fontFamily: fonts.medium },
  plusWrap: { marginTop: -30, marginHorizontal: 6, borderRadius: 34, shadowColor: colors.pink, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  plus: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
});
