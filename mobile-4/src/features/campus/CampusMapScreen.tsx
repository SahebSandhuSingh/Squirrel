/**
 * IISER KOLKATA — the campus as a territory game.
 *
 * The map (engine/, MapLibre in a WebView / iframe) draws the real campus from OpenStreetMap and
 * the zones grown from its landmarks. This screen is the HUD and the conductor: it loads the
 * zones from the campus map service, turns them into map layers whenever they change, opens a
 * zone on tap, offers only the moves the rules allow, and plays the moment when one lands.
 *
 * Your position is your own device's, used on the device only. Away from Mohanpur (or with no
 * fix) you stand at a labelled preview position on campus, so the game can be tried anywhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, NATIVE, tap } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { startLocationWatch, useLocation } from '@/state/locationStore';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import { metres } from '@/features/world/logic/geometry';
import { CAMPUS_OSM, campusGeography } from './data/campus';
import { campusBase, campusLayers } from './engine/features';
import type { EngineMessage, MapMode, Padding } from './engine/protocol';
import { allowedActions, reachOf, RuleError } from './logic/rules';
import { getCampusMap, loadCampusMap, onMoment, performAction, startCampusLive, useCampusMap, type Moment } from './state/campusMapStore';
import type { LngLat, Zone, ZoneAction } from './types';
import { CampusCanvas, type CampusCanvasHandle } from './components/CampusCanvas';
import { BattleList, CrewLegend, HUD, LiveLine, MapButtons, ModeBar, TerritoryBar, TopBar } from './components/CampusHud';
import { ZoneSheet } from './components/ZoneSheet';

/** Where you stand when you're not on campus: the road between the LHC and AJC Bose. Labelled. */
export const PREVIEW_POSITION: LngLat = [88.5249, 22.9643];
/** A GPS fix this close to campus counts as being here. */
const ON_CAMPUS_M = 2500;

const OUTCOME: Record<string, { title: string; icon: 'flag-variant' | 'sword' | 'flag-checkered' | 'shield-half-full' | 'shield-check' | 'sword-cross' }> = {
  claimed: { title: 'Zone claimed', icon: 'flag-variant' },
  attacked: { title: 'Attack landed', icon: 'sword' },
  captured: { title: 'Zone captured', icon: 'flag-checkered' },
  defended: { title: 'Defences up', icon: 'shield-half-full' },
  repelled: { title: 'Attack repelled', icon: 'shield-check' },
  challenged: { title: 'Battle called', icon: 'sword-cross' },
};

