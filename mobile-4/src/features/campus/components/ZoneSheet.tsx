/**
 * A zone, up close: a bottom sheet on phones, a side panel on tablets and desktops.
 *
 * Who holds it, how strongly, what it's worth, how busy it is, when it last changed hands, the
 * battle (if there is one) — and only the moves you're allowed to make (logic/rules.ts). Moves you
 * could make from closer by are named with the distance, not offered as buttons.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, darkColors as W, DISPLAY_SKEW, fonts } from '@/theme';
import { BattleBar, GameButton, HUD, type GameButtonTone } from '@/features/world/components/hud';
import { ZONE_TYPE_LABEL } from '../data/geography';
import { NEUTRAL, PROTECTED } from '../data/crews';
import { ACTION_RANGE_M, defenseLabel, holdLevel, type Allowed, type Reach } from '../logic/rules';
import { useZoneActivity } from '../state/campusMapStore';
import type { Activity, Crew, Zone, ZoneAction } from '../types';
import { CrewHex } from './CampusHud';

const ACTION: Record<ZoneAction, { label: string; icon: IconName; tone: GameButtonTone; hold: boolean; sub: (z: Zone) => string }> = {
  claim: { label: 'Claim', icon: 'flag-variant', tone: 'primary', hold: true, sub: (z) => `+${z.xpValue} XP` },
  attack: { label: 'Attack', icon: 'sword', tone: 'danger', hold: true, sub: () => '+40 XP' },
  capture: { label: 'Capture', icon: 'flag-checkered', tone: 'gold', hold: true, sub: (z) => `+${z.xpValue + 150} XP` },
  defend: { label: 'Defend', icon: 'shield-half-full', tone: 'primary', hold: false, sub: () => '+15 strength' },
  challenge: { label: 'Challenge crew', icon: 'sword-cross', tone: 'scout', hold: false, sub: () => '2 h battle' },
};

export const ago = (ts: number | null, now = Date.now()) => {
  if (ts == null) return '—';
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const left = (ts: number, now = Date.now()) => {
  const m = Math.max(0, Math.round((ts - now) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
};

type Props = {
  zone: Zone;
  crews: Crew[];
  myCrewId: string | null;
  reach: Reach | null;
  allowed: Allowed;
  pending: ZoneAction | null;
  onAction: (a: ZoneAction) => void;
  onClose: () => void;
  wide: boolean;
  maxHeight: number;
};

export function ZoneSheet({ zone, crews, myCrewId, reach, allowed, pending, onAction, onClose, wide, maxHeight }: Props) {
  // The parent keys this sheet by zone, so a new zone starts with activity folded.
  const [showActivity, setShowActivity] = useState(false);
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [zone.id, v]);
  const crewOf = (id: string | null | undefined) => crews.find((c) => c.id === id) ?? null;
  const owner = crewOf(zone.ownerCrewId);
  const ch = zone.challenge;
  const attacker = crewOf(ch?.attackerCrewId);
  const locked = zone.status === 'locked';
  const color = locked ? PROTECTED : owner?.color ?? NEUTRAL;
  const mine = !!myCrewId && zone.ownerCrewId === myCrewId;
  const activity = useZoneActivity(zone.id, showActivity);
  const g = zone.geometry;

  const enter = wide
    ? { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }
    : { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] };

  return (
    <Animated.View style={[wide ? s.panel : s.sheet, { maxHeight }, enter]} accessibilityViewIsModal={!wide}>
      <View style={[s.accent, { backgroundColor: ch ? attacker?.color ?? HUD.attack : color }]} />
      {!wide && <View style={s.grab} />}
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.kicker}>{ZONE_TYPE_LABEL[zone.type].toUpperCase()} · {statusWord(zone, mine)}</Text>
          <Text style={s.name} numberOfLines={2} accessibilityRole="header">{zone.name}</Text>
        </View>
        <Pressable onPress={() => { tap(); onClose(); }} hitSlop={10} style={s.close} accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="close" size={20} color={HUD.inkDim} />
        </Pressable>
      </View>

      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 14 }} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={s.ownerRow}>
          <CrewHex color={color} size={34} dashed={!owner && !locked}>
            <Icon name={locked ? 'lock' : owner ? 'flag-variant' : 'plus'} size={15} color={color} />
          </CrewHex>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.ownerName, { color: owner ? color : locked ? PROTECTED : HUD.ink }]} numberOfLines={1}>
              {locked ? 'Protected ground' : owner ? owner.name : 'Unclaimed'}
            </Text>
            <Text style={s.ownerSub} numberOfLines={2}>
              {locked
                ? 'Residences and the school are never part of the game.'
                : owner
                  ? `${mine ? 'Your crew' : `${owner.memberCount} members`} · held since ${ago(zone.lastCapturedAt)}`
                  : `First crew to claim it holds it · worth ${zone.xpValue} XP`}
            </Text>
          </View>
          {!locked && owner && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.big, { color }]}>{zone.defenseStrength}%</Text>
              <Text style={s.tiny}>STRENGTH</Text>
            </View>
          )}
        </View>

        {ch && attacker && owner && (
          <View style={s.battle} accessibilityLabel={`Current challenge: ${attacker.name} attacking ${owner.name}, ${ch.progress}% to capture, ${left(ch.endsAt)}`}>
            <View style={s.battleHead}>
              <Icon name="sword-cross" size={14} color={attacker.color} />
              <Text style={[s.battleTitle, { color: attacker.color }]} numberOfLines={1}>{attacker.short} ATTACKING</Text>
              <Text style={s.battleTime}>{left(ch.endsAt)}</Text>
            </View>
            <BattleBar left={attacker.color} right={alpha(owner.color, 0.55)} leftPct={ch.progress} />
            <View style={s.battleFoot}>
              <Text style={[s.battleSide, { color: attacker.color }]}>{ch.progress}% TO CAPTURE</Text>
              <Text style={[s.battleSide, { color: owner.color }]}>{owner.short} HOLDING</Text>
            </View>
          </View>
        )}

        {!locked && (
          <View style={s.grid}>
            <Cell label="XP value" value={String(zone.xpValue)} />
            <Cell label="Active" value={String(zone.activeUsers)} sub={zone.activityLevel >= 0.7 ? 'busy' : zone.activityLevel >= 0.35 ? 'steady' : 'quiet'} />
            <Cell label="Defence" value={owner ? defenseLabel(zone.defenseStrength) : '—'} sub={owner ? `level ${holdLevel(zone)}` : undefined} color={owner ? color : undefined} />
            <Cell label="Captured" value={zone.lastCapturedAt ? ago(zone.lastCapturedAt).replace(' ago', '') : '—'} sub={zone.lastCapturedAt ? 'ago' : 'never'} />
          </View>
        )}

        {!locked && (
          <View style={s.actions}>
            {allowed.actions.map((a) => {
              const def = ACTION[a];
              return <GameButton key={a} label={def.label} sub={def.sub(zone)} icon={def.icon} tone={def.tone} hold={def.hold} busy={pending === a} disabled={!!pending && pending !== a} onFire={() => onAction(a)} />;
            })}
            {allowed.needPresence.length > 0 && (
              <View style={s.need} accessibilityLabel={`Get within ${ACTION_RANGE_M} metres to ${allowed.needPresence.join(' or ')}`}>
                <Icon name="map-marker-distance" size={18} color={HUD.inkDim} />
                <Text style={s.needText}>
                  {`Get within ${ACTION_RANGE_M} m to ${allowed.needPresence.map((a) => ACTION[a].label.toUpperCase()).join(' or ')}`}
                  {reach ? <Text style={{ color: HUD.ink }}>{` · you're ${reach.distanceM >= 1000 ? `${(reach.distanceM / 1000).toFixed(1)} km` : `${reach.distanceM} m`} away`}</Text> : ' · waiting for your location'}
                </Text>
              </View>
            )}
            {allowed.reason && !allowed.actions.length && !allowed.needPresence.length && <Text style={s.reason}>{allowed.reason}</Text>}
            <Pressable onPress={() => { tap(); setShowActivity((x) => !x); }} style={s.viewActivity} accessibilityRole="button" accessibilityState={{ expanded: showActivity }} accessibilityLabel="View activity">
              <Icon name="pulse" size={16} color={HUD.ink} />
              <Text style={s.viewActivityText}>{showActivity ? 'HIDE ACTIVITY' : 'VIEW ACTIVITY'}</Text>
              <Icon name={showActivity ? 'chevron-up' : 'chevron-down'} size={18} color={HUD.inkDim} />
            </Pressable>
          </View>
        )}

        {showActivity && <ActivityList items={activity.items} error={activity.error} crews={crews} />}

        <Text style={s.foot}>
          {g.nameSource === 'descriptive' ? 'Unnamed in OpenStreetMap — described by what it is. ' : ''}
          {g.landmarks.length ? `Zone drawn around ${g.landmarks.join(', ')} · ` : ''}
          {(g.areaM2 / 10_000).toFixed(1)} ha · map © OpenStreetMap contributors
        </Text>
      </ScrollView>
    </Animated.View>
  );
}

function statusWord(z: Zone, mine: boolean) {
  if (z.status === 'locked') return 'PROTECTED';
  if (z.status === 'neutral') return 'OPEN';
  if (z.status === 'contested') return mine ? 'UNDER ATTACK' : 'CONTESTED';
  return mine ? 'YOURS' : 'HELD';
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={s.cell} accessibilityLabel={`${label}: ${value}${sub ? ` ${sub}` : ''}`}>
      <Text style={s.cellLabel}>{label.toUpperCase()}</Text>
      <Text style={[s.cellValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={s.cellSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const VERB: Record<NonNullable<Activity['kind']>, string> = { claim: 'claimed it', attack: 'attacked', defend: 'defended', capture: 'captured it', challenge: 'called a battle', visit: 'checked in' };

function ActivityList({ items, error, crews }: { items: Activity[] | null; error: string | null; crews: Crew[] }) {
  if (error) return <Text style={s.reason}>Couldn’t load activity: {error}</Text>;
  if (!items) return <Text style={s.reason}>Loading activity…</Text>;
  if (!items.length) return <Text style={s.reason}>No activity here yet.</Text>;
  return (
    <View style={s.list}>
      {items.map((a) => {
        const crew = crews.find((c) => c.id === a.crewId);
        const you = a.userId === 'you';
        return (
          <View key={a.id} style={s.row}>
            <View style={[s.rowDot, { backgroundColor: crew?.color ?? HUD.inkMute }]} />
            <Text style={s.rowText} numberOfLines={1}>
              <Text style={{ color: you ? W.primary : crew?.color ?? HUD.ink }}>{you ? 'YOU' : a.userId.toUpperCase()}</Text>
              {` ${VERB[a.kind ?? 'visit']}`}
            </Text>
            <Text style={s.rowXp}>+{a.xp}</Text>
            <Text style={s.rowAgo}>{ago(a.timestamp).replace(' ago', '')}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: HUD.solid, borderTopWidth: 1, borderColor: HUD.hairHi, paddingHorizontal: 16, paddingTop: 8 },
  panel: { position: 'absolute', right: 12, width: 380, backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hairHi, paddingHorizontal: 18, paddingTop: 14 },
  accent: { position: 'absolute', left: 0, right: 0, top: 0, height: 2 },
  grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: HUD.hairHi, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  kicker: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 2 },
  name: { color: HUD.ink, fontFamily: fonts.display, fontSize: 27, lineHeight: 33, letterSpacing: 0.6, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: HUD.hair },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  ownerName: { fontFamily: fonts.labelBold, fontSize: 17, letterSpacing: 0.8, textTransform: 'uppercase' },
  ownerSub: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  big: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, transform: [{ skewX: DISPLAY_SKEW }] },
  tiny: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.6 },
  battle: { marginTop: 12, borderWidth: 1, borderColor: HUD.hair, padding: 10, gap: 7, backgroundColor: '#0B0C10' },
  battleHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  battleTitle: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1.6, flex: 1 },
  battleTime: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11.5, letterSpacing: 1 },
  battleFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  battleSide: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1.2 },
  grid: { flexDirection: 'row', borderWidth: 1, borderColor: HUD.hair, marginTop: 12 },
  cell: { flex: 1, paddingVertical: 8, paddingHorizontal: 9, borderLeftWidth: 1, borderLeftColor: HUD.hair, marginLeft: -1, minWidth: 0 },
  cellLabel: { color: HUD.inkMute, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.4 },
  cellValue: { color: HUD.ink, fontFamily: fonts.display, fontSize: 18, marginTop: 2, transform: [{ skewX: DISPLAY_SKEW }] },
  cellSub: { color: HUD.inkDim, fontFamily: fonts.label, fontSize: 11 },
  actions: { marginTop: 14, gap: 10 },
  need: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: HUD.hair, borderStyle: 'dashed', paddingHorizontal: 12, paddingVertical: 10 },
  needText: { flex: 1, color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 12.5, letterSpacing: 0.8 },
  reason: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 8 },
  viewActivity: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: HUD.hairHi },
  viewActivityText: { flex: 1, color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 13.5, letterSpacing: 1.6 },
  list: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: HUD.hair },
  rowDot: { width: 6, height: 6, transform: [{ rotate: '45deg' }] },
  rowText: { flex: 1, color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 0.6 },
  rowXp: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 12.5 },
  rowAgo: { color: HUD.inkMute, fontFamily: fonts.label, fontSize: 12, width: 52, textAlign: 'right' },
  foot: { color: HUD.inkMute, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, marginTop: 14 },
});
