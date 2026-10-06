/**
 * THE TERRITORY NETWORK — Bengal → Kolkata → zone → territory, as one game world.
 *
 * The map itself is a MapLibre page (engine/) in a WebView / iframe; this screen is the HUD and
 * the conductor: it feeds the engine GeoJSON when what's drawn changes, turns taps into
 * selections, plays the game moments, and keeps your position (your own device's, never shared;
 * a labelled preview position when there's no GPS fix in Bengal).
 *
 * Re-render budget: this component does NOT subscribe to the whole world. The engine gets new
 * data on `useMapVersion` bumps (owner / status / level / discovery changes), and the panel,
 * strip and ticker subscribe to just what they show.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { ErrorState } from '@/components/campus/States';
import { useApp } from '@/state/AppState';
import { startLocationWatch, useLocation } from '@/state/locationStore';
import { darkColors } from '@/theme';
import { crewOf, MY_CREW_ID } from './data/crews';
import { PLACES, VIEWS } from './data/world';
import { cityFeatures, colorOfCrew, corridorFeatures, geoFeatures, particleFeatures, placeFeatures, territoryFeatures } from './engine/features';
import type { EngineMessage, Padding } from './engine/protocol';
import { regionTitle, territoryAt, type RegionTitle } from './logic/camera';
import type { SearchResult } from './logic/search';
import type { WorldActionKind } from './source/preview';
import { clearAlert, discover, getTerritory, getWorld, onActivityPing, perform, startWorldActivity, useAlert, useDiscovered, useMapVersion, useMoment } from './state/worldStore';
import type { LngLat, Territory } from './types';
import { WorldCanvas, type WorldCanvasHandle } from './components/WorldCanvas';
import { Controls, HereStrip, IntroCaption, Peek, PreviewNote, Ticker, TopHud, WorldSearch, type ControlAction } from './components/WorldChrome';
import { TerritoryPanel } from './components/TerritoryPanel';
import { BattleBanner, WorldMoment } from './components/WorldMoments';

/** Where "you" are when there's no GPS fix inside Bengal: Coffee House, College Street. Labelled. */
const PREVIEW_POSITION: LngLat = [88.3644, 22.5768];
const inBengal = (p: LngLat) => p[0] > 85.8 && p[0] < 89.95 && p[1] > 21.4 && p[1] < 27.3;

let introPlayed = false;

