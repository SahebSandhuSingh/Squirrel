/**
 * SVG layers of the world map: the stylised base (terrain, roads, paths, buildings) and the
 * territory shapes. The base is memoised as a whole; each territory subscribes to its own
 * zone in the store, so an ownership change repaints one polygon.
 */
import { memo } from 'react';
import { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Pattern, Polygon, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { LatLng, MapFeatures, Zone } from '@/api/campus/types';
import { displayStatus, RELATION_COLOR, relationOf, STATUS_UI } from '@/components/campus/territoryUi';
import { tap } from '@/components/ui';
import { inPolygon, type Projection } from '@/components/map/geometry';
import { useTerritory } from '@/state/territoryStore';
import { colors, fonts, mapColors } from '@/theme';

type XY = [number, number];
type Terrain = MapFeatures['terrain'][number];
type Building = MapFeatures['buildings'][number];

const ROOF: Record<string, string> = {
  hostel: mapColors.roofHostel,
  academic: mapColors.roofAcademic,
  food: mapColors.roofFood,
  sports: mapColors.roofSports,
  residential: mapColors.roofHome,
  service: mapColors.roofService,
};

const toStr = (xy: XY[]) => xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const shift = (xy: XY[], dx: number, dy: number): XY[] => xy.map(([x, y]) => [x + dx, y + dy]);
const centerOf = (xy: XY[]): XY => [xy.reduce((a, p) => a + p[0], 0) / xy.length, xy.reduce((a, p) => a + p[1], 0) / xy.length];
const scaleAbout = (xy: XY[], c: XY, k: number): XY[] => xy.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
function bboxOf(xy: XY[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of xy) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
/** Deterministic 0..1 noise, so trees land in the same place on every render. */
const hash = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Trees scattered through woods (dense) and big lawns (sparse), never on roads' worth of edge. */
function treesFor(t: Terrain, xy: XY[]): { x: number; y: number; r: number }[] {
  if (t.kind !== 'woods' && t.kind !== 'green') return [];
  const b = bboxOf(xy);
  const step = t.kind === 'woods' ? 17 : 34;
  if (t.kind === 'green' && b.w * b.h < 12_000) return [];
  const out: { x: number; y: number; r: number }[] = [];
  for (let gx = b.x0 + step / 2; gx < b.x1; gx += step)
    for (let gy = b.y0 + step / 2; gy < b.y1; gy += step) {
      const h1 = hash(gx, gy);
      if (t.kind === 'green' && h1 < 0.55) continue;
      const x = gx + (hash(gy, gx) - 0.5) * step * 0.8;
      const y = gy + (h1 - 0.5) * step * 0.8;
      if (inPolygon([x, y], xy)) out.push({ x, y, r: (t.kind === 'woods' ? 7 : 6) + hash(x, y) * 4 });
    }
  return out;
}

const Caption = ({ x, y, text, size }: { x: number; y: number; text: string; size: number }) => (
  <G>
    <SvgText x={x} y={y} fontSize={size} fontFamily={fonts.label} textAnchor="middle" fill="none" stroke={mapColors.labelHalo} strokeWidth={size * 0.32} strokeLinejoin="round" letterSpacing={size * 0.08}>
      {text.toUpperCase()}
    </SvgText>
    <SvgText x={x} y={y} fontSize={size} fontFamily={fonts.label} textAnchor="middle" fill={mapColors.label} letterSpacing={size * 0.08}>
      {text.toUpperCase()}
    </SvgText>
  </G>
);

/**
 * The stylised campus base: textured ground, lawns with trees, water with ripples, a running
 * track and pitch, courts, plazas, parking, cased roads, footpaths, and 2.5D buildings (shadow,
 * south wall, roof tinted by use). Drawn once and memoised — it never re-renders during pan / zoom.
 */
export const BaseLayer = memo(function BaseLayer({ features, proj }: { features: MapFeatures; proj: Projection }) {
  const P = (list: LatLng[]): XY[] => list.map((p) => proj.project(p));
  const terrain = features.terrain.map((t) => ({ t, xy: P(t.polygon) }));
  const order: Record<string, number> = { woods: 0, green: 1, plaza: 2, parking: 3, water: 4, track: 5, field: 6, court: 7 };
  terrain.sort((a, b) => (order[a.t.kind] ?? 1) - (order[b.t.kind] ?? 1));
  const trees = terrain.flatMap(({ t, xy }) => treesFor(t, xy));
  const roads = features.roads.map((r) => ({ r, s: toStr(P(r.points)) }));
  const buildings = features.buildings
    .map((b: Building) => ({ b, xy: P(b.polygon), h: Math.max(1, b.levels ?? 2) * 3.2 }))
    // Paint back-to-front (north first) so nearer roofs overlap the ones behind.
    .sort((a, b) => bboxOf(a.xy).y1 - bboxOf(b.xy).y1);
  const cap = Math.max(9, proj.width / 95);

  return (
    <G>
      <Defs>
        <Pattern id="groundDots" patternUnits="userSpaceOnUse" width={28} height={28}>
          <Circle cx={4} cy={4} r={1.6} fill={mapColors.groundDot} />
        </Pattern>
        <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mapColors.water} />
          <Stop offset="1" stopColor={mapColors.waterDeep} />
        </LinearGradient>
        <LinearGradient id="roofSheen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        {terrain
          .filter(({ t }) => t.kind === 'field' || t.kind === 'parking' || t.kind === 'plaza')
          .map(({ t, xy }) => (
            <ClipPath key={`clip-${t.id}`} id={`clip-${t.id}`}>
              <Polygon points={toStr(xy)} />
            </ClipPath>
          ))}
      </Defs>
      <Rect x={0} y={0} width={proj.width} height={proj.height} rx={36} fill="url(#groundDots)" />

      {/* Terrain */}
      {terrain.map(({ t, xy }) => {
        const s = toStr(xy);
        const b = bboxOf(xy);
        const c = centerOf(xy);
        switch (t.kind) {
          case 'woods':
          case 'green':
            return <Polygon key={t.id} points={s} fill={t.kind === 'woods' ? mapColors.woods : mapColors.green} stroke={mapColors.greenEdge} strokeWidth={2} strokeLinejoin="round" />;
          case 'water':
            return (
              <G key={t.id}>
                <Polygon points={toStr(scaleAbout(xy, c, 1.06))} fill="none" stroke={mapColors.waterEdge} strokeOpacity={0.35} strokeWidth={6} strokeLinejoin="round" />
                <Polygon points={s} fill="url(#waterFill)" stroke={mapColors.waterEdge} strokeWidth={2.5} strokeLinejoin="round" />
                {[-0.22, 0, 0.22].map((k, i) => {
                  const y = c[1] + b.h * k;
                  const x = c[0] - b.w * 0.18 + (i % 2) * b.w * 0.12;
                  return <Path key={i} d={`M${x} ${y} q 7 -5 14 0 t 14 0 t 14 0`} stroke={mapColors.ripple} strokeWidth={1.6} fill="none" strokeLinecap="round" />;
                })}
              </G>
            );
          case 'track':
            return (
              <G key={t.id}>
                <Polygon points={s} fill={mapColors.track} />
                {[0.97, 0.92, 0.87].map((k) => (
                  <Polygon key={k} points={toStr(scaleAbout(xy, c, k))} fill="none" stroke={mapColors.trackLine} strokeWidth={1} />
                ))}
              </G>
            );
          case 'field':
            return (
              <G key={t.id}>
                <Polygon points={s} fill={mapColors.field} />
                <G clipPath={`url(#clip-${t.id})`}>
                  {Array.from({ length: Math.ceil(b.w / 14) }, (_, i) =>
                    i % 2 ? <Rect key={i} x={b.x0 + i * 14} y={b.y0} width={14} height={b.h} fill={mapColors.fieldStripe} /> : null,
                  )}
                  <Rect x={b.x0 + b.w * 0.14} y={b.y0 + b.h * 0.16} width={b.w * 0.72} height={b.h * 0.68} fill="none" stroke={mapColors.trackLine} strokeWidth={1.4} />
                  <Line x1={c[0]} y1={b.y0 + b.h * 0.16} x2={c[0]} y2={b.y0 + b.h * 0.84} stroke={mapColors.trackLine} strokeWidth={1.4} />
                  <Circle cx={c[0]} cy={c[1]} r={Math.min(b.w, b.h) * 0.13} fill="none" stroke={mapColors.trackLine} strokeWidth={1.4} />
                </G>
              </G>
            );
          case 'court': {
            const wide = b.w > b.h;
            return (
              <G key={t.id}>
                <Polygon points={s} fill={mapColors.court} />
                <Rect x={b.x0 + 4} y={b.y0 + 4} width={b.w - 8} height={b.h - 8} fill="none" stroke={mapColors.courtLine} strokeWidth={1.3} />
                {wide ? (
                  <Line x1={c[0]} y1={b.y0 + 4} x2={c[0]} y2={b.y1 - 4} stroke={mapColors.courtLine} strokeWidth={1.3} />
                ) : (
                  <Line x1={b.x0 + 4} y1={c[1]} x2={b.x1 - 4} y2={c[1]} stroke={mapColors.courtLine} strokeWidth={1.3} />
                )}
                <Circle cx={c[0]} cy={c[1]} r={Math.min(b.w, b.h) * 0.12} fill="none" stroke={mapColors.courtLine} strokeWidth={1.3} />
              </G>
            );
          }
          case 'parking':
            return (
              <G key={t.id}>
                <Polygon points={s} fill={mapColors.parking} />
                <G clipPath={`url(#clip-${t.id})`}>
                  {Array.from({ length: Math.floor(b.w / 7) }, (_, i) => (
                    <G key={i}>
                      <Line x1={b.x0 + i * 7} y1={b.y0} x2={b.x0 + i * 7} y2={b.y0 + b.h * 0.36} stroke={mapColors.parkingLine} strokeWidth={0.9} />
                      <Line x1={b.x0 + i * 7} y1={b.y1 - b.h * 0.36} x2={b.x0 + i * 7} y2={b.y1} stroke={mapColors.parkingLine} strokeWidth={0.9} />
                    </G>
                  ))}
                </G>
              </G>
            );
          case 'plaza':
            return (
              <G key={t.id}>
                <Polygon points={s} fill={mapColors.plaza} />
                <G clipPath={`url(#clip-${t.id})`}>
                  {Array.from({ length: Math.ceil(b.w / 9) }, (_, i) => (
                    <Line key={`v${i}`} x1={b.x0 + i * 9} y1={b.y0} x2={b.x0 + i * 9} y2={b.y1} stroke={mapColors.plazaLine} strokeWidth={0.8} />
                  ))}
                  {Array.from({ length: Math.ceil(b.h / 9) }, (_, i) => (
                    <Line key={`h${i}`} x1={b.x0} y1={b.y0 + i * 9} x2={b.x1} y2={b.y0 + i * 9} stroke={mapColors.plazaLine} strokeWidth={0.8} />
                  ))}
                </G>
              </G>
            );
          default:
            return <Polygon key={t.id} points={s} fill={mapColors.green} />;
        }
      })}

      {/* Roads: casing, surface, centre dashes; footpaths on top */}
      {roads.filter(({ r }) => r.kind === 'road').map(({ r, s }) => (
        <Polyline key={`${r.id}-case`} points={s} fill="none" stroke={mapColors.roadCasing} strokeWidth={23} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {roads.filter(({ r }) => r.kind === 'road').map(({ r, s }) => (
        <Polyline key={r.id} points={s} fill="none" stroke={mapColors.road} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {roads.filter(({ r }) => r.kind === 'road').map(({ r, s }) => (
        <Polyline key={`${r.id}-dash`} points={s} fill="none" stroke={mapColors.roadDash} strokeWidth={1.6} strokeDasharray="12 14" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {roads.filter(({ r }) => r.kind === 'path').map(({ r, s }) => (
        <G key={r.id}>
          <Polyline points={s} fill="none" stroke={mapColors.pathEdge} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          <Polyline points={s} fill="none" stroke={mapColors.path} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      ))}

      {/* Trees: a soft shadow, the crown, a highlight */}
      {trees.map((t, i) => (
        <G key={`tr${i}`}>
          <Circle cx={t.x + t.r * 0.35} cy={t.y + t.r * 0.45} r={t.r} fill={mapColors.shadow} />
          <Circle cx={t.x} cy={t.y} r={t.r} fill={i % 3 ? mapColors.tree : mapColors.treeDark} />
          <Circle cx={t.x - t.r * 0.3} cy={t.y - t.r * 0.32} r={t.r * 0.42} fill={mapColors.treeHi} />
        </G>
      ))}

      {/* Buildings, 2.5D: shadow → south wall → roof (tinted by use) with a sheen and parapet */}
      {buildings.map(({ b, xy, h }) => {
        const roof = shift(xy, 0, -h);
        const bb = bboxOf(roof);
        const c = centerOf(roof);
        return (
          <G key={b.id}>
            <Polygon points={toStr(shift(xy, h * 0.9, h * 0.55))} fill={mapColors.shadow} />
            <Polygon points={toStr(xy)} fill={mapColors.wall} stroke={mapColors.buildingLine} strokeWidth={1} />
            <Polygon points={toStr(roof)} fill={ROOF[b.kind ?? ''] ?? mapColors.building} stroke={mapColors.buildingLine} strokeWidth={1.5} strokeLinejoin="round" />
            <Polygon points={toStr(roof)} fill="url(#roofSheen)" />
            {bb.w > 30 && bb.h > 24 && <Polygon points={toStr(scaleAbout(roof, c, 0.8))} fill="none" stroke={mapColors.buildingLine} strokeOpacity={0.7} strokeWidth={0.9} />}
          </G>
        );
      })}

      {/* Captions for unnamed-zone places */}
      {terrain.filter(({ t }) => t.label).map(({ t, xy }) => {
        const c = centerOf(xy);
        const b = bboxOf(xy);
        return <Caption key={`cap-${t.id}`} x={c[0]} y={t.kind === 'field' ? b.y1 + cap * 2.4 : b.y1 + cap * 1.3} text={t.label!} size={cap} />;
      })}
      {buildings.filter(({ b }) => b.label).map(({ b, xy, h }) => {
        const bb = bboxOf(shift(xy, 0, -h));
        return <Caption key={`cap-${b.id}`} x={(bb.x0 + bb.x1) / 2} y={bb.y0 - cap * 0.6} text={b.label!} size={cap} />;
      })}
    </G>
  );
});

type ZoneShapeProps = { zone: Zone; points: string; label: [number, number]; selected: boolean; meId: string | null; fontSize: number; onSelect?: (id: string) => void };

/** One territory: colour = who holds it, dash = neutral/contested/attack, opacity = strength. */
export const ZoneShape = memo(function ZoneShape({ zone, points, label, selected, meId, fontSize, onSelect }: ZoneShapeProps) {
  const t = useTerritory(zone.id);
  const rel = relationOf(t, meId);
  const status = displayStatus(t);
  const mine = rel === 'mine';
  const c = status === 'contested' || status === 'under_attack' ? STATUS_UI[status].color : mine ? RELATION_COLOR.mine : STATUS_UI[status].color;
  const strength = t?.control ?? (t?.owner ? 0.6 : 0);
  const line2 =
    status === 'neutral'
      ? 'NEUTRAL'
      : status === 'unknown'
        ? ''
        : `${mine ? 'YOURS' : (t?.crew?.name ?? t?.owner?.display_name ?? '').split(' ')[0].toUpperCase()}${status === 'contested' ? ' · CONTESTED' : status === 'under_attack' ? ' · UNDER ATTACK' : ''}`;
  const press = onSelect
    ? () => {
        tap();
        onSelect(zone.id);
      }
    : undefined;
  return (
    <G onPress={press} accessibilityLabel={`${zone.name}: ${STATUS_UI[status].label}${t?.owner ? `, held by ${mine ? 'you' : t.owner.display_name}` : ''}`}>
      <Polygon
        points={points}
        fill={c}
        fillOpacity={selected ? 0.4 : status === 'neutral' ? 0.05 : 0.1 + strength * 0.22}
        stroke={c}
        strokeOpacity={selected ? 1 : 0.85}
        strokeWidth={selected ? 7 : status === 'under_attack' ? 5 : 3}
        strokeDasharray={status === 'neutral' ? '12 10' : status === 'contested' ? '22 8' : status === 'under_attack' ? '6 6' : undefined}
        strokeLinejoin="round"
      />
      {/* Halo first so the name reads over roofs, trees and roads */}
      <SvgText x={label[0]} y={label[1] - fontSize * 0.15} fill="none" stroke={mapColors.labelHalo} strokeWidth={fontSize * 0.34} strokeLinejoin="round" fontSize={fontSize} fontFamily={fonts.labelBold} fontWeight="700" textAnchor="middle" letterSpacing={fontSize * 0.06}>
        {(zone.short_name ?? zone.name).toUpperCase()}
      </SvgText>
      <SvgText x={label[0]} y={label[1] - fontSize * 0.15} fill={colors.text} fontSize={fontSize} fontFamily={fonts.labelBold} fontWeight="700" textAnchor="middle" letterSpacing={fontSize * 0.06}>
        {(zone.short_name ?? zone.name).toUpperCase()}
      </SvgText>
      {!!line2 && (
        <SvgText x={label[0]} y={label[1] + fontSize * 0.9} fill={c} fontSize={fontSize * 0.66} fontFamily={fonts.label} textAnchor="middle">
          {line2}
        </SvgText>
      )}
    </G>
  );
});
