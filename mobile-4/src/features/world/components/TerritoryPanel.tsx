/**
 * The selected territory, as a game HUD: who holds it, how hard, what's happening, and the one
 * move you can make. A bottom sheet on phones (drag down to close), a side panel on wide screens.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon, NATIVE, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { alpha, DISPLAY_SKEW, fonts } from '@/theme';
import { shortTime } from '@/components/campus/territoryUi';
import { crewOf, MY_CREW_ID } from '../data/crews';
import { defenceRating, LEVEL_XP, levelProgress } from '../logic/buildWorld';
import { districtName } from '../logic/camera';
import { planFor, type WorldActionKind } from '../source/preview';
import { useDiscovered, useTerritory, useWorld } from '../state/worldStore';
import type { ActivityKind, Territory } from '../types';
import { BattleBar, Brackets, compact, CrewEmblem, GameButton, HUD, HudKicker, LevelPips, Stat, W } from './hud';

type Props = {
  id: string;
  desktop: boolean;
  bottom: number;
  top: number;
  busy: boolean;
  onClose: () => void;
  onAction: (kind: WorldActionKind) => void;
  onSelect: (id: string) => void;
  onEnter: (t: Territory) => void;
};

export const STATUS_LABEL: Record<Territory['state']['status'], { label: string; color: string; icon: IconName }> = {
  unclaimed: { label: 'Unclaimed', color: HUD.inkDim, icon: 'flag-outline' },
  owned: { label: 'Controlled', color: HUD.ink, icon: 'flag-variant' },
  contested: { label: 'Contested', color: HUD.contested, icon: 'sword-cross' },
  under_attack: { label: 'Under attack', color: HUD.attack, icon: 'shield-alert' },
  locked: { label: 'Locked', color: HUD.gold, icon: 'lock' },
};

const KIND_ICON: Record<ActivityKind, IconName> = { claim: 'flag-checkered', defend: 'shield-check', challenge: 'sword-cross', run: 'run-fast', workout: 'dumbbell', capture: 'flag-variant', discover: 'radar', meetup: 'account-group' };

export function TerritoryPanel({ id, desktop, bottom, top, busy, onClose, onAction, onSelect, onEnter }: Props) {
  const t = useTerritory(id);
  const discovered = useDiscovered();
  const [v] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));

  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [id, v]);

  const close = () => {
    Animated.timing(v, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }).start(() => onClose());
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !desktop && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 90 || g.vy > 0.9) {
            tap();
            Animated.timing(drag, { toValue: 600, duration: 180, useNativeDriver: NATIVE }).start(() => {
              drag.setValue(0);
              onClose();
            });
          } else Animated.spring(drag, { toValue: 0, useNativeDriver: NATIVE, speed: 20, bounciness: 4 }).start();
        },
      }),
    [desktop, drag, onClose],
  );

  if (!t) return null;
  const found = discovered.has(t.id);
  const motion = desktop
    ? { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }
    : { opacity: v, transform: [{ translateY: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }), drag) }] };

  return (
    <Animated.View
      style={[desktop ? [styles.side, { top, bottom }] : [styles.sheet, { bottom }], motion]}
      accessibilityViewIsModal={!desktop}
      accessibilityLabel={`${t.name} territory`}>
      <View {...pan.panHandlers}>
        {!desktop && <View style={styles.grip} />}
        <Header t={t} found={found} onClose={close} />
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false} bounces={false}>
        {found ? <Body t={t} onSelect={onSelect} onEnter={onEnter} /> : <Fog t={t} />}
      </ScrollView>
      <Footer t={t} found={found} busy={busy} onAction={onAction} />
    </Animated.View>
  );
}

function Header({ t, found, onClose }: { t: Territory; found: boolean; onClose: () => void }) {
  const st = STATUS_LABEL[t.state.status];
  const parent = useTerritory(t.parentId);
  const where = [districtName(t), parent?.name, t.tier === 4 && t.split ? 'Zone' : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.header}>
      <View style={styles.tagRow}>
        <View style={styles.levelTag}>
          <Text style={styles.levelTagText}>{t.tier === 4 && t.split ? 'ZONE' : `LEVEL ${t.level} TERRITORY`}</Text>
        </View>
        {found && (
          <View style={[styles.status, { borderColor: alpha(st.color, 0.5) }]}>
            {(t.state.status === 'contested' || t.state.status === 'under_attack') && <View style={[styles.dot, { backgroundColor: st.color }]} />}
            <Icon name={st.icon} size={12} color={st.color} />
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => { tap(); onClose(); }} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="close" size={18} color={HUD.inkDim} />
        </Pressable>
      </View>
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{t.name}</Text>
      <Text style={styles.where} numberOfLines={1}>
        {where}
        {t.accuracy === 'approximate' ? '  ·  ≈ approx. outline' : ''}
      </Text>
      <View style={styles.rule}>
        <View style={[styles.ruleAccent, { backgroundColor: found ? (t.state.status === 'locked' ? HUD.gold : crewOf(t.state.ownerCrewId)?.color ?? HUD.inkMute) : HUD.inkMute }]} />
      </View>
    </View>
  );
}

function Fog({ t }: { t: Territory }) {
  return (
    <View style={styles.block}>
      <View style={styles.fog}>
        <Brackets color={HUD.hairHi} />
        <Icon name="radar" size={26} color={HUD.inkDim} />
        <Text style={styles.fogTitle}>Uncharted territory</Text>
        <Text style={styles.fogBody}>
          Nobody on your crew has been to {t.name} yet. Go there to reveal who holds it and what it’s worth — discovering ground earns XP. In the Preview Season you can scout it from here.
        </Text>
      </View>
    </View>
  );
}

function Body({ t, onSelect, onEnter }: { t: Territory; onSelect: (id: string) => void; onEnter: (t: Territory) => void }) {
  const s = t.state;
  const owner = crewOf(s.ownerCrewId);
  const challenger = crewOf(s.challengerCrewId);
  const color = s.status === 'locked' ? HUD.gold : owner?.color ?? HUD.inkMute;
  const mine = s.ownerCrewId === MY_CREW_ID;
  const nextXp = t.level < 5 ? (LEVEL_XP[t.level] ?? s.xp) - s.xp : 0;
  const world = useWorld();
  const children = useMemo(() => (t.split ? world.filter((c) => c.parentId === t.id) : []), [t.split, t.id, world]);

  return (
    <View>
      {/* Controlled by */}
      <View style={styles.block}>
        <HudKicker>{s.status === 'locked' ? 'Protected ground' : owner ? 'Controlled by' : 'Nobody holds it'}</HudKicker>
        <View style={styles.ownerRow}>
          <CrewEmblem crew={owner} size={52} locked={s.status === 'locked'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.crew, { color: owner ? (mine ? W.primary : HUD.ink) : HUD.inkDim }]} numberOfLines={1}>
                {s.status === 'locked' && !owner ? 'Locked' : owner?.name ?? 'Unclaimed'}
              </Text>
              {mine && (
                <View style={styles.yours}>
                  <Text style={styles.yoursText}>YOUR CREW</Text>
                </View>
              )}
            </View>
            <Text style={styles.crewSub} numberOfLines={2}>
              {s.status === 'locked' ? s.lockedReason : owner ? `${owner.members} members · ${compact(owner.xp)} crew XP · “${owner.motto}”` : 'Open ground. First crew to claim it holds it.'}
            </Text>
          </View>
        </View>
      </View>

      {/* Numbers */}
      <View style={styles.stats}>
        <Stat label="XP" value={s.xp.toLocaleString('en-IN')} color={HUD.ink} />
        <Stat label="Control" value={owner ? `${s.control}%` : '—'} color={owner ? color : HUD.inkMute} />
        <Stat label="Defence" value={owner ? defenceRating(s.defence) : '—'} color={HUD.ink} />
      </View>

      <View style={styles.levelRow}>
        <LevelPips level={t.level} color={color} />
        <Text style={styles.levelText}>
          LEVEL {t.level}
          {t.level < 5 ? `  ·  ${nextXp.toLocaleString('en-IN')} XP TO LEVEL ${t.level + 1}` : '  ·  MAX LEVEL'}
        </Text>
      </View>
      <View style={styles.levelTrack}>
        <View style={[styles.levelFill, { width: `${Math.round(levelProgress(s.xp) * 100)}%`, backgroundColor: color }]} />
      </View>

      {/* Battle */}
      {(s.status === 'contested' || s.status === 'under_attack') && owner && challenger && (
        <View style={[styles.battle, { borderColor: alpha(s.status === 'under_attack' ? HUD.attack : HUD.contested, 0.4) }]}>
          <HudKicker color={s.status === 'under_attack' ? HUD.attack : HUD.contested}>{s.status === 'under_attack' ? 'Under attack' : 'Territory contested'}</HudKicker>
          <View style={styles.vsRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vsName, { color: owner.color }]} numberOfLines={1}>{owner.name}</Text>
              <Text style={[styles.vsPct, { color: owner.color }]}>{s.control}%</Text>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={[styles.vsName, { color: challenger.color }]} numberOfLines={1}>{challenger.name}</Text>
              <Text style={[styles.vsPct, { color: challenger.color }]}>{100 - s.control}%</Text>
            </View>
          </View>
          <BattleBar left={owner.color} right={challenger.color} leftPct={s.control} />
        </View>
      )}

      {/* Live, aggregated */}
      <View style={styles.live} accessibilityLabel={`${s.activeUsers} squirrels active in this ${t.tier === 4 ? 'zone' : 'territory'}`}>
        <LiveDot />
        <Text style={styles.liveText}>
          <Text style={{ color: HUD.ink }}>{s.activeUsers} SQUIRRELS ACTIVE</Text> IN THIS {t.tier === 4 ? 'ZONE' : 'TERRITORY'}
        </Text>
        <Text style={styles.liveWhen}>{shortTime(new Date(s.lastActivityAt).toISOString())}</Text>
      </View>

      {/* Micro territories */}
      {children.length > 0 && (
        <View style={styles.block}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <HudKicker style={{ flex: 1 }}>{`Territories in ${t.name} · ${children.length}`}</HudKicker>
            <Pressable onPress={() => { tap(); onEnter(t); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Zoom into ${t.name}`}>
              <Text style={styles.link}>ENTER ZONE ›</Text>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {children.map((c) => (
              <ChildChip key={c.id} t={c} onPress={() => onSelect(c.id)} />
            ))}
          </View>
        </View>
      )}

      {/* Recent */}
      {s.recent.length > 0 && (
        <View style={styles.block}>
          <HudKicker>Recent activity</HudKicker>
          {s.recent.slice(0, 4).map((r) => (
            <View key={r.id} style={styles.recent}>
              <Text style={styles.recentXp}>+{r.xp}</Text>
              <Text style={styles.recentXpUnit}>XP</Text>
              <Icon name={KIND_ICON[r.kind]} size={14} color={crewOf(r.crewId)?.color ?? HUD.inkDim} style={{ marginLeft: 6 }} />
              <Text style={styles.recentText} numberOfLines={1}>{r.text}</Text>
              <Text style={styles.recentWhen}>{shortTime(new Date(r.at).toISOString())}</Text>
            </View>
          ))}
        </View>
      )}

      {t.blurb && <Text style={styles.blurb}>{t.blurb}</Text>}
    </View>
  );
}

function ChildChip({ t, onPress }: { t: Territory; onPress: () => void }) {
  const discovered = useDiscovered();
  const found = discovered.has(t.id);
  const c = found ? (t.state.status === 'locked' ? HUD.gold : crewOf(t.state.ownerCrewId)?.color ?? HUD.inkMute) : HUD.inkMute;
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={[styles.chip, { borderColor: alpha(c, 0.45) }]} accessibilityRole="button" accessibilityLabel={`${t.name}${found ? `, ${STATUS_LABEL[t.state.status].label}` : ', uncharted'}`}>
      <View style={[styles.chipDot, { backgroundColor: c }, !found && { backgroundColor: 'transparent', borderWidth: 1, borderColor: c }]} />
      <Text style={styles.chipText} numberOfLines={1}>{found ? t.name : `${t.name} ?`}</Text>
      {found && t.state.status !== 'owned' && t.state.status !== 'unclaimed' && <Icon name={STATUS_LABEL[t.state.status].icon} size={11} color={STATUS_LABEL[t.state.status].color} />}
    </Pressable>
  );
}

function LiveDot() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }));
    a.start();
    return () => a.stop();
  }, [v]);
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: W.green, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }) }] }} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: W.green }} />
    </View>
  );
}

function Footer({ t, found, busy, onAction }: { t: Territory; found: boolean; busy: boolean; onAction: (k: WorldActionKind) => void }) {
  const plan = planFor(t, found);
  if ('reason' in plan) {
    return (
      <View style={styles.footer}>
        <View style={styles.lockedNote}>
          <Icon name="lock" size={16} color={HUD.gold} />
          <Text style={styles.lockedText} numberOfLines={2}>LOCKED · {t.state.lockedReason?.split('.')[0] ?? 'Protected'}</Text>
        </View>
      </View>
    );
  }
  const icon: IconName = { claim: 'flag-checkered', defend: 'shield-check', challenge: 'sword-cross', push: 'sword-cross', scout: 'radar' }[plan.kind] as IconName;
  return (
    <View style={styles.footer}>
      <GameButton label={plan.label} sub={`+${plan.xp} XP`} icon={icon} tone={plan.tone} hold={plan.hold} busy={busy} onFire={() => onAction(plan.kind)} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 8, right: 8, maxHeight: '54%', backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hair, borderTopColor: HUD.hairHi, borderRadius: 4, overflow: 'hidden' },
  side: { position: 'absolute', right: 16, width: 384, backgroundColor: HUD.solid, borderWidth: 1, borderColor: HUD.hair, borderRadius: 4, overflow: 'hidden' },
  grip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: HUD.hairHi, marginTop: 8 },
  header: { paddingHorizontal: 16, paddingTop: 10 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelTag: { backgroundColor: alpha(HUD.ink, 0.08), paddingHorizontal: 8, paddingVertical: 3 },
  levelTagText: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 10.5, letterSpacing: 1.8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2.5 },
  statusText: { fontFamily: fonts.labelBold, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: HUD.hair },
  title: { color: HUD.ink, fontFamily: fonts.display, fontSize: 36, lineHeight: 42, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, transform: [{ skewX: DISPLAY_SKEW }] },
  where: { color: HUD.inkDim, fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.8 },
  rule: { height: 1, backgroundColor: HUD.hair, marginTop: 12 },
  ruleAccent: { width: 56, height: 2, marginTop: -0.5 },
  block: { paddingHorizontal: 16, paddingTop: 14 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  crew: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.6, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }], flexShrink: 1 },
  crewSub: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  yours: { backgroundColor: W.primaryFill, paddingHorizontal: 6, paddingVertical: 2 },
  yoursText: { color: W.onPrimary, fontFamily: fonts.labelBold, fontSize: 9.5, letterSpacing: 1.4 },
  stats: { flexDirection: 'row', marginHorizontal: 16, marginTop: 14, borderWidth: 1, borderColor: HUD.hair, borderLeftWidth: 0 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12 },
  levelText: { color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1.2 },
  levelTrack: { height: 3, backgroundColor: alpha(HUD.ink, 0.08), marginHorizontal: 16, marginTop: 8 },
  levelFill: { height: 3 },
  battle: { marginHorizontal: 16, marginTop: 14, borderWidth: 1, padding: 12, gap: 10, backgroundColor: alpha('#000', 0.25) },
  vsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  vsName: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  vsPct: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, transform: [{ skewX: DISPLAY_SKEW }] },
  vs: { color: HUD.inkMute, fontFamily: fonts.script, fontSize: 18, marginBottom: 6 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: alpha(W.green, 0.06), borderLeftWidth: 2, borderLeftColor: W.green },
  liveText: { flex: 1, color: HUD.inkDim, fontFamily: fonts.labelBold, fontSize: 11.5, letterSpacing: 1.2 },
  liveWhen: { color: HUD.inkMute, fontFamily: fonts.label, fontSize: 11 },
  link: { color: W.primary, fontFamily: fonts.labelBold, fontSize: 11.5, letterSpacing: 1.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7, maxWidth: '100%' },
  chipDot: { width: 7, height: 7, transform: [{ rotate: '45deg' }] },
  chipText: { color: HUD.ink, fontFamily: fonts.labelBold, fontSize: 12.5, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 },
  recent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: HUD.hair, gap: 2 },
  recentXp: { color: W.primary, fontFamily: fonts.display, fontSize: 17, width: 46, textAlign: 'right', transform: [{ skewX: DISPLAY_SKEW }] },
  recentXpUnit: { color: alpha(W.primary, 0.7), fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1, marginLeft: 3, width: 16 },
  recentText: { flex: 1, color: HUD.ink, fontFamily: fonts.medium, fontSize: 12.5, marginLeft: 8 },
  recentWhen: { color: HUD.inkMute, fontFamily: fonts.label, fontSize: 11.5, marginLeft: 8 },
  blurb: { color: HUD.inkDim, fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 12.5, lineHeight: 18, paddingHorizontal: 16, paddingTop: 12 },
  fog: { alignItems: 'center', gap: 8, padding: 18, marginTop: 4, backgroundColor: alpha('#000', 0.3) },
  fogTitle: { color: HUD.ink, fontFamily: fonts.display, fontSize: 20, letterSpacing: 1, textTransform: 'uppercase', transform: [{ skewX: DISPLAY_SKEW }] },
  fogBody: { color: HUD.inkDim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: { padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: HUD.hair, backgroundColor: alpha('#000', 0.25) },
  lockedNote: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: alpha(HUD.gold, 0.4), padding: 12 },
  lockedText: { flex: 1, color: HUD.gold, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2 },
});
