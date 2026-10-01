/**
 * Map entities drawn as native views on top of the SVG. They live inside the pan/zoom
 * transform (so they move with the world) but counter-scale (so they stay the same size).
 * Everything is memoised; a relationship change re-renders just that player's marker.
 */
import { memo, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapPlayer, Poi } from '@/api/campus/types';
import { Avatar } from '@/components/Avatar';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { Icon, NATIVE, tap } from '@/components/ui';
import { useRelationship } from '@/state/socialStore';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, radius } from '@/theme';

type Pos = { x: number; y: number };

/** Markers spring into existence the first time they appear (once per marker, not on every pan). */
function usePopIn() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 14, bounciness: 10 }).start();
  }, [v]);
  return v;
}
const at = (p: Pos, size: number) => ({ left: p.x - size / 2, top: p.y - size / 2, width: size, height: size });

/** You: your avatar, a gentle breathing pulse, a small accuracy disc (scales with the map). */
export const CurrentUserMarker = memo(function CurrentUserMarker({ pos, accuracyPx, inverse }: { pos: Pos; accuracyPx: number; inverse: Animated.AnimatedInterpolation<number> | Animated.AnimatedDivision<number> }) {
  const { me } = useApp();
  const [breath] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(breath, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);
  const S = 40;
  const r = Math.max(10, Math.min(90, accuracyPx));
  return (
    <>
      <View pointerEvents="none" style={[styles.accuracy, { left: pos.x - r, top: pos.y - r, width: r * 2, height: r * 2, borderRadius: r }]} />
      <Animated.View pointerEvents="none" style={[styles.center, at(pos, S), { transform: [{ scale: inverse }] }]} accessibilityLabel="You are here">
        <Animated.View style={[styles.pulse, { opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />
        <Animated.View style={{ transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }, { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) }] }}>
          <Avatar user={me} size={S} ring={colors.primary} link={false} />
        </Animated.View>
        <View style={styles.you}>
          <Text style={styles.youText}>YOU</Text>
        </View>
      </Animated.View>
    </>
  );
});

export const PlayerMarker = memo(function PlayerMarker({ player, pos, inverse, selected, showLabel, onPress }: { player: MapPlayer; pos: Pos; inverse: Animated.AnimatedDivision<number>; selected: boolean; showLabel: boolean; onPress: (id: string) => void }) {
  const rel = useRelationship(player.user_id, player.relationship);
  const state = rel?.state ?? player.relationship;
  const ring = selected ? colors.text : state === 'friends' ? colors.primary : state === 'poked_you' ? colors.secondary : alpha(colors.text, 0.55);
  const S = selected ? 38 : 32;
  const pop = usePopIn();
  return (
    <Animated.View style={[styles.center, at(pos, S), { opacity: pop, transform: [{ scale: Animated.multiply(inverse, pop) }] }, selected && { zIndex: 5 }]}>
      <Pressable
        onPress={() => {
          tap();
          onPress(player.user_id);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${player.display_name}, level ${player.level}${state === 'friends' ? ', friend' : state === 'poked_you' ? ', poked you' : ''}`}>
        <PersonAvatar person={player} size={S} ring={ring} link={false} />
        {player.activity && <View style={styles.activeDot} />}
        {state === 'friends' && (
          <View style={styles.badge}>
            <Icon name="account-heart" size={9} color={colors.onPrimary} />
          </View>
        )}
        {state === 'poked_you' && (
          <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
            <Text style={styles.wave}>👋</Text>
          </View>
        )}
      </Pressable>
      {(showLabel || selected) && (
        <View style={styles.label} pointerEvents="none">
          <Text style={styles.labelText} numberOfLines={1}>{player.display_name.split(' ')[0]}</Text>
        </View>
      )}
    </Animated.View>
  );
});

export const ClusterMarker = memo(function ClusterMarker({ id, count, pos, inverse, onPress }: { id: string; count: number; pos: Pos; inverse: Animated.AnimatedDivision<number>; onPress: (id: string) => void }) {
  const S = count >= 10 ? 48 : 42;
  const pop = usePopIn();
  return (
    <Animated.View style={[styles.center, at(pos, S), { opacity: pop, transform: [{ scale: Animated.multiply(inverse, pop) }] }]}>
      <Pressable
        onPress={() => {
          tap();
          onPress(id);
        }}
        style={[styles.cluster, { width: S, height: S, borderRadius: S / 2 }]}
        accessibilityRole="button"
        accessibilityLabel={`${count} Squirrels here. Zoom in`}>
        <Text style={styles.clusterEmoji} accessibilityElementsHidden>🐿️</Text>
        <Text style={styles.clusterCount}>{count}</Text>
      </Pressable>
    </Animated.View>
  );
});

const POI_ICON: Record<string, React.ComponentProps<typeof Icon>['name']> = { food: 'silverware-fork-knife', sports: 'run-fast', study: 'book-open-variant', hangout: 'coffee', gate: 'gate', event: 'calendar-star' };

export const PoiMarker = memo(function PoiMarker({ poi, pos, inverse, showLabel, onPress }: { poi: Poi; pos: Pos; inverse: Animated.AnimatedDivision<number>; showLabel: boolean; onPress: (id: string) => void }) {
  const S = 26;
  return (
    <Animated.View style={[styles.center, at(pos, S), { transform: [{ scale: inverse }] }]}>
      <Pressable
        onPress={() => {
          tap();
          onPress(poi.id);
        }}
        hitSlop={8}
        style={styles.poi}
        accessibilityRole="button"
        accessibilityLabel={`${poi.name}, point of interest`}>
        <Icon name={POI_ICON[poi.kind] ?? 'map-marker-star'} size={14} color={colors.gold} />
      </Pressable>
      {showLabel && (
        <View style={styles.label} pointerEvents="none">
          <Text style={[styles.labelText, { color: colors.gold }]} numberOfLines={1}>{poi.name}</Text>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  accuracy: { position: 'absolute', backgroundColor: alpha(colors.primary, 0.07), borderWidth: 1, borderColor: alpha(colors.primary, 0.28) },
  pulse: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary },
  you: { position: 'absolute', top: 42, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  youText: { color: colors.onPrimary, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1 },
  activeDot: { position: 'absolute', left: -1, top: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green, borderWidth: 2, borderColor: colors.bg },
  badge: { position: 'absolute', right: -4, bottom: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.bg },
  wave: { fontSize: 8 },
  label: { position: 'absolute', top: '100%', marginTop: 3, backgroundColor: alpha(colors.panel, 0.88), borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, maxWidth: 96 },
  labelText: { color: colors.text, fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.6 },
  cluster: { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.panel, 0.95), borderWidth: 2, borderColor: colors.primary },
  clusterEmoji: { fontSize: 13, marginBottom: -3 },
  clusterCount: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 14 },
  poi: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.panel, 0.94), borderWidth: 1, borderColor: alpha(colors.gold, 0.45) },
});
