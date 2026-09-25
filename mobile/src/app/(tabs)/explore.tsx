import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CityMap } from '@/art/CityMap';
import { Avatar } from '@/components/Avatar';
import { CityChip } from '@/components/TopBar';
import { Chips, Display, Icon, IconButton, NATIVE, PressScale, Pulse, SearchBar, TAB_BAR_SPACE, Tagline, tap } from '@/components/ui';
import type { Place, PlaceKind } from '@/data/community';
import { users } from '@/data/users';
import { useApp } from '@/state/AppState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '@/theme';

const FILTERS = ['All', 'Gyms', 'Runs', 'Cafes', 'Events'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_ICONS = { All: 'map-marker-multiple', Gyms: 'dumbbell', Runs: 'run-fast', Cafes: 'coffee', Events: 'calendar-star' } as const;

/** EXPLORE — stylised neon city map with live places, runs and events. */
export default function Explore() {
  const insets = useSafeAreaInsets();
  const { places, city, joinedEvents, toggleEvent, events } = useApp();
  const [filter, setFilter] = useState<Filter>('All');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const listRef = useRef<ScrollView>(null);
  const route = useRef(new Animated.Value(0)).current;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    route.setValue(0);
    Animated.timing(route, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [city.id, showRoute]);

  const handleSearchChange = useCallback((text: string) => {
    setQ(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQ(text.trim().toLowerCase()), 300);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, []);

  const term = debouncedQ;
  const visible = useMemo(
    () => places.filter((p) => (filter === 'All' || p.kind === filter) && (!term || p.name.toLowerCase().includes(term) || p.kind.toLowerCase().includes(term))),
    [places, filter, term],
  );
  const people = useMemo(() => (term.length > 1 ? users.filter((u) => u.name.toLowerCase().includes(term) || u.handle.includes(term)).slice(0, 4) : []), [term]);

  const select = (p: Place) => {
    tap();
    setSelected(p.id);
    const i = visible.findIndex((v) => v.id === p.id);
    listRef.current?.scrollTo({ x: Math.max(0, i * 232 - 16), animated: true });
  };

  const act = (p: Place) => {
    if (p.kind === 'Runs') router.push('/run');
    else if (p.eventId) router.push({ pathname: '/event/[id]', params: { id: p.eventId } });
    else router.push('/crews');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Map fills the screen */}
      <View style={StyleSheet.absoluteFill}>
        <CityMap seed={city.id.length * 7} route={showRoute} routeProgress={route} style={StyleSheet.absoluteFill} />
        {visible.map((p) => (
          <Marker key={p.id} place={p} active={selected === p.id} onPress={() => select(p)} />
        ))}
        <View style={styles.me}>
          <Pulse size={44} color={colors.purple} />
          <View style={styles.meDot} />
        </View>
        <Tagline size={22} style={{ position: 'absolute', left: 16, bottom: TAB_BAR_SPACE + 150 + insets.bottom }}>
          Same city.{'\n'}More movement.
        </Tagline>
      </View>

      {/* Top overlay */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Display size={34}>Explore</Display>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CityChip />
            <IconButton icon={showRoute ? 'map-marker-path' : 'map-outline'} onPress={() => setShowRoute((v) => !v)} label="Toggle route" color={showRoute ? colors.pink : colors.text} />
          </View>
        </View>
        <View style={{ marginTop: 10 }}>
          <SearchBar placeholder="Search gyms, runs, cafes, people..." value={q} onChangeText={handleSearchChange} />
        </View>
        <Chips items={FILTERS} value={filter} onChange={setFilter} icons={FILTER_ICONS} />
        {people.length > 0 && (
          <View style={styles.people}>
            {people.map((u) => (
              <Pressable key={u.id} style={styles.personRow} onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}>
                <Avatar user={u} size={34} link={false} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.pName}>{u.name}</Text>
                  <Text style={styles.pMeta}>@{u.handle} · {u.area}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.dim} />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Bottom carousel */}
      <View style={[styles.bottom, { bottom: TAB_BAR_SPACE - 18 + insets.bottom }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={styles.count}>{visible.length} spots nearby</Text>
          <Pressable onPress={() => { tap(); setSelected(null); }} style={styles.locate} accessibilityLabel="Recenter">
            <Icon name="crosshairs-gps" size={20} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView ref={listRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} snapToInterval={232} decelerationRate="fast">
          {visible.map((p) => {
            const ev = p.eventId ? events.find((e) => e.id === p.eventId) : undefined;
            const going = ev ? joinedEvents.has(ev.id) : false;
            return (
              <PressScale key={p.id} onPress={() => select(p)} style={[styles.placeCard, selected === p.id && { borderColor: p.color }]}>
                <View style={[styles.placeIcon, { backgroundColor: `${p.color}22`, borderColor: `${p.color}66` }]}>
                  <Icon name={p.icon} size={22} color={p.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.pName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.pMeta} numberOfLines={1}>{p.kind} · {p.meta}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    tap();
                    if (ev) toggleEvent(ev.id);
                    else act(p);
                  }}
                  style={[styles.go, { backgroundColor: going ? colors.cardHi : p.kind === 'Runs' ? colors.pink : colors.cyan }]}>
                  <Text style={[styles.goText, going && { color: colors.sub }]}>{ev ? (going ? 'Going' : 'Join') : p.kind === 'Runs' ? 'Run' : 'Go'}</Text>
                </Pressable>
              </PressScale>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function Marker({ place, active, onPress }: { place: Place; active: boolean; onPress: () => void }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: 1, useNativeDriver: NATIVE, speed: 10, bounciness: 10, delay: Math.round(place.x * 400) }).start();
  }, [s, place.x]);
  return (
    <Animated.View style={[styles.pinWrap, { left: `${place.x * 100}%`, top: `${27 + place.y * 46}%`, transform: [{ scale: s }] }]}>
      <Pressable onPress={onPress} style={[styles.pin, active && { borderColor: place.color, backgroundColor: 'rgba(22,13,35,0.97)' }]} accessibilityLabel={place.name}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {(active || place.kind === 'Events') && <Pulse size={34} color={place.color} />}
          <View style={[styles.pinDot, { backgroundColor: place.color }]}>
            <Icon name={place.icon} size={15} color={colors.onCyan} />
          </View>
        </View>
        <View style={{ marginLeft: 6 }}>
          <Text style={styles.pinName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.pinMeta}>{place.meta}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, backgroundColor: 'rgba(7,5,13,0.55)', borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  people: { backgroundColor: colors.bg2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, marginBottom: 10, overflow: 'hidden' },
  personRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  pinWrap: { position: 'absolute' },
  pin: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(7,5,13,0.86)', borderRadius: radius.pill, padding: 4, paddingRight: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', maxWidth: 170 },
  pinDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  pinName: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
  pinMeta: { color: colors.sub, fontFamily: fonts.regular, fontSize: 10 },
  me: { position: 'absolute', left: '46%', top: '52%', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  meDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.purple, borderWidth: 3, borderColor: '#fff' },
  bottom: { position: 'absolute', left: 0, right: 0 },
  count: { color: colors.text, fontFamily: fonts.bold, fontSize: 13, textShadowColor: '#000', textShadowRadius: 6 },
  locate: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  placeCard: { width: 220, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(22,13,35,0.96)', borderRadius: radius.lg, padding: 10, borderWidth: 1.5, borderColor: colors.line },
  placeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pName: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  pMeta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  go: { borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 7, marginLeft: 6 },
  goText: { color: colors.onCyan, fontFamily: fonts.bold, fontSize: 12 },
});