export function WorldScreen({ onOpenCampus }: { onOpenCampus: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const { toast } = useApp();
  const canvas = useRef<WorldCanvasHandle>(null);
  const send = useCallback((m: Parameters<WorldCanvasHandle['send']>[0]) => canvas.current?.send(m), []);

  const mapVersion = useMapVersion();
  const discovered = useDiscovered();
  const moment = useMoment();
  const alert = useAlert();
  const loc = useLocation();

  const [engineReady, setEngineReady] = useState(false);
  const [detail, setDetail] = useState(false);
  const [tiles, setTiles] = useState(true);
  const [offline, setOffline] = useState(false);
  const [engineKey, setEngineKey] = useState(0);
  const [region, setRegion] = useState<RegionTitle>({ title: 'West Bengal', crumbs: ['India'], level: 'bengal' });
  const [selected, setSelected] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ id: string; x: number; y: number } | null>(null);
  const [heat, setHeat] = useState(false);
  const [intro, setIntro] = useState(!introPlayed);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(false);
  const [searching, setSearching] = useState(false);
  const cam = useRef({ center: VIEWS.kolkata.center as LngLat, zoom: 6 });
  const revealUntil = useRef(0);

  // ---- layout
  const tabH = 64 + Math.max(insets.bottom, 10);
  const top = insets.top + 8;
  const searchTop = top + 62;
  const stripBottom = tabH + 10;
  const panelOpen = !!selected;
  const sheetH = Math.min(height * 0.54, 480);

  // ---- you
  const real = loc.position ? ([loc.position[1], loc.position[0]] as LngLat) : null;
  const usingReal = !!real && inBengal(real);
  const me: LngLat = usingReal ? real! : PREVIEW_POSITION;
  const meKey = `${me[0].toFixed(5)},${me[1].toFixed(5)}`;
  const hereId = useMemo(() => territoryAt(getWorld(), me, 20).territory?.id ?? null, [meKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const here = getTerritory(hereId);
  const meState: 'idle' | 'active' | 'battle' = here && (here.state.status === 'contested' || here.state.status === 'under_attack') ? 'battle' : 'idle';

  // Walking into uncharted ground (with a real fix) discovers it.
  useEffect(() => {
    if (!usingReal || !hereId) return;
    const t = getTerritory(hereId);
    if (t?.parentId && !discovered.has(t.parentId)) discover(t.parentId);
    if (!discovered.has(hereId)) discover(hereId);
  }, [usingReal, hereId, discovered]);

  // Map on screen: GPS watch, the living city, and the engine's animation loop.
  useFocusEffect(
    useCallback(() => {
      const stopLoc = startLocationWatch();
      const stopLive = startWorldActivity();
      send({ type: 'active', on: true });
      return () => {
        stopLoc();
        stopLive();
        send({ type: 'active', on: false });
      };
    }, [send]),
  );

  useEffect(() => {
    if (!intro) return;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) setIntro(false);
    });
  }, [intro]);

  // ---- engine data
  const discoveredRef = useRef(discovered);
  const detailRef = useRef(detail);
  useLayoutEffect(() => {
    discoveredRef.current = discovered;
    detailRef.current = detail;
  });
  const sendTerritories = useCallback(() => {
    const world = getWorld();
    const found = discoveredRef.current;
    send({ type: 'terr', ...territoryFeatures(world, found, detailRef.current) });
    if (detailRef.current) send({ type: 'particles', particles: particleFeatures(world, found) });
  }, [send]);

  useEffect(() => {
    if (!engineReady) return;
    // Let a discovery's fog burn off on the map before the territory is redrawn as charted.
    const wait = revealUntil.current - Date.now();
    if (wait > 0) {
      const t = setTimeout(sendTerritories, wait);
      return () => clearTimeout(t);
    }
    sendTerritories();
  }, [engineReady, mapVersion, discovered, detail, sendTerritories]);

  useEffect(() => {
    if (engineReady) send({ type: 'me', pos: me, accuracy: usingReal ? loc.accuracy_m ?? 25 : 40, heading: null, state: meState, preview: !usingReal });
  }, [engineReady, meKey, usingReal, loc.accuracy_m, meState, send]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => send({ type: 'select', id: selected }), [selected, send]);
  useEffect(() => send({ type: 'heat', on: heat }), [heat, send]);
  useEffect(() => {
    // Keep MapLibre's attribution clear of the HUD, and tell the engine which part of the map is
    // actually visible, so "where am I looking" ignores what's under the sheet.
    if (!engineReady) return;
    const sheetOpen = !!selected && !desktop;
    send({ type: 'insets', top: searchTop + 54, right: desktop && selected ? 412 : 8, focusTop: top + 64, focusBottom: sheetOpen ? sheetH + tabH : tabH });
  }, [engineReady, searchTop, top, selected, desktop, sheetH, tabH, send]);

  // Game moments → map effects.
  useEffect(() => {
    if (!moment) return;
    const t = getTerritory(moment.territoryId);
    if (!t) return;
    if (moment.kind === 'discover') revealUntil.current = Date.now() + 1300;
    send({ type: 'fx', kind: moment.kind, id: moment.territoryId, color: moment.kind === 'discover' ? '#EDE6D6' : colorOfCrew('crewId' in moment ? moment.crewId : MY_CREW_ID) });
  }, [moment, send]);

  // Ambient activity → ripples on the map (only when the city is in view).
  useEffect(
    () =>
      onActivityPing((item) => {
        if (cam.current.zoom < 10) return;
        const t = getTerritory(item.territoryId);
        if (t) send({ type: 'ping', pos: t.centroid, color: colorOfCrew(item.crewId) });
      }),
    [send],
  );

  // ---- camera helpers
  const sheetPadding = useCallback((): Padding => (desktop ? { top: 120, bottom: tabH + 40, left: 60, right: 440 } : { top: top + 78, bottom: sheetH + tabH + 8, left: 36, right: 36 }), [desktop, tabH, top, sheetH]);

  const focusTerritory = useCallback(
    (t: Territory, force = false) => {
      const z = cam.current.zoom;
      if (force || z < 12.5 || t.tier === 4) send({ type: 'fit', bbox: t.bbox, padding: sheetPadding(), maxZoom: t.tier === 5 ? 16.4 : t.split ? 14.1 : 14.8, pitch: t.tier === 5 ? 48 : 32, duration: 1200 });
      else send({ type: 'fly', view: { center: t.centroid, zoom: Math.max(z, 14.6) }, padding: sheetPadding(), duration: 700 });
    },
    [send, sheetPadding],
  );

  const select = useCallback(
    (id: string, fly = true) => {
      const t = getTerritory(id);
      if (!t) return;
      setPeek(null);
      setSelected(id);
      if (fly) focusTerritory(t);
    },
    [focusTerritory],
  );

  // ---- engine → app
  const onEngine = useRef<(m: EngineMessage) => void>(() => {});
  const engineHandler = (m: EngineMessage) => {
    switch (m.type) {
      case 'ready': {
        const world = getWorld();
        send({
          type: 'init',
          intro,
          view: VIEWS.kolkata,
          geo: geoFeatures(),
          ...territoryFeatures(world, discoveredRef.current, false),
          cities: cityFeatures(world),
          ...placeFeatures(),
          corridors: corridorFeatures(),
        });
        setEngineReady(true);
        if (intro) introPlayed = true;
        break;
      }
      case 'loaded':
        setTiles(m.tiles);
        break;
      case 'camera': {
        cam.current = { center: m.center, zoom: m.zoom };
        const next = regionTitle(getWorld(), m.center, m.zoom);
        setRegion((r) => (r.title === next.title && r.crumbs.join() === next.crumbs.join() ? r : next));
        break;
      }
      case 'needDetail':
        setDetail(true);
        break;
      case 'tap':
        if (m.kind === 'city') {
          send({ type: 'fly', view: m.id === 'kolkata' ? VIEWS.kolkata : { center: m.lngLat, zoom: 11, pitch: 20 }, duration: 1800 });
        } else if (m.kind === 'place') {
          const p = PLACES.find((x) => x.id === m.id);
          if (!p) break;
          const at: LngLat = [p.at[1], p.at[0]];
          const t = territoryAt(getWorld(), at, 20).territory;
          if (t) select(t.id, false);
          send({ type: 'fly', view: { center: at, zoom: Math.max(cam.current.zoom, 15) }, padding: sheetPadding(), duration: 900 });
          toast(`${p.name}${p.accuracy === 'approximate' ? ' · approx. location' : ''}`, 'map-marker-star-outline', darkColors.gold);
        } else if (m.id) select(m.id);
        else setSelected(null);
        break;
      case 'longpress':
        if (m.id) setPeek({ id: m.id, x: m.x, y: m.y });
        break;
      case 'introDone':
        setIntro(false);
        send({ type: 'me', pos: me, accuracy: usingReal ? loc.accuracy_m ?? 25 : 40, heading: null, state: meState, preview: !usingReal, announce: true });
        break;
      case 'error':
        if (m.detail === 'maplibre_unavailable') setOffline(true);
        else if (__DEV__) console.warn('[world map]', m.detail);
        break;
    }
  };
  useLayoutEffect(() => {
    onEngine.current = engineHandler;
  });
  const handleEngine = useCallback((m: EngineMessage) => onEngine.current(m), []);

  // ---- HUD actions
  const onControl = useCallback(
    (a: ControlAction) => {
      switch (a) {
        case 'locate':
          if (!usingReal) toast(loc.position ? 'You’re outside Bengal — showing the preview position at College Street' : 'No GPS fix — showing the preview position at College Street', 'crosshairs-question', darkColors.gold);
          send({ type: 'fly', view: { center: me, zoom: 15.6, pitch: 50 }, duration: 1500 });
          send({ type: 'me', pos: me, accuracy: usingReal ? loc.accuracy_m ?? 25 : 40, heading: null, state: meState, preview: !usingReal, announce: true });
          break;
        case 'home':
          if (hereId) select(hereId);
          break;
        case 'kolkata':
          setSelected(null);
          send({ type: 'fly', view: VIEWS.kolkata, duration: 1800 });
          break;
        case 'bengal':
          setSelected(null);
          send({ type: 'fly', view: VIEWS.bengal, duration: 2200 });
          break;
        case 'heat':
          setHeat((h) => !h);
          break;
        case 'campus':
          onOpenCampus();
          break;
      }
    },
    [usingReal, loc.position, loc.accuracy_m, me, meState, hereId, select, send, toast, onOpenCampus],
  );

  const onSearch = useCallback(
    (r: SearchResult) => {
      if (r.territoryId) {
        select(r.territoryId, false);
        const t = getTerritory(r.territoryId)!;
        focusTerritory(t, true);
      } else if (r.crewId) {
        const crew = crewOf(r.crewId);
        const best = getWorld()
          .filter((t) => t.state.ownerCrewId === r.crewId && t.state.status !== 'locked')
          .sort((a, b) => b.state.xp - a.state.xp)[0];
        if (best) select(best.id);
        if (crew) toast(`${crew.name} · ${crew.members} members · “${crew.motto}”`, 'shield-account-outline', crew.color);
      } else if (r.target) {
        setSelected(null);
        send({ type: 'fly', view: { center: r.target.center, zoom: r.target.zoom, pitch: r.target.zoom > 13 ? 40 : 0 }, duration: 1700 });
      }
    },
    [select, focusTerritory, send, toast],
  );

  const onAction = useCallback(
    async (kind: WorldActionKind) => {
      if (!selected || busy) return;
      setBusy(true);
      try {
        await perform(selected, kind);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'That move didn’t go through', 'alert-circle-outline', darkColors.coral);
      } finally {
        setBusy(false);
      }
    },
    [selected, busy, toast],
  );

  const onEnter = useCallback((t: Territory) => send({ type: 'fit', bbox: t.bbox, padding: sheetPadding(), maxZoom: 15.2, pitch: 45, duration: 1300 }), [send, sheetPadding]);

  // Android back closes the panel first.
  useEffect(() => {
    if (!selected) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      return true;
    });
    return () => sub.remove();
  }, [selected]);

  const skipIntro = useCallback(() => {
    setIntro(false);
    send({ type: 'fly', view: VIEWS.kolkata, duration: 700 });
  }, [send]);

  const territoriesTotal = useMemo(() => getWorld().filter((t) => !t.split).length, []);
  const showBottomChrome = !intro && !(panelOpen && !desktop) && !searching;
  // At state / metro zoom the HUD steps back: "you're in…" and the ticker are street-level news.
  const cityLevel = region.level !== 'bengal' && region.level !== 'metro';
  const peekTerritory = peek ? getTerritory(peek.id) : undefined;

  return (
    <View style={styles.root}>
      <WorldCanvas key={engineKey} ref={canvas} onMessage={handleEngine} style={StyleSheet.absoluteFill} />
      {/* A dark fall-off behind the top HUD so map labels never fight it. */}
      <LinearGradient pointerEvents="none" colors={['rgba(6,7,10,0.92)', 'rgba(6,7,10,0.55)', 'rgba(6,7,10,0)']} locations={[0, 0.55, 1]} style={[styles.scrim, { height: top + 130 }]} />

      <TopHud region={region} top={top} desktop={desktop} onPreviewInfo={() => setNote(true)} />
      {!intro && !(panelOpen && !desktop) && <WorldSearch top={searchTop} left={12} width={desktop ? 380 : undefined} onPick={onSearch} onFocusChange={setSearching} />}

      {showBottomChrome && (
        <>
          <Controls bottom={stripBottom} right={desktop && panelOpen ? 412 : 12} heat={heat} onAction={onControl} />
          <View style={desktop ? styles.desktopStrip : StyleSheet.absoluteFill} pointerEvents="box-none">
            {cityLevel && <Ticker bottom={stripBottom + 64} onOpen={(id) => select(id)} />}
            {cityLevel && <HereStrip id={hereId} preview={!usingReal} bottom={stripBottom} onOpen={(id) => select(id)} />}
          </View>
        </>
      )}

      {intro && <IntroCaption bottom={tabH + 28} territories={territoriesTotal} onSkip={skipIntro} />}

      {selected && <TerritoryPanel key={selected} id={selected} desktop={desktop} bottom={desktop ? tabH + 16 : tabH + 6} top={searchTop + 58} busy={busy} onClose={() => setSelected(null)} onAction={onAction} onSelect={(id) => select(id)} onEnter={onEnter} />}

      {alert && !panelOpen && !intro && (
        <BattleBanner
          key={alert.id}
          id={alert.territoryId}
          top={searchTop + 56}
          onDone={clearAlert}
          onOpen={() => {
            clearAlert();
            select(alert.territoryId);
          }}
        />
      )}
      {moment && <WorldMoment m={moment} top={searchTop + 56} />}
      {peek && peekTerritory && <Peek t={peekTerritory} x={peek.x} y={peek.y} onOpen={() => select(peek.id)} onClose={() => setPeek(null)} />}
      {note && <PreviewNote tiles={tiles} onClose={() => setNote(false)} />}
      {offline && <OfflineNotice onRetry={() => { setOffline(false); setEngineKey((k) => k + 1); }} />}
    </View>
  );
}

/** MapLibre itself didn't load (offline on first open): say so over the dark canvas. */
function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
      <ErrorState title="The map couldn’t load" cause={new ApiError(0, 'The map needs a connection the first time it opens.')} onRetry={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#06070A' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0 },
  desktopStrip: { position: 'absolute', left: 0, bottom: 0, width: 470, top: 0 },
});