export function CampusMapScreen({ onBack, onOpenBoard }: { onBack: () => void; /** The live campus board (nearby players, pokes), when the campus backend is live. */ onOpenBoard?: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { toast } = useApp();
  const map = useCampusMap();
  const geo = useMemo(() => campusGeography(), []);
  const loc = useLocation();
  const canvas = useRef<CampusCanvasHandle>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('territory');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bearing, setBearing] = useState(0);
  const [stamp, setStamp] = useState<{ key: number; title: string; sub: string; color: string; icon: (typeof OUTCOME)[string]['icon'] } | null>(null);

  const wide = width >= 900;
  const narrow = width < 380;
  const top = insets.top + 8;
  const tabH = 64 + Math.max(insets.bottom, 10);
  const send = useCallback((m: Parameters<CampusCanvasHandle['send']>[0]) => canvas.current?.send(m), []);
  const clearStamp = useCallback(() => setStamp(null), []);

  // --- You -----------------------------------------------------------------------------------
  const real = loc.position ? ([loc.position[1], loc.position[0]] as LngLat) : null;
  const onCampus = !!real && metres(real, geo.center) <= ON_CAMPUS_M;
  const me: LngLat = onCampus && real ? real : PREVIEW_POSITION;
  const myCrewId = map.player?.crewId ?? null;
  const myCrew = map.crews.find((c) => c.id === myCrewId) ?? null;

  // --- Data → map ------------------------------------------------------------------------------
  useEffect(() => {
    if (map.status === 'idle' || map.status === 'error') void loadCampusMap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const stopLoc = startLocationWatch();
      const stopLive = startCampusLive();
      send({ type: 'active', on: true });
      return () => {
        stopLoc();
        stopLive();
        send({ type: 'active', on: false });
      };
    }, [send]),
  );

  const hudTop = top + 58 + 6 + 42 + 8;
  const sheetH = Math.min(Math.round(height * 0.62), 560);
  const padding = useCallback(
    (sheet: boolean): Padding => ({
      top: hudTop + 44,
      bottom: wide ? tabH + 80 : sheet ? sheetH + 30 : tabH + 72,
      left: wide ? 24 : 18,
      right: wide ? (sheet ? 420 : 80) : 18,
    }),
    [hudTop, wide, sheetH, tabH],
  );
  const bearingFor = width < height ? -90 : 0;

  const inited = useRef(false);
  useEffect(() => {
    if (!engineReady || inited.current) return;
    inited.current = true;
    send({ type: 'init', base: campusBase(CAMPUS_OSM), bbox: geo.bbox, padding: padding(false), bearing: bearingFor, intro: true });
    send({ type: 'mode', mode });
  }, [engineReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const layers = useMemo(() => (map.zones.length ? campusLayers(map.zones, map.crews, geo, myCrewId) : null), [map.zones, map.crews, geo, myCrewId]);
  useEffect(() => {
    if (engineReady && layers) send({ type: 'state', ...layers });
  }, [engineReady, layers, send]);
  useEffect(() => {
    if (engineReady) send({ type: 'mode', mode });
  }, [engineReady, mode, send]);
  useEffect(() => {
    if (engineReady) send({ type: 'select', id: selectedId });
  }, [engineReady, selectedId, send]);
  useEffect(() => {
    if (engineReady) send({ type: 'me', pos: me, accuracy: onCampus ? loc.accuracy_m ?? 20 : 30, heading: null, preview: !onCampus });
  }, [engineReady, me[0], me[1], onCampus, loc.accuracy_m]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (engineReady) send({ type: 'insets', top: hudTop - 4, right: 8 });
  }, [engineReady, hudTop, send]);

  // --- Moments ---------------------------------------------------------------------------------
  const colorOf = useCallback((id: string | null | undefined) => getCampusMap().crews.find((c) => c.id === id)?.color ?? '#8A8F9C', []);
  useEffect(
    () =>
      onMoment((m: Moment) => {
        if (m.kind === 'ping') send({ type: 'ping', id: m.zoneId, color: colorOf(m.crewId) });
        else if (m.kind === 'captured') {
          const mine = getCampusMap().player?.crewId;
          const lost = !!mine && m.fromCrewId === mine;
          send({ type: 'fx', kind: lost ? 'lost' : 'capture', id: m.zone.id, color: lost ? HUD.attack : colorOf(m.byCrewId), from: null });
          if (lost) toast(`${getCampusMap().crews.find((c) => c.id === m.byCrewId)?.name ?? 'A rival crew'} took ${m.zone.name}`, 'flag-remove', HUD.attack);
        } else {
          const r = m.result;
          const kind = ({ claimed: 'claim', captured: 'capture', attacked: 'attack', defended: 'defend', repelled: 'repel', challenged: 'challenge' } as const)[r.outcome];
          send({ type: 'fx', kind, id: r.zone.id, color: colorOf(r.player.crewId), from: m.from });
          const o = OUTCOME[r.outcome];
          setStamp({ key: Date.now(), title: o.title, sub: `${r.zone.name} · +${r.xpGained} XP`, color: kind === 'attack' || kind === 'challenge' ? HUD.attack : colorOf(r.player.crewId), icon: o.icon });
        }
      }),
    [send, colorOf, toast],
  );

  // --- Selection -------------------------------------------------------------------------------
  const selected = selectedId ? map.zones.find((z) => z.id === selectedId) ?? null : null;
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) return;
      const z = getCampusMap().zones.find((x) => x.id === id);
      if (z) send({ type: 'fly', center: z.center, padding: padding(true), duration: 700 });
    },
    [send, padding],
  );

  const onMessage = useCallback(
    (m: EngineMessage) => {
      switch (m.type) {
        case 'ready':
          setEngineReady(true);
          break;
        case 'loaded':
          setMapLoaded(true);
          break;
        case 'tap':
          if (m.id) tap();
          select(m.id && m.id !== selectedId ? m.id : null);
          break;
        case 'camera':
          if (!m.moving) setBearing(m.bearing);
          break;
        case 'error':
          if (m.detail === 'maplibre_unavailable') setMapError('The map couldn’t load. Check your connection and try again.');
          break;
      }
    },
    [select, selectedId],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedId) {
        setSelectedId(null);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [selectedId, onBack]);

  // --- Moves -----------------------------------------------------------------------------------
  const act = useCallback(
    async (zone: Zone, action: ZoneAction) => {
      try {
        await performAction(zone.id, action, me);
      } catch (e) {
        tap('impact');
        toast(e instanceof RuleError || e instanceof Error ? e.message : 'That move didn’t go through', 'alert-circle-outline', HUD.attack);
      }
    },
    [me, toast],
  );

  // --- Derived HUD numbers ---------------------------------------------------------------------
  const mineZones = map.zones.filter((z) => myCrewId && z.ownerCrewId === myCrewId);
  const myBattles = map.zones.filter((z) => z.challenge && (z.ownerCrewId === myCrewId || z.challenge.attackerCrewId === myCrewId));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const z of map.zones) if (z.ownerCrewId) c[z.ownerCrewId] = (c[z.ownerCrewId] ?? 0) + 1;
    return c;
  }, [map.zones]);
  const battles = map.zones
    .filter((z) => z.challenge)
    .map((z) => ({ id: z.id, name: z.geometry.short, attacker: map.crews.find((c) => c.id === z.challenge!.attackerCrewId) ?? null, defender: map.crews.find((c) => c.id === z.ownerCrewId) ?? null, progress: z.challenge!.progress, mine: z.ownerCrewId === myCrewId || z.challenge!.attackerCrewId === myCrewId }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.progress - a.progress);

  const lines = useMemo(() => liveLines(map.zones, map.feed, map.crews, me), [map.zones, map.feed, map.crews, me]);

  const reach = selected ? reachOf(selected, me) : null;
  const allowed = selected && map.player ? allowedActions(selected, map.player, reach) : null;
  const sheetOpen = !!selected && !!allowed;
  const showBottom = wide || !sheetOpen;
  const ready = map.status === 'ready' && mapLoaded;

  const fitMine = () => {
    if (!mineZones.length) return;
    const b = mineZones.reduce<[number, number, number, number]>((acc, z) => [Math.min(acc[0], z.geometry.bbox[0]), Math.min(acc[1], z.geometry.bbox[1]), Math.max(acc[2], z.geometry.bbox[2]), Math.max(acc[3], z.geometry.bbox[3])], [180, 90, -180, -90]);
    setSelectedId(null);
    send({ type: 'fit', bbox: b, padding: padding(false), maxZoom: 17.2 });
  };

  return (
    <View style={s.root}>
      <CampusCanvas ref={canvas} onMessage={onMessage} style={StyleSheet.absoluteFill} />

      <TopBar top={top} xp={map.player?.xp ?? null} crew={myCrew} preview={map.mode === 'preview'} onBack={onBack} onBoard={onOpenBoard} compact={narrow} />

      <View style={[s.hudCol, { top: top + 64, right: wide ? undefined : 10, width: wide ? 560 : undefined }]} pointerEvents="box-none">
        <ModeBar mode={mode} onChange={setMode} labels={width < 600 ? 'active' : 'all'} />
        {ready && <LiveLine lines={lines} />}
      </View>
      {ready && (mode === 'crews' || mode === 'challenges') && (
        <View style={[s.chips, { top: hudTop + 30, right: wide ? undefined : 0, width: wide ? 580 : undefined }]} pointerEvents="box-none">
          {mode === 'crews' ? <CrewLegend crews={map.crews} counts={counts} mine={myCrewId} /> : <BattleList items={battles} onPick={(id) => select(id)} />}
        </View>
      )}

      {(wide || !sheetOpen) && (
        <View style={[s.buttons, { bottom: tabH + 84, right: wide && sheetOpen ? 404 : 10 }]} pointerEvents="box-none">
          <MapButtons
            bearing={bearing}
            located={onCampus}
            zoom={wide ? (by) => send({ type: 'zoom', by }) : undefined}
            onNorth={() => send({ type: 'north' })}
            onFit={() => {
              setSelectedId(null);
              send({ type: 'fit', bbox: geo.bbox, padding: padding(false), bearing: bearingFor, maxZoom: 17 });
            }}
            onLocate={() => {
              if (!onCampus) toast(loc.position ? 'You’re not at IISER Kolkata — showing the preview position on campus' : 'No GPS fix yet — showing the preview position on campus', 'crosshairs-question', W.gold);
              send({ type: 'fly', center: me, zoom: 17, padding: padding(false), duration: 800 });
            }}
          />
        </View>
      )}

      {showBottom && ready && (
        <View style={[s.bottom, { bottom: tabH + 10, width: wide ? 420 : undefined, right: wide ? undefined : 10 }]} pointerEvents="box-none">
          <TerritoryBar zones={mineZones.length} xp={map.player?.xp ?? null} crew={myCrew} onPress={fitMine} battles={myBattles.length} onBattles={() => setMode('challenges')} />
        </View>
      )}

      {sheetOpen && selected && allowed && (
        <View style={wide ? [s.panelWrap, { top: top + 64, bottom: tabH + 8 }] : [s.sheetWrap, { bottom: tabH }]} pointerEvents="box-none">
          <ZoneSheet
            key={selected.id}
            zone={selected}
            crews={map.crews}
            myCrewId={myCrewId}
            reach={reach}
            allowed={allowed}
            pending={map.pending?.zoneId === selected.id ? map.pending.action : null}
            onAction={(a) => void act(selected, a)}
            onClose={() => setSelectedId(null)}
            wide={wide}
            maxHeight={wide ? height - top - 64 - tabH - 8 : sheetH}
          />
        </View>
      )}

      {stamp && <Stamp key={stamp.key} title={stamp.title} sub={stamp.sub} color={stamp.color} icon={stamp.icon} top={hudTop + 40} onDone={clearStamp} />}

      {!ready && !mapError && map.status !== 'error' && <Loading top={hudTop} />}
      {(mapError || map.status === 'error') && (
        <View style={[s.overlay, { paddingTop: hudTop }]}>
          <Icon name={mapError ? 'map-marker-off-outline' : 'cloud-alert'} size={34} color={HUD.inkDim} />
          <Text style={s.overlayTitle}>{mapError ? 'MAP OFFLINE' : 'ZONES UNAVAILABLE'}</Text>
          <Text style={s.overlayText}>{mapError ?? `The campus zones didn’t load (${map.error}).`}</Text>
          {!mapError && (
            <Pressable onPress={() => { tap(); void loadCampusMap(); }} style={s.retry} accessibilityRole="button" accessibilityLabel="Try again">
              <Text style={s.retryText}>TRY AGAIN</Text>
            </Pressable>
          )}
        </View>
      )}
      {map.status === 'ready' && !map.zones.length && (
        <View style={[s.overlay, { paddingTop: hudTop, backgroundColor: 'transparent' }]} pointerEvents="none">
          <Text style={s.overlayTitle}>NO ZONES YET</Text>
          <Text style={s.overlayText}>This campus has no playable zones this season.</Text>
        </View>
      )}
    </View>
  );
}

