/**
 * SVG layers of the world map: the stylised base (terrain, roads, paths, buildings) and the
 * territory shapes. The base is memoised as a whole; each territory subscribes to its own
 * zone in the store, so an ownership change repaints one polygon.
 */
import { memo } from 'react';
import { G, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import type { MapFeatures, Zone } from '@/api/campus/types';
import { displayStatus, RELATION_COLOR, relationOf, STATUS_UI } from '@/components/campus/territoryUi';
import { tap } from '@/components/ui';
import { pts, type Projection } from '@/components/map/geometry';
import { useTerritory } from '@/state/territoryStore';
import { alpha, colors, fonts, mapColors } from '@/theme';

const TERRAIN = { green: mapColors.green, water: mapColors.water, field: mapColors.field } as const;

export const BaseLayer = memo(function BaseLayer({ features, proj }: { features: MapFeatures; proj: Projection }) {
  return (
    <G>
      {features.terrain.map((t) => (
        <Polygon key={t.id} points={pts(proj, t.polygon)} fill={TERRAIN[t.kind] ?? TERRAIN.green} stroke={t.kind === 'water' ? alpha(colors.blue, 0.35) : 'none'} strokeWidth={t.kind === 'water' ? 3 : 0} />
      ))}
      {features.roads
        .filter((r) => r.kind === 'road')
        .map((r) => (
          <G key={r.id}>
            <Polyline points={pts(proj, r.points)} fill="none" stroke={mapColors.road} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={pts(proj, r.points)} fill="none" stroke={mapColors.roadEdge} strokeWidth={1.5} strokeDasharray="14 16" strokeLinecap="round" />
          </G>
        ))}
      {features.roads
        .filter((r) => r.kind === 'path')
        .map((r) => (
          <Polyline key={r.id} points={pts(proj, r.points)} fill="none" stroke={mapColors.path} strokeWidth={4} strokeDasharray="6 7" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      {features.buildings.map((b) => (
        <Polygon key={b.id} points={pts(proj, b.polygon)} fill={mapColors.building} stroke={mapColors.buildingLine} strokeWidth={2} />
      ))}
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
      <SvgText x={label[0]} y={label[1] - fontSize * 0.15} fill={colors.text} fontSize={fontSize} fontFamily={fonts.labelBold} fontWeight="700" textAnchor="middle" opacity={0.92}>
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
