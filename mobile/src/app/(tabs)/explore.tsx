/**
 * MAP — Squirrel Social's persistent social world. See the campus, its territories, points of
 * interest and the Squirrels around you; tap someone → card → POKE 👋. Everything shown (who
 * appears, where roughly, who holds what, relationship state) comes from the backend.
 */
import { DEFAULT_HEAT_WINDOW, featureUnavailable } from '@/api/campus';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/art/Mascot';
import type { Heatmap, HeatWindow, MapPlayer, Zone } from '@/api/campus/types';
import { getHeatmap } from '@/api/campus/discovery';
import { ErrorState } from '@/components/campus/States';
import { relationOf } from '@/components/campus/territoryUi';
import { EmptyNearby, MapBanner, MapHeader, MapSheet, NearbyUsersSheet, PlayerSheet, PoiSheet, TerritorySheet } from '@/components/map/MapChrome';
import { inPolygon, makeProjection } from '@/components/map/geometry';
import { WorldMap, type WorldMapHandle } from '@/components/map/WorldMap';
import { HeatPanel } from '@/components/map/HeatPanel';
import { Icon, NATIVE, tap } from '@/components/ui';
import { useCampus, useConfig, useMe, useRefreshOnFocus, useTerritorySync } from '@/hooks/useCampus';
import { useMapWorld, useNearbyPlayers } from '@/hooks/useMap';
import { requestLocation, setPresenceReporting, startLocationWatch, useLocation } from '@/state/locationStore';
import { useAllTerritories } from '@/state/territoryStore';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, mapColors, radius } from '@/theme';

