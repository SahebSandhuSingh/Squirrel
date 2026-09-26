import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { Avatar } from '@/components/Avatar';
import { EventCard, MissionCard, SceneImage } from '@/components/cards';
import { CityChip, TopBar } from '@/components/TopBar';
import { Button, Card, Display, FadeIn, Icon, PressScale, Ring, Screen, SectionHeader, Tagline } from '@/components/ui';
import { today } from '@/data/stats';
import { users } from '@/data/users';
import { territoryBoard } from '@/data/territory';
import { useAuth } from '@/auth/AuthProvider';
import { Tape } from '@/components/Brand';
import { xpApi } from '@/api/endpoints';
import { API_CONFIGURED, EXERCISE_API_CONFIGURED } from '@/api/config';
import { useExerciseProgress, useExerciseUser } from '@/hooks/useExercise';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

/** Entry to the form coach; live numbers from GET /api/users/{id}/progress when a coach profile exists. */
function FormCoachCard() {
  const user = useExerciseUser();
  const { data: p, error } = useExerciseProgress(user?.user_id);
  const sub = !EXERCISE_API_CONFIGURED
    ? 'Rep-by-rep form scores · not connected'
    : !user
      ? 'Set up your profile to get scored reps'
      : error && !p
        ? "Couldn't reach the coach · tap to retry"
        : p
          ? p.totals.sessions === 0
            ? 'No sessions yet · plan your first'
            : `${p.this_week} this week · avg form ${p.avg_form ?? '—'} · ${p.streak_days}d streak`
          : 'Loading your form…';
  return (
    <PressScale onPress={() => router.push('/exercise')} style={styles.coach} scaleTo={0.98} accessibilityLabel="Form coach">
      <View style={styles.coachIcon}>
        <Icon name="weight-lifter" size={24} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.coachTitle}>Form Coach</Text>
        <Text style={styles.coachSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Pressable onPress={() => router.push({ pathname: '/exercise/train/[key]', params: { key: 'squat', sets: '3', value: '15', rest: '45' } })} style={styles.coachGo} accessibilityLabel="Start a squat workout" hitSlop={6}>
        <Icon name="play" size={20} color={colors.onPrimary} />
      </Pressable>
    </PressScale>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const { me, missions, logMission, claimed, claimable, claimRewards, events, joinedEvents, toggleEvent, city, districts } = useApp();
  const { mode } = useAuth();
  const { syncServerXp } = useApp();
  // Signed in: the server's XP total (derived from real activity) replaces the demo figure.
  useEffect(() => {
    if (mode !== 'live' || !API_CONFIGURED) return;
    xpApi.me().then((r) => syncServerXp(r.xp)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const held = districts.filter((d) => d.status === 'yours');
  const home = held[0] ?? districts[0];
  const daily = missions.filter((m) => m.tab === 'Daily');
  const doneCount = daily.filter((m) => m.current >= m.goal).length;
  const upcoming = events.filter((e) => !e.online).slice(0, 5);
  const leaders = territoryBoard.weekly.slice(0, 4);

  const onClaim = () => {
    const r = claimRewards();
    router.push({ pathname: '/level-up', params: { gained: String(r.xp), coins: String(r.coins), leveledUp: r.leveledUp ? '1' : '0' } });
  };

  return (
    <Screen>
      <TopBar />

      {/* Greeting */}
      <FadeIn style={{ marginTop: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.hello}>{greeting()}, {me.name.split(' ')[0]} 👋</Text>
          <CityChip />
        </View>
        <Display size={44} style={{ marginTop: 2 }}>Ready to <Text style={{ color: colors.primary }}>move?</Text></Display>
      </FadeIn>

      {/* Today's progress */}
      <FadeIn index={1}>
        <Card style={{ marginTop: 14, paddingVertical: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Today's progress</Text>
            <Pressable onPress={() => router.push('/progress')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.link}>Stats</Text>
              <Icon name="chevron-right" size={16} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.rings}>
            <RingStat progress={today.steps.value / today.steps.goal} color={colors.green} color2={colors.secondary} icon="shoe-print" value={today.steps.value.toLocaleString('en-IN')} label="Steps" />
            <RingStat progress={today.active.value / today.active.goal} color={colors.secondary} color2={colors.blue} icon="timer-outline" value={`${today.active.value}m`} label="Active" />
            <RingStat progress={today.kcal.value / today.kcal.goal} color={colors.orange} color2={colors.gold} icon="fire" value={String(today.kcal.value)} label="kcal" />
            <RingStat progress={Math.min(1, today.streak / 14)} color={colors.violet} color2={colors.primary} icon="lightning-bolt" value={`${today.streak}d`} label="Streak" />
          </View>
        </Card>
      </FadeIn>

      {/* Start run CTA */}
      <FadeIn index={2}>
        <PressScale onPress={() => router.push('/run')} style={{ marginTop: 14 }} scaleTo={0.98}>
          <SceneImage kind="run" seed={4} height={132} scrim="strong">
            <View style={styles.runCta}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>{city.venues?.runs?.[0] ?? 'City Loop'} · 2.4 km loop</Text>
                <Display size={30} color={colors.onImage}>Start a run</Display>
                <Text style={styles.runSub}>Earn up to +150 XP · 3 friends running now</Text>
              </View>
              <View style={styles.playBtn}>
                <Icon name="play" size={30} color={colors.onPrimary} />
              </View>
            </View>
          </SceneImage>
        </PressScale>
      </FadeIn>

      {/* Form coach (Exercise Mechanics backend) */}
      <FadeIn index={3}>
        <FormCoachCard />
      </FadeIn>

      {/* Missions */}
      <SectionHeader kicker="01 — Today" title="Today's Missions" action={`${doneCount}/${daily.length} done`} onAction={() => router.push('/missions')} />
      <View style={{ gap: 10 }}>
        {daily.map((m, i) => (
          <FadeIn key={m.id} index={i}>
            <MissionCard mission={m} claimed={claimed.has(m.id)} onLog={() => logMission(m.id)} />
          </FadeIn>
        ))}
      </View>
      <Button
        label={claimable.count ? `Claim rewards · +${claimable.xp} XP` : 'Claim rewards'}
        iconLeft="gift"
        disabled={!claimable.count}
        onPress={onClaim}
        style={{ marginTop: 14 }}
      />
      {!claimable.count && <Text style={styles.hint}>Tap + on a mission to log progress. Complete one to claim XP & coins.</Text>}

      <Tape items={['Touch grass (literally)', 'Every run leaves a mark', 'Claim your block', 'No gym-bro energy']} color={colors.secondary} rotate={2} style={{ marginTop: 26, marginBottom: -6 }} />

      {/* Territory */}
      <SectionHeader kicker="02 — Territory" title="Own your block" action="Map" onAction={() => router.push('/territory')} />
      <PressScale onPress={() => router.push('/territory')} scaleTo={0.98}>
        <View style={styles.zone}>
          <View style={{ flex: 1 }}>
            <Text style={styles.zoneKicker}>YOUR CREW</Text>
            <Display size={28} numberOfLines={1}>{home?.name}</Display>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1, height: 8, backgroundColor: colors.line }}>
                <View style={{ width: `${Math.round((home?.control ?? 0) * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
              </View>
              <Text style={styles.zonePct}>{Math.round((home?.control ?? 0) * 100)}%</Text>
            </View>
            <Text style={styles.zoneInfo}>{held.length} zones held · {districts.filter((d) => d.status === 'contested').length} contested · decays in {home?.decayDays}d</Text>
          </View>
          <Icon name="chevron-right" size={24} color={colors.primary} />
        </View>
      </PressScale>

      {/* Challenges */}
      <PressScale onPress={() => router.push('/challenges')} scaleTo={0.98} style={{ marginTop: 12 }}>
        <View style={styles.battle}>
          <Icon name="sword-cross" size={26} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.battleTitle}>Choose your battle</Text>
            <Text style={styles.zoneInfo}>You vs Rhea · 18.4 vs 21.1 km this week</Text>
          </View>
          <Icon name="chevron-right" size={24} color={colors.secondary} />
        </View>
      </PressScale>

      {/* Motivation */}
      <FadeIn>
        <SceneImage kind="city-night" seed={12} height={176} style={{ marginTop: 22 }} scrim={false}>
          <Mascot pose="lift" size={176} animated style={{ position: 'absolute', left: -6, bottom: -10 }} />
          <View style={{ position: 'absolute', right: 16, top: 24, alignItems: 'flex-end' }}>
            <Tagline size={23} color={colors.onImage} style={{ textAlign: 'right' }}>Discipline{'\n'}today.</Tagline>
            <Tagline size={19} color={colors.primarySoft} style={{ textAlign: 'right', marginTop: 4 }}>A bigger you{'\n'}tomorrow.</Tagline>
          </View>
        </SceneImage>
      </FadeIn>

      {/* Events */}
      <SectionHeader kicker="03 — Meetups" title={`Happening in ${city.name}`} action="All events" onAction={() => router.push('/events')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 16 }} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 16 }} />
        {upcoming.map((e) => (
          <EventCard key={e.id} event={e} variant="hero" going={joinedEvents.has(e.id)} onToggle={() => toggleEvent(e.id)} />
        ))}
      </ScrollView>

      {/* Leaderboard — ranked by territory area, like the backend */}
      <SectionHeader kicker="04 — Who's moving" title="City Leaderboard" action="By area" onAction={() => router.push('/leaderboard')} />
      <Card style={{ paddingVertical: 6 }}>
        {leaders.map((r, i) => {
          const u = r.me ? me : users.find((x) => x.id === r.userId)!;
          return (
            <View key={r.userId} style={[styles.leader, r.me && styles.leaderMe, i > 0 && !r.me && { borderTopWidth: 1, borderTopColor: colors.line }]}>
              <Text style={[styles.rank, i === 0 && { color: colors.primary }]}>{String(i + 1).padStart(2, '0')}</Text>
              <Avatar user={u} size={36} ring={i === 0 ? colors.primary : colors.lineHi} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.leaderName}>{r.me ? 'You' : r.name}</Text>
                <Text style={styles.leaderSub}>LV {u.level} · {u.area}</Text>
              </View>
              <Text style={styles.leaderXp}>{r.km2.toFixed(1)} km²</Text>
            </View>
          );
        })}
      </Card>

      {/* Friends activity */}
      <SectionHeader kicker="05 — Right now" title="Crew Activity" action="Feed" onAction={() => router.push('/social')} />
      <View style={{ gap: 10 }}>
        {[
          { u: 'u_rhea', text: 'ran 7.2 km at 5\'42"/km', icon: 'run-fast' as const, t: '2h' },
          { u: 'u_meera', text: 'is hosting Yoga in the Park', icon: 'yoga' as const, t: '3h' },
          { u: 'u_zoya', text: 'unlocked the Early Bird badge', icon: 'medal' as const, t: '5h' },
          { u: 'u_aarav', text: 'hit a new squat PR · 80 kg', icon: 'weight-lifter' as const, t: '6h' },
        ].map((a, i) => {
          const u = users.find((x) => x.id === a.u)!;
          return (
            <FadeIn key={a.u} index={i}>
              <View style={styles.activity}>
                <Avatar user={u} size={38} />
                <Text style={styles.activityText} numberOfLines={2}>
                  <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{u.name.split(' ')[0]} </Text>
                  {a.text}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Icon name={a.icon} size={18} color={colors.primary} />
                  <Text style={styles.leaderSub}>{a.t}</Text>
                </View>
              </View>
            </FadeIn>
          );
        })}
      </View>
    </Screen>
  );
}

function RingStat({ progress, color, color2, icon, value, label }: { progress: number; color: string; color2: string; icon: React.ComponentProps<typeof Icon>['name']; value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Ring progress={progress} size={62} stroke={6} color={color} color2={color2}>
        <Icon name={icon} size={20} color={color} />
      </Ring>
      <Text style={styles.ringValue}>{value}</Text>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coach: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  coachIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  coachGo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  coachTitle: { color: colors.text, fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, textTransform: 'uppercase' },
  coachSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primary, padding: 14, transform: [{ rotate: '-0.6deg' }], shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  zoneKicker: { color: colors.primary, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.4 },
  zonePct: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 18 },
  zoneInfo: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 6 },
  battle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', padding: 14 },
  battleTitle: { color: colors.text, fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, textTransform: 'uppercase' },
  hello: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 15, flexShrink: 1 },
  cardTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  link: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13 },
  rings: { flexDirection: 'row', justifyContent: 'space-between' },
  ringValue: { color: colors.text, fontFamily: fonts.display, fontSize: 18, marginTop: 6, letterSpacing: 0.3 },
  ringLabel: { color: colors.dim, fontFamily: fonts.medium, fontSize: 11 },
  runCta: { position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end' },
  kicker: { color: colors.primarySoft, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  runSub: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 12 },
  playBtn: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  hint: { color: colors.mute, fontSize: 12, textAlign: 'center', marginTop: 8, fontFamily: fonts.regular },
  leader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  leaderMe: { backgroundColor: 'rgba(215,255,31,0.08)', borderRadius: radius.md, marginHorizontal: -6, paddingHorizontal: 10 },
  rank: { color: colors.dim, fontFamily: fonts.display, fontSize: 18, width: 34 },
  leaderName: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  leaderSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11 },
  leaderXp: { color: colors.gold, fontFamily: fonts.bold, fontSize: 13 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10 },
  activityText: { flex: 1, color: colors.sub, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
