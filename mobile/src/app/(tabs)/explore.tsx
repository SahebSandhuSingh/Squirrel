import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { NeonMap } from '@/components/art';
import { Chips, Header, Icon, IconButton, Screen, SearchBar, Tagline, tap } from '@/components/ui';
import { places, type MapPlace } from '@/data/mock';
import { colors, fonts, radius } from '@/theme';

const FILTERS = ['All', 'Gyms', 'Runs', 'Cafes', 'Events'] as const;
type Filter = (typeof FILTERS)[number];

/** Explore — neon map of gyms, runs, cafes and events nearby. */
export default function Explore() {
  const { height } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>('All');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<MapPlace | null>(null);

  const visible = useMemo(
    () => places.filter((p) => (filter === 'All' || p.kind === filter) && p.name.toLowerCase().includes(q.toLowerCase())),
    [filter, q],
  );
  const mapH = Math.max(380, height - 330);

  return (
    <Screen scroll={false}>
      <Header title="Explore" right={<IconButton icon="tune-variant" onPress={() => router.push('/events')} />} />
      <View style={{ marginTop: 8 }}>
        <SearchBar placeholder="Search gyms, runs, cafes, people..." value={q} onChangeText={setQ} />
      </View>
      <Chips items={FILTERS} value={filter} onChange={setFilter} />

      <View style={[styles.map, { height: mapH }]}>
        <NeonMap style={StyleSheet.absoluteFill} />
        {visible.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => { tap(); setSelected(p); }}
            style={[styles.pin, { left: `${p.x * 100}%`, top: `${p.y * 100}%` }, selected?.id === p.id && { borderColor: colors.pink }]}>
            <View style={styles.pinDot}>
              <Icon name={p.icon} size={16} color="#fff" />
            </View>
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.pinName}>{p.name}</Text>
              <Text style={styles.pinMeta}>{p.meta}</Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.me}>
          <View style={styles.meDot} />
        </View>
        <Tagline size={22} style={{ position: 'absolute', left: 14, bottom: 26 }}>
          SAME{'\n'}MORE{'\n'}MOVEMENT.
        </Tagline>
        <Pressable style={styles.locate} onPress={() => { tap(); setSelected(null); }}>
          <Icon name="navigation-variant" size={22} color="#fff" />
        </Pressable>

        {selected && (
          <View style={styles.sheet}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{selected.name}</Text>
              <Text style={styles.pinMeta}>{selected.kind} · {selected.meta}</Text>
            </View>
            <Pressable style={styles.go} onPress={() => { tap(); router.push(selected.kind === 'Events' ? '/events' : selected.kind === 'Runs' ? '/run' : '/crew'); }}>
              <Text style={styles.goText}>{selected.kind === 'Runs' ? 'Start' : 'View'}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  pin: { position: 'absolute', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(10,6,16,0.85)', borderRadius: radius.pill, padding: 4, paddingRight: 12, borderWidth: 1, borderColor: colors.line },
  pinDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.pink },
  pinName: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
  pinMeta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11 },
  me: { position: 'absolute', left: '48%', top: '46%', width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(123,47,247,0.35)', alignItems: 'center', justifyContent: 'center' },
  meDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.purple, borderWidth: 3, borderColor: '#fff' },
  locate: { position: 'absolute', right: 14, bottom: 26, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 84, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.pink },
  sheetTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  go: { backgroundColor: colors.pink, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  goText: { color: colors.onPink, fontFamily: fonts.bold },
});
