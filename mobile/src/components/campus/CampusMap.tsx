/**
 * Interactive campus map: fixed zones drawn from their real polygons, coloured by territory
 * state, with your own route/location on top. Performance notes:
 *   - geometry is projected once per zone list (useMemo), not per render
 *   - every zone is a memoised <ZoneShape> subscribed to its OWN territory in the store,
 *     so one ownership change repaints one polygon
 *   - pan/zoom is an Animated transform on the wrapper (native driver where available),
 *     so gestures never re-render the SVG
 * No base-map tiles (that would need a native maps dependency / development build); the
 * zones themselves are the map.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { LatLng, Zone } from '@/api/campus';
import { Icon, NATIVE, tap } from '@/components/ui';
import { RELATION_COLOR, relationOf, UNDER_ATTACK } from '@/components/campus/territoryUi';
import { useTerritory } from '@/state/territoryStore';
import { colors, fonts, radius } from '@/theme';

type Projection = { project: (p: LatLng) => [number, number]; width: number; height: number };

const PAD = 60; // metres around the outermost zone

/** Equirectangular projection around the zones' centre → SVG units (1 unit = 1 m). */
export function makeProjection(zones: Zone[]): Projection | null {
  const pts = zones.flatMap((z) => z.polygon);
  if (!pts.length) return null;
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[1] * mLng);
  const ys = pts.map((p) => p[0] * mLat);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;
  return {
    project: (p) => [p[1] * mLng - minX, maxY - p[0] * mLat],
    width: maxX - minX,
    height: maxY - minY,
  };
}

type ZoneShapeProps = { zone: Zone; points: string; label: [number, number]; selected: boolean; meId: string | null; fontSize: number; onSelect: (id: string) => void };

const ZoneShape = memo(function ZoneShape({ zone, points, label, selected, meId, fontSize, onSelect }: ZoneShapeProps) {
  const t = useTerritory(zone.id);
  const rel = relationOf(t, meId);
  const c = RELATION_COLOR[rel];
  const attacked = !!t?.under_challenge;
  const status = rel === 'mine' ? 'YOURS' : rel === 'other' ? (t?.owner?.display_name.split(' ')[0] ?? '').toUpperCase() : rel === 'unclaimed' ? 'UNCLAIMED' : '';
  const press = () => {
    tap();
    onSelect(zone.id);
  };
  return (
    <G onPress={press} accessibilityLabel={`${zone.name}, ${status || 'loading'}`}>
      <Polygon
        points={points}
        fill={c}
        fillOpacity={selected ? 0.42 : rel === 'unclaimed' ? 0.1 : 0.24}
        stroke={attacked ? UNDER_ATTACK : c}
        strokeWidth={selected ? 7 : attacked ? 5 : 3}
        strokeDasharray={rel === 'unclaimed' ? '14 10' : attacked ? '18 8' : undefined}
        strokeLinejoin="round"
      />
      <SvgText x={label[0]} y={label[1] - fontSize * 0.2} fill={colors.text} fontSize={fontSize} fontFamily={fonts.labelBold} fontWeight="700" textAnchor="middle">
        {(zone.short_name ?? zone.name).toUpperCase()}
      </SvgText>
      {!!status && (
        <SvgText x={label[0]} y={label[1] + fontSize * 0.95} fill={attacked ? UNDER_ATTACK : c} fontSize={fontSize * 0.72} fontFamily={fonts.label} textAnchor="middle">
          {attacked ? `⚔ ${status}` : status}
        </SvgText>
      )}
    </G>
  );
});

export type CampusMapProps = {
  zones: Zone[];
  meId: string | null;
  selectedId?: string | null;
  onSelect?: (zoneId: string) => void;
  /** Your own route (never anyone else's). */
  route?: LatLng[];
  /** Your own position. */
  me?: LatLng | null;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Highlight these zones (e.g. zones touched by a run). */
  highlight?: string[];
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * Pinch / pan state machine, kept outside React so gestures never cause renders. Taps go to
 * the zones; only a pinch, or a drag once zoomed in, takes over — so at 1× the page's
 * ScrollView keeps its vertical scroll.
 */
class PanZoom {
  scale = new Animated.Value(1);
  tx = new Animated.Value(0);
  ty = new Animated.Value(0);
  private cur = { s: 1, x: 0, y: 0 };
  private start = { s: 1, x: 0, y: 0, dist: 0 };
  private box = { w: 0, h: 0 };
  private interactive = true;

  setBox(w: number, h: number) {
    this.box = { w, h };
  }
  setInteractive(v: boolean) {
    this.interactive = v;
  }
  private static dist(e: GestureResponderEvent) {
    const t = e.nativeEvent.touches;
    return t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
  }
  apply(s: number, x: number, y: number, animate = false) {
    const maxX = ((s - 1) * this.box.w) / 2;
    const maxY = ((s - 1) * this.box.h) / 2;
    const c = { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
    this.cur = { s, x: c.x, y: c.y };
    if (animate) {
      Animated.parallel([
        Animated.spring(this.scale, { toValue: s, useNativeDriver: NATIVE, speed: 18, bounciness: 4 }),
        Animated.spring(this.tx, { toValue: c.x, useNativeDriver: NATIVE, speed: 18, bounciness: 4 }),
        Animated.spring(this.ty, { toValue: c.y, useNativeDriver: NATIVE, speed: 18, bounciness: 4 }),
      ]).start();
    } else {
      this.scale.setValue(s);
      this.tx.setValue(c.x);
      this.ty.setValue(c.y);
    }
  }
  zoomBy(f: number) {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.cur.s * f));
    this.apply(s, this.cur.x * (s / this.cur.s), this.cur.y * (s / this.cur.s), true);
  }
  reset() {
    this.apply(1, 0, 0, true);
  }
  responder = PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) => this.interactive && (e.nativeEvent.touches.length >= 2 || (this.cur.s > 1 && Math.abs(g.dx) + Math.abs(g.dy) > 6)),
    onPanResponderGrant: (e) => {
      this.start = { ...this.cur, dist: PanZoom.dist(e) };
    },
    onPanResponderMove: (e, g) => {
      const d = PanZoom.dist(e);
      if (d && this.start.dist) {
        this.apply(Math.max(MIN_SCALE, Math.min(MAX_SCALE, (this.start.s * d) / this.start.dist)), this.start.x, this.start.y);
      } else if (d && !this.start.dist) {
        this.start = { ...this.cur, dist: d };
      } else {
        this.apply(this.cur.s, this.start.x + g.dx, this.start.y + g.dy);
      }
    },
    onPanResponderTerminationRequest: () => true,
  });
}

