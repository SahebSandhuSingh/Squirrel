/**
 * Everything floating over the territory map: top HUD (brand · where you are · your XP), search,
 * the control rail, the "you're in…" strip, the live ticker, the long-press peek card, the intro
 * caption and the Preview Season note. Kept light so the map stays the hero.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, DISPLAY_SKEW, fonts } from '@/theme';
import { shortTime } from '@/components/campus/territoryUi';
import { crewOf, CREWS } from '../data/crews';
import { CITIES, PLACES, UNRESOLVED } from '../data/world';
import { buildIndex, search, type SearchKind, type SearchResult } from '../logic/search';
import type { RegionTitle } from '../logic/camera';
import { useDiscovered, useFeed, useSeasonXp, useTerritory, useWorld } from '../state/worldStore';
import type { Territory } from '../types';
import { Brackets, Chevron, compact, HUD, W } from './hud';
import { STATUS_LABEL } from './TerritoryPanel';

// ---------------------------------------------------------------------------
// Top HUD
// ---------------------------------------------------------------------------

export const TopHud = memo(function TopHud({ region, top, desktop, onPreviewInfo }: { region: RegionTitle; top: number; desktop: boolean; onPreviewInfo: () => void }) {
  const xp = useSeasonXp();
  const level = Math.floor(xp / 2000) + 1;
  return (
    <View style={[styles.top, { top }]} pointerEvents="box-none">
      <View style={styles.brand} accessibilityRole="header" accessibilityLabel="Squirrel Social">
        <Image source={require('../../../../assets/brand/logo.png')} style={[styles.logo, !desktop && { width: 32, height: 32, borderRadius: 8 }]} />
        <View>
          <Text style={[styles.brandTop, !desktop && styles.brandSmall]}>SQUIRREL</Text>
          <Text style={[styles.brandBottom, !desktop && styles.brandSmall]}>SOCIAL</Text>
        </View>
      </View>
      <View style={styles.region} pointerEvents="box-none">
        <Text style={styles.crumbs} numberOfLines={1}>
          {region.crumbs.map((c) => c.toUpperCase()).join('  ›  ')}
        </Text>
        <Text style={styles.regionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityLiveRegion="polite">
          {region.title}
        </Text>
        <Pressable onPress={() => { tap(); onPreviewInfo(); }} hitSlop={8} style={styles.preview} accessibilityRole="button" accessibilityLabel="Preview Season. What this means">
          <View style={styles.previewDot} />
          <Text style={styles.previewText}>PREVIEW SEASON</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => { tap(); router.push('/profile'); }} style={styles.xp} accessibilityRole="button" accessibilityLabel={`Level ${level}, ${xp} season XP. Open profile`}>
        <View style={styles.lv}>
          <Text style={styles.lvText}>{level}</Text>
        </View>
        <View>
          <Text style={styles.xpValue}>{compact(xp)}</Text>
          <Text style={styles.xpUnit}>SEASON XP</Text>
        </View>
      </Pressable>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const KIND_ICON: Record<SearchKind, IconName> = {
  territory: 'hexagon-outline',
  zone: 'hexagon-multiple-outline',
  university: 'school-outline',
  college: 'book-open-variant',
  landmark: 'map-marker-star-outline',
  hotspot: 'fire',
  park: 'tree-outline',
  crew: 'shield-account-outline',
  area: 'map-outline',
  pending: 'help-circle-outline',
};
const SUGGEST = ['College Street', 'Salt Lake', 'Jadavpur University', 'New Town', 'IISER Kolkata', 'Night Owls'];

export function WorldSearch({ top, left, width, onPick, onFocusChange }: { top: number; left: number; width: number | undefined; onPick: (r: SearchResult) => void; onFocusChange: (on: boolean) => void }) {
  const world = useWorld();
  const discovered = useDiscovered();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focus, setFocus] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  // The index only needs names and owners; rebuild when the set of territories changes, not on every tick.
  const ownersKey = world.map((t) => t.state.ownerCrewId ?? '').join(',');
  const index = useMemo(
    () => buildIndex({ territories: world, discovered, places: PLACES, crews: CREWS, cities: CITIES, unresolved: UNRESOLVED, crewName: (id) => crewOf(id)?.name ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownersKey, discovered],
  );
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 120);
    return () => clearTimeout(t);
  }, [q]);
  const results = useMemo(() => search(index, debounced), [index, debounced]);
  const open = focus;
  const setOpen = (on: boolean) => {
    setFocus(on);
    onFocusChange(on);
    if (!on) setPending(null);
  };
  const pick = (r: SearchResult) => {
    tap();
    if (r.kind === 'pending') {
      setPending((p) => (p === r.key ? null : r.key));
      return;
    }
    input.current?.blur();
    setOpen(false);
    setQ('');
    onPick(r);
  };

  return (
    <View style={[styles.searchWrap, { top, left, right: width ? undefined : left, width }]} pointerEvents="box-none">
      <View style={[styles.search, open && { borderColor: alpha(W.primary, 0.5) }]}>
        <Icon name="magnify" size={19} color={open ? W.primary : HUD.inkDim} />
        <TextInput
          ref={input}
          value={q}
          onChangeText={setQ}
          onFocus={() => setOpen(true)}
          placeholder="Search Kolkata…"
          placeholderTextColor={HUD.inkMute}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={() => results[0] && pick(results[0])}
          accessibilityLabel="Search territories, colleges, places and crews"
        />
        {open && (
          <Pressable onPress={() => { setQ(''); input.current?.blur(); setOpen(false); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close search">
            <Icon name="close" size={18} color={HUD.inkDim} />
          </Pressable>
        )}
      </View>
      {open && (
        <View style={styles.results}>
          <Brackets />
          {!debounced.trim() ? (
            <View style={{ padding: 12, gap: 10 }}>
              <Text style={styles.resultsKicker}>JUMP TO</Text>
              <View style={styles.suggest}>
                {SUGGEST.map((s) => (
                  <Pressable key={s} onPress={() => { tap(); setQ(s); }} style={styles.suggestChip} accessibilityRole="button">
                    <Text style={styles.suggestText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : results.length === 0 ? (
            <Text style={styles.noResults}>Nothing on the network called “{debounced}”.</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
              {results.map((r) => (
                <View key={r.key}>
                  <Pressable onPress={() => pick(r)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: alpha(HUD.ink, 0.05) }]} accessibilityRole="button" accessibilityLabel={`${r.title}, ${r.subtitle}`}>
                    <Icon name={KIND_ICON[r.kind]} size={18} color={r.kind === 'pending' ? HUD.inkMute : r.kind === 'crew' ? crewOf(r.crewId)?.color ?? HUD.ink : HUD.gold} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.resultTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.resultSub} numberOfLines={1}>{r.subtitle}</Text>
                    </View>
                    <Text style={styles.resultKind}>{r.kind === 'pending' ? 'PENDING' : r.kind.toUpperCase()}</Text>
                  </Pressable>
                  {pending === r.key && <PendingInfo id={r.key.slice(2)} onFly={(c) => pick({ ...r, kind: 'area', target: { center: c, zoom: 13 } })} />}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function PendingInfo({ id, onFly }: { id: string; onFly: (c: [number, number]) => void }) {
  const u = UNRESOLVED.find((x) => x.id === id);
  if (!u) return null;
  return (
    <View style={styles.pending}>
      <Text style={styles.pendingText}>{u.reason}</Text>
      {u.candidates.map((c) => (
        <Pressable key={c.name} disabled={!c.at} onPress={() => c.at && onFly([c.at[1], c.at[0]])} style={styles.pendingRow} accessibilityRole="button">
          <Icon name={c.at ? 'arrow-top-right' : 'help-circle-outline'} size={14} color={c.at ? W.primary : HUD.inkMute} />
          <Text style={[styles.pendingText, { flex: 1, color: c.at ? HUD.ink : HUD.inkMute }]}>
            {c.name} — {c.note}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Control rail
// ---------------------------------------------------------------------------

export type ControlAction = 'locate' | 'home' | 'kolkata' | 'bengal' | 'heat' | 'campus';

export const Controls = memo(function Controls({ bottom, right, heat, onAction }: { bottom: number; right: number; heat: boolean; onAction: (a: ControlAction) => void }) {
  const btn = (a: ControlAction, icon: IconName, label: string, opts: { on?: boolean; text?: string } = {}) => (
    <Pressable
      key={a}
      onPress={() => { tap(); onAction(a); }}
      style={({ pressed }) => [styles.ctl, opts.on && { borderColor: alpha('#FF4FA8', 0.6), backgroundColor: alpha('#FF4FA8', 0.12) }, pressed && { transform: [{ scale: 0.94 }] }]}
      accessibilityRole={a === 'heat' ? 'switch' : 'button'}
      accessibilityState={a === 'heat' ? { checked: !!opts.on } : undefined}
      accessibilityLabel={label}>
      {opts.text ? <Text style={styles.ctlText}>{opts.text}</Text> : <Icon name={icon} size={20} color={opts.on ? '#FF4FA8' : HUD.ink} />}
    </Pressable>
  );
  return (
    <View style={[styles.rail, { bottom, right }]} pointerEvents="box-none">
      <View style={styles.group}>
        {btn('locate', 'crosshairs-gps', 'Locate me')}
        {btn('home', 'flag-variant-outline', 'Return to your current territory')}
      </View>
      <View style={styles.group}>
        {btn('kolkata', 'city-variant-outline', 'Zoom to Kolkata', { text: 'KOL' })}
        {btn('bengal', 'earth', 'Zoom to West Bengal', { text: 'WB' })}
      </View>
      <View style={styles.group}>
        {btn('heat', 'fire', 'Activity heat', { on: heat })}
        {btn('campus', 'school-outline', 'IISER campus map')}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// You're in… strip + live ticker
// ---------------------------------------------------------------------------

export function HereStrip({ id, preview, bottom, onOpen }: { id: string | null; preview: boolean; bottom: number; onOpen: (id: string) => void }) {
  const t = useTerritory(id);
  const owner = crewOf(t?.state.ownerCrewId);
  if (!t) {
    return (
      <View style={[styles.strip, { bottom }]}>
        <Icon name="map-marker-radius" size={18} color={HUD.inkMute} />
        <Text style={[styles.stripSub, { flex: 1 }]}>Outside the network — head into Kolkata to start claiming.</Text>
      </View>
    );
  }
  const st = STATUS_LABEL[t.state.status];
  const color = t.state.status === 'locked' ? HUD.gold : owner?.color ?? HUD.inkMute;
  return (
    <Pressable onPress={() => { tap(); onOpen(t.id); }} style={[styles.strip, { bottom }]} accessibilityRole="button" accessibilityLabel={`You're in ${t.name}. ${owner ? `${owner.name}, ${t.state.control} percent control` : st.label}. Open`}>
      <View style={[styles.stripBar, { backgroundColor: color }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.stripKicker}>{preview ? 'YOU’RE IN · PREVIEW POSITION' : 'YOU’RE IN'}</Text>
        <Text style={styles.stripName} numberOfLines={1}>{t.name}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.stripCrew, { color }]} numberOfLines={1}>{owner ? owner.short : st.label.toUpperCase()}</Text>
        {owner && <Text style={styles.stripPct}>{t.state.control}%{t.state.status !== 'owned' ? ` · ${st.label.toUpperCase()}` : ''}</Text>}
      </View>
      <Chevron />
    </Pressable>
  );
}

export function Ticker({ bottom, onOpen }: { bottom: number; onOpen: (id: string) => void }) {
  const feed = useFeed();
  const item = feed[0];
  const [v] = useState(() => new Animated.Value(1));
  const key = item?.id;
  useEffect(() => {
    if (!key) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [key, v]);
  if (!item) return null;
  const c = crewOf(item.crewId);
  return (
    <Animated.View style={[styles.tickerWrap, { bottom, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
      <Pressable onPress={() => { tap(); onOpen(item.territoryId); }} style={styles.ticker} accessibilityRole="button" accessibilityLabel={`Live: ${item.text}, plus ${item.xp} XP`} accessibilityLiveRegion="polite">
        <View style={[styles.tickDot, { backgroundColor: c?.color ?? HUD.inkDim }]} />
        <Text style={styles.tickText} numberOfLines={1}>{item.text}</Text>
        <Text style={styles.tickXp}>+{item.xp}</Text>
        <Text style={styles.tickWhen}>{shortTime(new Date(item.at).toISOString())}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Long-press peek
// ---------------------------------------------------------------------------

export function Peek({ t, x, y, onOpen, onClose }: { t: Territory; x: number; y: number; onOpen: () => void; onClose: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 24, bounciness: 3 }).start();
  }, [v]);
  const owner = crewOf(t.state.ownerCrewId);
  const st = STATUS_LABEL[t.state.status];
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss">
      <Animated.View style={[styles.peek, { left: Math.max(8, x - 120), top: Math.max(80, y - 150), opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
        <Brackets color={alpha(owner?.color ?? HUD.ink, 0.6)} />
        <Text style={styles.peekKicker}>LV {t.level} · {st.label.toUpperCase()}</Text>
        <Text style={styles.peekName} numberOfLines={1}>{t.name}</Text>
        <Text style={[styles.peekSub, { color: owner?.color ?? HUD.inkDim }]} numberOfLines={1}>
          {owner ? `${owner.name} · ${t.state.control}%` : t.state.status === 'locked' ? 'Protected' : 'Unclaimed ground'} · {t.state.activeUsers} active
        </Text>
        <Pressable onPress={() => { tap(); onOpen(); }} style={styles.peekBtn} accessibilityRole="button">
          <Text style={styles.peekBtnText}>OPEN TERRITORY</Text>
          <Icon name="chevron-right" size={16} color={W.onPrimary} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Intro caption, Preview Season note, offline note
// ---------------------------------------------------------------------------

export function IntroCaption({ bottom, territories, onSkip }: { bottom: number; territories: number; onSkip: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  const [line] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([
      Animated.delay(700),
      Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      Animated.timing(line, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
    ]).start();
  }, [v, line]);
  return (
    <View style={[styles.intro, { bottom }]} pointerEvents="box-none">
      <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        <Text style={styles.introKicker}>THE SQUIRREL SOCIAL TERRITORY NETWORK</Text>
        <Text style={styles.introTitle}>Kolkata is up for grabs.</Text>
      </Animated.View>
      <Animated.View style={{ opacity: line }}>
        <Text style={styles.introSub}>
          {territories} TERRITORIES · {CREWS.length} CREWS · ONE CITY
        </Text>
      </Animated.View>
      <Pressable onPress={onSkip} style={styles.skip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip intro">
        <Text style={styles.skipText}>SKIP</Text>
      </Pressable>
    </View>
  );
}

export function PreviewNote({ onClose, tiles }: { onClose: () => void; tiles: boolean }) {
  return (
    <Pressable style={[StyleSheet.absoluteFill, styles.noteBackdrop]} onPress={onClose} accessibilityLabel="Close">
      <View style={styles.note}>
        <Brackets color={alpha(HUD.gold, 0.5)} />
        <Text style={[styles.resultsKicker, { color: HUD.gold }]}>PREVIEW SEASON</Text>
        <Text style={styles.noteTitle}>This is Season 1, before it starts.</Text>
        <Text style={styles.noteBody}>
          The crews, owners, XP and live activity on this map are a preview generated on your phone — not real players. Claiming, defending and discovering work, and your progress is kept on this device. Real ownership switches on when the territory backend goes live.
        </Text>
        <Text style={styles.noteBody}>
          Outlines and pins marked ≈ are approximate. Activity is only ever shown per territory (“12 squirrels active”) — never anyone’s position.
          {tiles ? '' : ' The street map couldn’t load, so the network is drawn on its own geography.'}
        </Text>
        <Pressable onPress={onClose} style={styles.peekBtn} accessibilityRole="button">
          <Text style={styles.peekBtnText}>GOT IT</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  logo: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: HUD.hairHi },
  brandTop: { color: HUD.ink, fontFamily: fonts.display, fontSize: 15, lineHeight: 16, letterSpacing: 1.6 },
  brandBottom: { color: W.primary, fontFamily: fonts.display, fontSize: 15, lineHeight: 16, letterSpacing: 1.6 },
  brandSmall: { fontSize: 11.5, lineHeight: 13, letterSpacing: 1.2 },
  region: { flex: 1, alignItems: 'center', minWidth: 0 },
  crumbs: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.8 },
  regionTitle: { color: HUD.ink, fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: 1.2, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }], textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 10, maxWidth: '100%' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  previewDot: { width: 5, height: 5, backgroundColor: HUD.gold, transform: [{ rotate: '45deg' }] },
  previewText: { color: HUD.gold, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.8 },
  xp: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: HUD.panelSoft, borderWidth: 1, borderColor: HUD.hair, paddingLeft: 5, paddingRight: 10, paddingVertical: 5 },
  lv: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: W.primaryFill, transform: [{ rotate: '45deg' }, { scale: 0.86 }] },
  lvText: { color: W.onPrimary, fontFamily: fonts.display, fontSize: 14, transform: [{ rotate: '-45deg' }] },
  xpValue: { color: HUD.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 18, letterSpacing: 0.5 },
  xpUnit: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 8.5, letterSpacing: 1.4 },

  searchWrap: { position: 'absolute' },
  search: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hair },
  searchInput: { flex: 1, color: HUD.ink, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 0, outlineStyle: 'none' } as never,
  results: { marginTop: 6, backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hair },
  resultsKicker: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10.5, letterSpacing: 2 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestChip: { borderWidth: 1, borderColor: HUD.hairHi, paddingHorizontal: 10, paddingVertical: 7 },
  suggestText: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 12.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  noResults: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 13, padding: 14 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: HUD.hair },
  resultTitle: { color: HUD.ink, fontFamily: fonts.semibold, fontSize: 14.5 },
  resultSub: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  resultKind: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.4 },
  pending: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2, gap: 6, backgroundColor: alpha('#000', 0.25) },
  pendingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  pendingText: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },

  rail: { position: 'absolute', gap: 8 },
  group: { backgroundColor: HUD.panelSoft, borderWidth: 1, borderColor: HUD.hair },
  ctl: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  ctlText: { color: HUD.ink, fontFamily: fonts.display, fontSize: 14, letterSpacing: 1 },

  strip: { position: 'absolute', left: 12, right: 70, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hair, paddingRight: 12 },
  stripBar: { width: 3, alignSelf: 'stretch' },
  stripKicker: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.8 },
  stripName: { color: HUD.ink, fontFamily: fonts.display, fontSize: 19, letterSpacing: 0.8, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  stripSub: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 12.5, padding: 12 },
  stripCrew: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1.4 },
  stripPct: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 10.5, letterSpacing: 1 },
  tickerWrap: { position: 'absolute', left: 12, right: 70 },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: HUD.panelSoft, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start', maxWidth: '100%', borderLeftWidth: 2, borderLeftColor: W.green },
  tickDot: { width: 6, height: 6, transform: [{ rotate: '45deg' }] },
  tickText: { flexShrink: 1, color: HUD.ink, fontFamily: fonts.medium, fontSize: 12 },
  tickXp: { color: W.primary, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 0.6 },
  tickWhen: { color: HUD.inkMute, fontFamily: fonts.label, fontSize: 11 },

  peek: { position: 'absolute', width: 240, backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hair, padding: 14, gap: 3 },
  peekKicker: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.8 },
  peekName: { color: HUD.ink, fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.8, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  peekSub: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 0.8 },
  peekBtn: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: W.primaryFill, paddingVertical: 10 },
  peekBtnText: { color: W.onPrimary, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1.6 },

  intro: { position: 'absolute', left: 20, right: 20, alignItems: 'flex-start' },
  introKicker: { color: W.primary, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2.4 },
  introTitle: { color: HUD.ink, fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: 0.8, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }], textShadowColor: '#000', textShadowRadius: 18, marginTop: 4 },
  introSub: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 2.2, marginTop: 6 },
  skip: { marginTop: 14, borderWidth: 1, borderColor: HUD.hairHi, paddingHorizontal: 12, paddingVertical: 6 },
  skipText: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2 },

  noteBackdrop: { backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  note: { width: '100%', maxWidth: 420, backgroundColor: HUD.panel, borderWidth: 1, borderColor: HUD.hair, padding: 18, gap: 10 },
  noteTitle: { color: HUD.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.6, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  noteBody: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20 },
});
