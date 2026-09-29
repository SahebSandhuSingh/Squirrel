/**
 * The Squirrel Social world map: a stylised game world (terrain, roads, buildings), territory
 * overlays coloured by backend state, points of interest, nearby players (clustered), your own
 * marker and route. No map tiles — it's a game board, not Google Maps.
 *
 * Performance: base + territories are SVG and never re-render during gestures (pan/zoom is an
 * Animated transform). Markers are memoised native views that counter-scale; clustering only
 * recomputes when a gesture ends. Your GPS position lives in its own store, so a location
 * update re-renders the "you" marker only.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Polyline, Rect } from 'react-native-svg';
import type { HeatCell, LatLng, MapFeatures, MapPlayer, Poi, Zone } from '@/api/campus/types';
import { Icon, tap } from '@/components/ui';
import { fitOf, makeProjection, pts } from '@/components/map/geometry';
import { BaseLayer, ZoneShape } from '@/components/map/layers';
import { ClusterMarker, CurrentUserMarker, PlayerMarker, PoiMarker } from '@/components/map/markers';
import { HeatLayer } from '@/components/map/HeatLayer';
import { PanZoom } from '@/components/map/PanZoom';
import { getLocationSnapshot, useLocation } from '@/state/locationStore';
import { alpha, colors, fonts, mapColors, radius } from '@/theme';

export type WorldMapHandle = {
  /** Centre on your position; false when there's no position to centre on. */
  recenter: () => boolean;
  reset: () => void;
};

export type WorldMapProps = {
  zones: Zone[];
  features?: MapFeatures | null;
  meId: string | null;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string) => void;
  /** Your own route (run screen). */
  route?: LatLng[];
  /** Your own position: 'watch' uses the shared location store; a LatLng pins it; null hides it. */
  me?: LatLng | 'watch' | null;
  players?: MapPlayer[];
  selectedPlayerId?: string | null;
  onSelectPlayer?: (userId: string) => void;
  /** A cluster the map can't split further (max zoom), or one you want listed. */
  onSelectCluster?: (players: MapPlayer[]) => void;
  pois?: Poi[];
  onSelectPoi?: (poiId: string) => void;
  highlight?: string[];
  /** Aggregated activity cells from the backend (Map → Heat). */
  heat?: HeatCell[] | null;
  interactive?: boolean;
  controls?: boolean;
  /** Space kept free for overlays (header, sheets) when placing the zoom controls. */
  controlsInset?: { top?: number; bottom?: number };
  style?: StyleProp<ViewStyle>;
};

type ClusterItem = { kind: 'player'; player: MapPlayer; x: number; y: number } | { kind: 'cluster'; id: string; players: MapPlayer[]; x: number; y: number };

const CELL_PX = 46; // on-screen cluster cell