export function CampusMap({ zones, meId, selectedId = null, onSelect, route, me, interactive = true, style, highlight }: CampusMapProps) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const proj = useMemo(() => makeProjection(zones), [zones]);
  const shapes = useMemo(
    () =>
      proj
        ? zones.map((z) => ({ zone: z, points: z.polygon.map((p) => proj.project(p).map((n) => n.toFixed(1)).join(',')).join(' '), label: proj.project(z.centroid) }))
        : [],
    [zones, proj],
  );
  const routePts = useMemo(() => (proj && route && route.length > 1 ? route.map((p) => proj.project(p).map((n) => n.toFixed(1)).join(',')).join(' ') : null), [route, proj]);
  const meXY = proj && me ? proj.project(me) : null;
  const select = useCallback((id: string) => onSelect?.(id), [onSelect]);
  const fontSize = proj ? Math.max(18, proj.width / 42) : 20;

  // ---- pan / zoom (Animated transform; the SVG never re-renders during a gesture)
  const [pz] = useState(() => new PanZoom());
  useEffect(() => pz.setBox(box.w, box.h), [pz, box]);
  useEffect(() => pz.setInteractive(interactive), [pz, interactive]);
  const zoom = (f: number) => {
    tap();
    pz.zoomBy(f);
  };

  const grid = useMemo(() => {
    if (!proj) return null;
    const lines: React.ReactElement[] = [];
    for (let x = 0; x <= proj.width; x += 100) lines.push(<Line key={`x${x}`} x1={x} y1={0} x2={x} y2={proj.height} stroke={colors.line} strokeWidth={1} opacity={0.6} />);
    for (let y = 0; y <= proj.height; y += 100) lines.push(<Line key={`y${y}`} x1={0} y1={y} x2={proj.width} y2={y} stroke={colors.line} strokeWidth={1} opacity={0.6} />);
    return lines;
  }, [proj]);

  return (
    <View style={[styles.wrap, style]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {proj && box.w > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pz.tx }, { translateY: pz.ty }, { scale: pz.scale }] }]} {...pz.responder.panHandlers}>
          <Svg width={box.w} height={box.h} viewBox={`0 0 ${proj.width.toFixed(0)} ${proj.height.toFixed(0)}`} preserveAspectRatio="xMidYMid meet">
            <Rect x={0} y={0} width={proj.width} height={proj.height} rx={40} fill="#0A0C12" />
            {grid}
            {shapes.map((s) => (
              <ZoneShape key={s.zone.id} zone={s.zone} points={s.points} label={s.label} selected={s.zone.id === selectedId || !!highlight?.includes(s.zone.id)} meId={meId} fontSize={fontSize} onSelect={select} />
            ))}
            {routePts && <Polyline points={routePts} fill="none" stroke={colors.primary} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
            {meXY && (
              <G>
                <Circle cx={meXY[0]} cy={meXY[1]} r={26} fill={colors.blue} opacity={0.25} />
                <Circle cx={meXY[0]} cy={meXY[1]} r={11} fill={colors.blue} stroke={colors.text} strokeWidth={4} />
              </G>
            )}
          </Svg>
        </Animated.View>
      )}
      {interactive && proj && (
        <View style={styles.zoom}>
          <Pressable onPress={() => zoom(1.5)} style={styles.zoomBtn} accessibilityRole="button" accessibilityLabel="Zoom in">
            <Icon name="plus" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => zoom(1 / 1.5)} style={styles.zoomBtn} accessibilityRole="button" accessibilityLabel="Zoom out">
            <Icon name="minus" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => { tap(); pz.reset(); }} style={styles.zoomBtn} accessibilityRole="button" accessibilityLabel="Reset map">
            <Icon name="crosshairs" size={18} color={colors.text} />
          </Pressable>
        </View>
      )}
      <Text style={styles.north} accessibilityElementsHidden>N ↑</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#07080C', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  zoom: { position: 'absolute', right: 10, bottom: 10, gap: 8 },
  zoomBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(17,17,19,0.92)', borderWidth: 1, borderColor: colors.lineHi, alignItems: 'center', justifyContent: 'center' },
  north: { position: 'absolute', left: 12, top: 10, color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1 },
});