/** What the live line says: the crowd near you, the nearest battle, the latest move on campus. */
function liveLines(zones: Zone[], feed: { zoneId: string; crewId?: string | null; kind?: string; timestamp: number }[], crews: { id: string; short: string; color: string }[], me: LngLat) {
  const out: { key: string; text: string; color?: string; icon?: 'account-group' | 'sword-cross' | 'flash' }[] = [];
  const near = zones.filter((z) => z.status !== 'locked' && (reachOf(z, me)?.inside || metres(me, z.center) <= 400));
  const people = near.reduce((n, z) => n + z.activeUsers, 0);
  if (people) out.push({ key: 'near', text: `${people} squirrels active nearby`, icon: 'account-group' });
  const fights = zones.filter((z) => z.challenge).map((z) => ({ z, d: reachOf(z, me)?.inside ? 0 : Math.round(metres(me, z.center) / 10) * 10 })).sort((a, b) => a.d - b.d);
  if (fights[0]) {
    const f = fights[0];
    const att = crews.find((c) => c.id === f.z.challenge!.attackerCrewId);
    out.push({ key: 'battle', text: f.d === 0 ? `Crew battle right here · ${f.z.geometry.short}` : `Crew battle happening ${f.d} m away · ${f.z.geometry.short}`, color: att?.color, icon: 'sword-cross' });
  }
  const last = feed.find((a) => a.kind && a.kind !== 'visit');
  if (last) {
    const c = crews.find((x) => x.id === last.crewId);
    const z = zones.find((x) => x.id === last.zoneId);
    const verb = { claim: 'claimed', attack: 'attacked', defend: 'defended', capture: 'captured', challenge: 'challenged' }[last.kind as 'claim'] ?? 'moved on';
    if (c && z) out.push({ key: `feed-${last.timestamp}`, text: `${c.short} ${verb} ${z.geometry.short}`, color: c.color, icon: 'flash' });
  }
  return out;
}