export const WorldMap = forwardRef<WorldMapHandle, WorldMapProps>(function WorldMap(props, ref) {
  const { zones, features, meId, selectedZoneId = null, onSelectZone, route, me = null, players, selectedPlayerId = null, onSelectPlayer, onSelectCluster, pois, onSelectPoi, highlight, heat, interactive = true, controls = interactive, controlsInset, style } = props;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pz] = useState(() => new PanZoom());
  const [zoom, setZoom] = useState(1);
  useEffect(() => pz.setBox(box.w, box.h), [pz, box]);
  useEffect(() => pz.setInteractive(interactive), [pz, interactive]);
  useEffect(() => pz.onZoom((s) => setZoom((z) => (Math.abs(z - s) > 0.12 ? s : z))), [pz]);

  const proj = useMemo(() => makeProjection(zones, features), [zones, features]);
  const fit = useMemo(() => (proj && box.w ? fitOf(proj, box.w, box.h) : null), [proj, box]);
  const view = useCallback((p: LatLng) => {
    const [x, y] = proj!.project(p);
    return { x: fit!.ox + x * fit!.k, y: fit!.oy + y * fit!.k };
  }, [proj, fit]);

  const shapes = useMemo(() => (proj ? zones.map((z) => ({ zone: z, points: pts(proj, z.polygon), label: proj.project(z.centroid) })) : []), [zones, proj]);
  const routePts = useMemo(() => (proj && route && route.length > 1 ? pts(proj, route) : null), [route, proj]);
  const fontSize = proj ? Math.max(16, proj.width / 50) : 20;

  // ---- clustering (screen-space grid; recomputed on zoom end / data change only)
  const items = useMemo<ClusterItem[]>(() => {
    if (!fit || !players?.length) return [];
    const cell = CELL_PX / zoom;
    const buckets = new Map<string, { players: MapPlayer[]; x: number; y: number }>();
    for (const p of players) {
      const v = view(p.position);
      const k = `${Math.floor(v.x / cell)}:${Math.floor(v.y / cell)}`;
      const b = buckets.get(k);
      if (b) {
        b.players.push(p);
        b.x += v.x;
        b.y += v.y;
      } else buckets.set(k, { players: [p], x: v.x, y: v.y });
    }
    const out: ClusterItem[] = [];
    for (const [k, b] of buckets) {
      const n = b.players.length;
      if (n >= 3) out.push({ kind: 'cluster', id: k, players: b.players, x: b.x / n, y: b.y / n });
      else
        b.players.forEach((p, i) => {
          const v = view(p.position);
          // Two people in one approximate cell: nudge apart so both are tappable.
          out.push({ kind: 'player', player: p, x: v.x + (n > 1 ? (i ? 7 : -7) / zoom : 0), y: v.y });
        });
    }
    return out;
  }, [players, fit, zoom, view]);
  const clusterById = useMemo(() => new Map(items.filter((i) => i.kind === 'cluster').map((i) => [(i as { id: string }).id, i])), [items]);

  const onCluster = useCallback(
    (id: string) => {
      const c = clusterById.get(id);
      if (!c || c.kind !== 'cluster') return;
      if (pz.zoom < 4.5) pz.centerOn(c.x, c.y, Math.min(5, pz.zoom * 2.2));
      else onSelectCluster?.(c.players);
    },
    [clusterById, pz, onSelectCluster],
  );
  const onPlayer = useCallback((id: string) => onSelectPlayer?.(id), [onSelectPlayer]);
  const onPoi = useCallback((id: string) => onSelectPoi?.(id), [onSelectPoi]);
  const onZone = useCallback((id: string) => onSelectZone?.(id), [onSelectZone]);

  // A pinned position (run screen) is drawn in SVG; 'watch' uses the live store in <MeLayer>
  // so GPS updates re-render that marker only, not the map.
  const mePos = me === 'watch' ? null : me;

  useImperativeHandle(
    ref,
    () => ({
      recenter: () => {
        const p = me === 'watch' ? getLocationSnapshot().position : me;
        if (!p || !fit) return false;
        const v = view(p);
        pz.centerOn(v.x, v.y);
        return true;
      },
      reset: () => pz.reset(),
    }),
    [me, fit, view, pz],
  );

  const showLabels = zoom >= 2;
  return (
    <View style={[styles.wrap, style]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {proj && fit && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pz.tx }, { translateY: pz.ty }, { scale: pz.scale }] }]} {...pz.responder.panHandlers}>
          <Svg width={box.w} height={box.h} viewBox={`0 0 ${proj.width.toFixed(0)} ${proj.height.toFixed(0)}`} preserveAspectRatio="xMidYMid meet">
            <Rect x={0} y={0} width={proj.width} height={proj.height} rx={36} fill={mapColors.ground} />
            {features && <BaseLayer features={features} proj={proj} />}
            {shapes.map((s) => (
              <ZoneShape key={s.zone.id} zone={s.zone} points={s.points} label={s.label} selected={s.zone.id === selectedZoneId || !!highlight?.includes(s.zone.id)} meId={meId} fontSize={fontSize} onSelect={onSelectZone ? onZone : undefined} />
            ))}
            {heat && heat.length > 0 && <HeatLayer cells={heat} proj={proj} />}
            {routePts && <Polyline points={routePts} fill="none" stroke={colors.primary} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
            {mePos && (
              <G>
                <Circle cx={proj.project(mePos)[0]} cy={proj.project(mePos)[1]} r={24} fill={colors.blue} opacity={0.25} />
                <Circle cx={proj.project(mePos)[0]} cy={proj.project(mePos)[1]} r={10} fill={colors.blue} stroke={colors.text} strokeWidth={4} />
              </G>
            )}
          </Svg>
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {pois?.map((p) => {
              const v = view(p.position);
              return <PoiMarker key={p.id} poi={p} pos={v} inverse={pz.inverse} showLabel={showLabels} onPress={onPoi} />;
            })}
            {/* With the heat layer on, people step back so the activity reads */}
            <View style={[StyleSheet.absoluteFill, heat?.length ? { opacity: 0.35 } : null]} pointerEvents="box-none">
            {items.map((it) =>
              it.kind === 'cluster' ? (
                <ClusterMarker key={`c-${it.id}`} id={it.id} count={it.players.length} pos={{ x: it.x, y: it.y }} inverse={pz.inverse} onPress={onCluster} />
              ) : (
                <PlayerMarker key={it.player.user_id} player={it.player} pos={{ x: it.x, y: it.y }} inverse={pz.inverse} selected={it.player.user_id === selectedPlayerId} showLabel={showLabels} onPress={onPlayer} />
              ),
            )}
            </View>
            {me === 'watch' && <MeLayer view={view} k={fit.k} inverse={pz.inverse} />}
          </View>
        </Animated.View>
      )}
      {controls && proj && (
        <View style={[styles.controls, { bottom: (controlsInset?.bottom ?? 0) + 12 }]}>
          <Pressable onPress={() => { tap(); pz.zoomBy(1.6); }} style={styles.btn} accessibilityRole="button" accessibilityLabel="Zoom in">
            <Icon name="plus" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => { tap(); pz.zoomBy(1 / 1.6); }} style={styles.btn} accessibilityRole="button" accessibilityLabel="Zoom out">
            <Icon name="minus" size={20} color={colors.text} />
          </Pressable>
        </View>
      )}
      {!interactive && <Text style={styles.north} accessibilityElementsHidden>N ↑</Text>}
    </View>
  );
});

function MeLayer({ view, k, inverse }: { view: (p: LatLng) => { x: number; y: number }; k: number; inverse: PanZoom['inverse'] }) {
  const loc = useLocation();
  if (!loc.position) return null;
  return <CurrentUserMarker pos={view(loc.position)} accuracyPx={(loc.accuracy_m ?? 20) * k} inverse={inverse} simulated={loc.simulated} />;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: mapColors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  controls: { position: 'absolute', right: 12, gap: 8 },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: alpha(colors.panel, 0.94), borderWidth: 1, borderColor: colors.lineHi, alignItems: 'center', justifyContent: 'center' },
  north: { position: 'absolute', left: 12, top: 10, color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1 },
});
