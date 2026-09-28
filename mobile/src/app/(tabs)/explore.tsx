/**
 * CAMPUS MAP (the Map tab). Fixed named zones, their owners and territory state, your own
 * territories vs everyone else's, live ownership updates, and zone details on tap.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { realtimeMode } from '@/api/campus';
import { CampusMap } from '@/components/campus/CampusMap';
import { ErrorState, SourceBadge } from '@/components/campus/States';
import { RELATION_COLOR, relationOf, UNDER_ATTACK } from '@/components/campus/territoryUi';
import { ZonePanel } from '@/components/campus/ZonePanel';
import { Display, Icon, IconButton, Kicker, Pulse, Segmented, TAB_BAR_SPACE, tap } from '@/components/ui';
import { useMe, useTerritorySync, useZones } from '@/hooks/useCampus';
import { useAllTerritories, useTerritory } from '@/state/territoryStore';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

const VIEWS = ['Map', 'Zones'] as const;
type View_ = (typeof VIEWS)[number];

export default function CampusMapScreen() {
  const insets = useSafeAreaInsets();
  const zones = useZones();
  const me = useMe();
  const sync = useTerritorySync();
  const territories = useAllTerritories();
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<View_>('Map');
  const meId = me.data?.user_id ?? null;
  // Bring the zone panel into view once per selection (it renders below the map).
  const scrollRef = useRef<ScrollView>(null);
  const scrolledFor = useRef<string | null>(null);

  const counts = useMemo(() => {
    let mine = 0;
    let held = 0;
    let attacked = 0;
    for (const t of territories) {
      const r = relationOf(t, meId);
      if (r === 'mine') mine++;
      if (t.owner) held++;
      if (r === 'mine' && t.under_challenge) attacked++;
    }
    return { mine, held, attacked };
  }, [territories, meId]);
  const select = useCallback((id: string) => setSel((cur) => (cur === id ? null : id)), []);
  const zoneList = zones.data ?? [];
  const live = realtimeMode();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.col, { paddingTop: insets.top + 10, paddingBottom: TAB_BAR_SPACE + insets.bottom + 10 }]} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Kicker>Campus map</Kicker>
              <SourceBadge />
            </View>
            <Display size={34} style={{ marginTop: 2 }}>Own <Text style={{ color: colors.primary }}>your</Text> campus</Display>
          </View>
          <IconButton icon="trophy-outline" onPress={() => router.push('/leaderboard')} label="Leaderboards" />
        </View>

        <View style={styles.stats}>
          <Stat v={String(counts.mine)} l="Yours" c={colors.primary} />
          <Stat v={`${counts.held}/${zoneList.length || '—'}`} l="Zones held" />
          <Stat v={String(counts.attacked)} l="Under attack" c={counts.attacked ? UNDER_ATTACK : undefined} />
          <View style={styles.live} accessibilityLabel={live === 'focus' ? 'Refreshes when you open the map' : 'Live updates on'}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: live === 'focus' ? colors.dim : colors.green }}>{live !== 'focus' && <Pulse size={8} color={colors.green} />}</View>
            <Text style={styles.liveText}>{live === 'focus' ? 'Auto-refresh' : 'Live'}</Text>
          </View>
        </View>

        <Segmented items={VIEWS} value={view} onChange={setView} style={{ marginTop: 10 }} />

        {zones.error && !zones.data ? (
          <ErrorState cause={zones.cause} onRetry={zones.reload} />
        ) : view === 'Map' ? (
          <>
            {zoneList.length ? (
              <CampusMap zones={zoneList} meId={meId} selectedId={sel} onSelect={select} style={styles.map} />
            ) : (
              <View style={[styles.map, styles.mapLoading]}>
                <Text style={styles.meta}>Loading campus zones…</Text>
              </View>
            )}
            <View style={styles.legend}>
              {[
                ['Yours', RELATION_COLOR.mine, false],
                ['Held by others', RELATION_COLOR.other, false],
                ['Unclaimed', RELATION_COLOR.unclaimed, true],
                ['Under attack', UNDER_ATTACK, true],
              ].map(([l, c, dashed]) => (
                <View key={String(l)} style={styles.legendItem}>
                  <View style={[styles.swatch, { borderColor: String(c), borderStyle: dashed ? 'dashed' : 'solid' }]} />
                  <Text style={styles.legendText}>{l}</Text>
                </View>
              ))}
            </View>
            {!!sync.error && <ErrorState cause={sync.error} onRetry={sync.reload} compact title="Territories didn’t load" />}
          </>
        ) : (
          <View style={{ gap: 8, marginTop: 4 }}>
            {zoneList.map((z) => (
              <ZoneRow key={z.id} id={z.id} name={z.name} meId={meId} selected={sel === z.id} onPress={() => select(z.id)} />
            ))}
          </View>
        )}

        {sel ? (
          <View
            style={styles.panel}
            onLayout={(e) => {
              if (scrolledFor.current === sel) return;
              scrolledFor.current = sel;
              scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: true });
            }}>
            <Pressable onPress={() => { tap(); setSel(null); }} style={styles.close} accessibilityRole="button" accessibilityLabel="Close zone">
              <Icon name="close" size={18} color={colors.dim} />
            </Pressable>
            <ZonePanel key={sel} zoneId={sel} meId={meId} showOpen />
          </View>
        ) : (
          <Pressable onPress={() => router.push('/run')} style={styles.hint} accessibilityRole="button" accessibilityLabel="Start a run">
            <Icon name="gesture-tap" size={18} color={colors.primary} />
            <Text style={styles.hintText}>Tap a zone to see who holds it. Run or walk through a zone to become eligible to claim it — crossing it alone never claims it.</Text>
            <Icon name="run-fast" size={20} color={colors.primary} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ v, l, c }: { v: string; l: string; c?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statV, c ? { color: c } : null]}>{v}</Text>
      <Text style={styles.statL}>{l}</Text>
    </View>
  );
}

function ZoneRow({ id, name, meId, selected, onPress }: { id: string; name: string; meId: string | null; selected: boolean; onPress: () => void }) {
  const t = useTerritory(id);
  const rel = relationOf(t, meId);
  const c = t?.under_challenge ? UNDER_ATTACK : RELATION_COLOR[rel];
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={[styles.zoneRow, selected && { borderColor: c }]} accessibilityRole="button" accessibilityLabel={`${name}: ${rel}`}>
      <View style={[styles.zoneDot, { backgroundColor: c }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.zoneName}>{name}</Text>
        <Text style={styles.meta}>
          {rel === 'mine' ? 'Your territory' : rel === 'other' ? `Held by ${t?.owner?.display_name}` : rel === 'unclaimed' ? 'Unclaimed' : '…'}
          {t?.under_challenge ? ' · under attack' : ''}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.dim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 10 },
  statV: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 22 },
  statL: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  liveText: { color: colors.sub, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  map: { height: 420, marginTop: 10 },
  mapLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 16, height: 10, borderWidth: 2 },
  legendText: { color: colors.sub, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  panel: { marginTop: 14, backgroundColor: colors.bg2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 16 },
  close: { position: 'absolute', right: 10, top: 10, zIndex: 2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: 12 },
  hintText: { flex: 1, color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
  zoneDot: { width: 12, height: 12, borderRadius: 6 },
  zoneName: { color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
});