function Stamp({ title, sub, color, icon, top, onDone }: { title: string; sub: string; color: string; icon: (typeof OUTCOME)[string]['icon']; top: number; onDone: () => void }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, speed: 14, bounciness: 6 }),
      Animated.delay(1700),
      Animated.timing(v, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]);
    a.start(({ finished }) => finished && onDone());
    return () => a.stop();
  }, [v, onDone]);
  return (
    <Animated.View pointerEvents="none" style={[s.stampWrap, { top, opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }) }]}>
      <Animated.View style={[s.stamp, { borderColor: color, transform: [{ scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [1.25, 1, 0.96] }) }, { rotate: '-2deg' }] }]} accessibilityRole="alert" accessibilityLabel={`${title}. ${sub}`}>
        <Icon name={icon} size={26} color={color} />
        <View>
          <Text style={[s.stampTitle, { color }]}>{title}</Text>
          <Text style={s.stampSub} numberOfLines={1}>{sub}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Loading({ top }: { top: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={[s.overlay, { paddingTop: top }]} accessibilityLabel="Loading the campus map" accessibilityLiveRegion="polite">
      <View style={s.scanBox}>
        <Animated.View style={[s.scanLine, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 58] }) }] }]} />
        <Icon name="hexagon-slice-6" size={30} color={W.primary} />
      </View>
      <Text style={s.overlayTitle}>SCANNING CAMPUS</Text>
      <Text style={s.overlayText}>Loading IISER Kolkata’s zones and crews…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050608' },
  hudCol: { position: 'absolute', left: 10, gap: 6 },
  chips: { position: 'absolute', left: 0 },
  buttons: { position: 'absolute' },
  bottom: { position: 'absolute', left: 10 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  panelWrap: { position: 'absolute', right: 0, bottom: 0, width: 420 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(5,6,8,0.86)', paddingHorizontal: 32 },
  overlayTitle: { color: HUD.ink, fontFamily: fonts.display, fontSize: 24, letterSpacing: 2, transform: [{ skewX: DISPLAY_SKEW }] },
  overlayText: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, textAlign: 'center', maxWidth: 320 },
  retry: { marginTop: 8, height: 44, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: HUD.ink },
  retryText: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 14, letterSpacing: 2 },
  scanBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: alpha(W.primary, 0.4), overflow: 'hidden', marginBottom: 8 },
  scanLine: { position: 'absolute', left: 0, right: 0, top: 2, height: 2, backgroundColor: alpha(W.primary, 0.7) },
  stampWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: HUD.solid, borderWidth: 2, paddingHorizontal: 18, paddingVertical: 11, maxWidth: 420 },
  stampTitle: { fontFamily: fonts.display, fontSize: 23, letterSpacing: 1, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  stampSub: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', maxWidth: 300 },
});