type Sheet = { kind: 'player'; player: MapPlayer } | { kind: 'zone'; zone: Zone } | { kind: 'poi'; id: string } | { kind: 'list'; players: MapPlayer[]; title: string } | null;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { toast } = useApp();
  const me = useMe();
  const config = useConfig();
  const world = useMapWorld();
  const sync = useTerritorySync();
  const players = useNearbyPlayers();
  const territories = useAllTerritories();
  const mapRef = useRef<WorldMapHandle>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Map → Heat: an optional layer; fetched only while it's on.
  const [heatOn, setHeatOn] = useState(false);
  const [heatWindow, setHeatWindow] = useState<HeatWindow>(DEFAULT_HEAT_WINDOW);
  const heat = useCampus<Heatmap>(`map:heat:${heatWindow}`, () => getHeatmap(heatWindow), { enabled: heatOn });
  useRefreshOnFocus(heat.reload, 60_000);
  const meId = me.data?.user_id ?? null;

  // Your location: watched only while the Map is on screen; presence reported (throttled) for discovery.
  useFocusEffect(
    useCallback(() => {
      const stop = startLocationWatch();
      setPresenceReporting(true);
      return () => {
        setPresenceReporting(false);
        stop();
      };
    }, []),
  );

  const zones = useMemo(() => world.data?.zones ?? [], [world.data]);
  const features = world.data?.features ?? null;
  const list = useMemo(() => players.data?.players ?? [], [players.data]);
  const zonesHeld = useMemo(() => territories.filter((t) => relationOf(t, meId) === 'mine').length, [territories, meId]);

  const onPlayer = useCallback(
    (id: string) => {
      const p = players.data?.players.find((x) => x.user_id === id);
      if (p) setSheet({ kind: 'player', player: p });
    },
    [players.data],
  );
  const onZone = useCallback(
    (id: string) => {
      const z = world.data?.zones.find((x) => x.id === id);
      if (z) setSheet({ kind: 'zone', zone: z });
    },
    [world.data],
  );
  const onPoi = useCallback((id: string) => setSheet({ kind: 'poi', id }), []);
  const onCluster = useCallback((ps: MapPlayer[]) => setSheet({ kind: 'list', players: ps, title: `${ps.length} Squirrels here` }), []);

  const tabH = 64 + Math.max(insets.bottom, 10);
  const headerTop = insets.top + 8;
  const loaded = !!players.data;
  const showEmpty = loaded && list.length === 0 && !sheet && !heatOn;
  const showHeat = heatOn && !sheet;
  const poi = sheet?.kind === 'poi' ? features?.pois.find((p) => p.id === sheet.id) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: mapColors.bg }}>
      {world.data ? (
        <WorldMap
          ref={mapRef}
          zones={zones}
          features={features}
          meId={meId}
          me="watch"
          players={list}
          pois={features?.pois}
          selectedZoneId={sheet?.kind === 'zone' ? sheet.zone.id : null}
          selectedPlayerId={sheet?.kind === 'player' ? sheet.player.user_id : null}
          onSelectPlayer={onPlayer}
          onSelectZone={onZone}
          onSelectPoi={onPoi}
          onSelectCluster={onCluster}
          heat={heatOn && heat.data?.available ? heat.data.cells : null}
          controlsInset={{ bottom: tabH + 56 + (showEmpty ? 84 : 0) + (showHeat ? 118 : 0) }}
          style={styles.map}
        />
      ) : world.error ? (
        <View style={[styles.center, { paddingTop: headerTop + 80 }]}>
          <ErrorState cause={world.cause} onRetry={world.reload} title="The map didn’t load" />
        </View>
      ) : (
        <MapLoading />
      )}

      <LiveHeader zones={zones} campus={world.data?.source === 'base' ? 'IISER Kolkata · approx. map' : config.data?.campus.name ?? 'Your campus'} zonesHeld={world.data?.source === 'live' && !sync.error ? zonesHeld : null} top={headerTop} />

      {/* Status banners: they never block or wipe the map */}
      <View style={[styles.banners, { top: headerTop + 64 }]} pointerEvents="box-none">
        {/* One banner at a time, most important first, so the map stays visible. */}
        {/* "Not live yet" isn't an error: no red banner for it. */}
        {players.error && !featureUnavailable(players.cause) ? (
          <MapBanner icon="wifi-off" tone="error" text={loaded ? 'Couldn’t refresh nearby Squirrels. Showing the last update.' : 'Couldn’t load nearby Squirrels.'} action="Retry" onAction={players.reload} />
        ) : sync.error && !featureUnavailable(sync.error) ? (
          <MapBanner icon="flag-remove-outline" tone="error" text="Territories didn’t refresh." action="Retry" onAction={sync.reload} />
        ) : (
          <LocationBanner
            fallback={
              players.data && !players.data.visible && !!players.data.hidden_reason ? (
                <MapBanner icon="eye-off-outline" tone="info" text={players.data.hidden_reason} action="Settings" onAction={() => router.push('/active')} />
              ) : world.data?.source === 'base' ? (
                <MapBanner icon="map-outline" tone="info" text="IISER Kolkata · approximate map. Live zones, owners and people switch on with the campus backend." />
              ) : null
            }
          />
        )}
      </View>

      {world.data && (
        <View style={[styles.controls, { bottom: tabH + 12 }]} pointerEvents="box-none">
          <Pressable
            onPress={() => {
              tap();
              setSheet({ kind: 'list', players: list, title: `${list.length} Squirrels nearby` });
            }}
            style={styles.nearby}
            accessibilityRole="button"
            accessibilityLabel={`${list.length} Squirrels nearby. Open list`}>
            <Text style={styles.nearbyEmoji} accessibilityElementsHidden>🐿️</Text>
            <Text style={styles.nearbyText}>{loaded ? `${list.length} nearby` : players.error && featureUnavailable(players.cause) ? 'Not live yet' : players.error ? 'Offline' : 'Finding…'}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => {
              tap();
              setHeatOn((v) => !v);
            }}
            style={[styles.recenter, { marginRight: 8 }, heatOn && { borderColor: colors.secondary, backgroundColor: alpha(colors.secondary, 0.12) }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: heatOn }}
            accessibilityLabel="Activity heatmap">
            <Icon name="fire" size={20} color={heatOn ? colors.secondary : colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              tap();
              if (!mapRef.current?.recenter()) toast('No location yet — allow location to recenter', 'crosshairs-question', colors.gold);
            }}
            style={styles.recenter}
            accessibilityRole="button"
            accessibilityLabel="Recenter on me">
            <Icon name="crosshairs-gps" size={20} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {showHeat && (
        <View style={[styles.emptyWrap, { bottom: tabH + 64 }]}>
          <HeatPanel window={heatWindow} onWindow={setHeatWindow} data={heat.data} loading={heat.loading} error={heat.error ? heat.cause : null} onRetry={heat.reload} onClose={() => setHeatOn(false)} />
        </View>
      )}

      {showEmpty && (
        <View style={[styles.emptyWrap, { bottom: tabH + 64 }]}>
          <EmptyNearby onWalk={() => router.push({ pathname: '/run', params: { type: 'walk' } })} />
        </View>
      )}

      {sheet && (
        <MapSheet
          key={sheet.kind === 'player' ? sheet.player.user_id : sheet.kind === 'zone' ? sheet.zone.id : sheet.kind === 'poi' ? sheet.id : 'list'}
          bottom={tabH + 4}
          onClose={() => setSheet(null)}
          label={sheet.kind === 'player' ? `${sheet.player.display_name} card` : sheet.kind === 'zone' ? `${sheet.zone.name} territory` : sheet.kind === 'poi' ? 'Point of interest' : 'Nearby Squirrels'}>
          {sheet.kind === 'player' && <PlayerSheet player={sheet.player} />}
          {sheet.kind === 'zone' && <TerritorySheet zone={sheet.zone} meId={meId} baseMap={world.data?.source === 'base'} />}
          {sheet.kind === 'poi' && poi && <PoiSheet poi={poi} zones={zones} />}
          {sheet.kind === 'list' && <NearbyUsersSheet players={sheet.players} title={sheet.title} />}
        </MapSheet>
      )}
    </View>
  );
}

/** The header subscribes to your location itself, so GPS updates don't re-render the screen. */
function LiveHeader({ zones, campus, zonesHeld, top }: { zones: Zone[]; campus: string; zonesHeld: number | null; top: number }) {
  const loc = useLocation();
  const proj = useMemo(() => makeProjection(zones), [zones]);
  const where = useMemo(() => {
    if (!loc.position || !proj) return null;
    const p = proj.project(loc.position);
    const z = zones.find((zz) => inPolygon(p, zz.polygon.map((q) => proj.project(q))));
    return z ? `Near ${z.name}` : 'On campus';
  }, [loc.position, proj, zones]);
  // Location known but no campus geometry to place it in: just "On campus?" would be a guess.
  const place = where ?? (loc.position ? 'Location on' : loc.permission === 'checking' ? 'Finding you…' : null);
  return <MapHeader campus={campus} where={place} zonesHeld={zonesHeld} top={top} />;
}

function LocationBanner({ fallback }: { fallback: React.ReactNode }) {
  const loc = useLocation();
  if (loc.permission === 'granted' || loc.permission === 'checking') return <>{fallback}</>;
  const text =
    loc.permission === 'services_off'
      ? 'Location services are off. Nearby discovery needs your location.'
      : loc.permission === 'unsupported'
        ? 'Nearby discovery needs the phone app’s GPS.'
        : 'Location permission is needed for nearby discovery. Others only ever see an approximate area.';
  const action = loc.permission === 'blocked' || loc.permission === 'services_off' ? 'Settings' : loc.permission === 'unsupported' ? undefined : 'Allow';
  return <MapBanner icon="map-marker-off-outline" tone="warn" text={text} action={action} onAction={action === 'Settings' ? () => void Linking.openSettings() : () => void requestLocation()} />;
}

/** Loading: the world "develops" while the wingman scouts. */
function MapLoading() {
  const [v] = useState(() => new Animated.Value(0));
  useFocusEffect(
    useCallback(() => {
      const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }));
      loop.start();
      return () => loop.stop();
    }, [v]),
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} accessibilityLabel="Loading the map" accessibilityRole="progressbar">
      <Animated.View style={[styles.scan, { opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.6, 0] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-240, 240] }) }] }]} />
      <Mascot pose="run" size={110} animated />
      <Text style={styles.loadingText}>Loading your world…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFill, borderRadius: 0, borderWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  banners: { position: 'absolute', left: 12, right: 12, gap: 6 },
  controls: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center' },
  nearby: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: alpha(colors.panel, 0.93), borderRadius: radius.pill, borderWidth: 1, borderColor: alpha(colors.primary, 0.4), paddingHorizontal: 14, paddingVertical: 9 },
  nearbyEmoji: { fontSize: 15 },
  nearbyText: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
  recenter: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.panel, 0.94), borderWidth: 1, borderColor: colors.lineHi },
  emptyWrap: { position: 'absolute', left: 12, right: 12 },
  scan: { position: 'absolute', left: 0, right: 0, height: 90, backgroundColor: alpha(colors.primary, 0.06) },
  loadingText: { color: colors.dim, fontFamily: fonts.label, fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 10 },
});
