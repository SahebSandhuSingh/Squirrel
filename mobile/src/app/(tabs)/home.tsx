import { EXERCISE_LIBRARY } from '@/data/exercises';
import { useExerciseCatalog } from '@/hooks/useExercise';
import { LOCKED_MISSIONS } from '@/data/features';
import { useLocks } from '@/components/Locked';
import { activityLine, selectFeed, timeAgo } from '@/data/posts';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { Avatar } from '@/components/Avatar';
import { MissionCard, SceneImage } from '@/components/cards';
import { CAMPUS_SOURCE } from '@/api/campus';
import { ActiveNowStrip, CampusNotLive, CampusTerritoryCard, HomeEvents, HomeLeaderboard, SocialShortcuts } from '@/components/campus/HomeSections';
import { CityChip, TopBar } from '@/components/TopBar';
import { Button, Card, Display, FadeIn, Icon, OverlayKicker, OverlaySub, PressScale, Ring, RowSub, RowTitle, Screen, SectionHeader, Tagline } from '@/components/ui';
import { today } from '@/data/stats';
import { userById } from '@/data/users';
import { useAuth } from '@/auth/AuthProvider';
import { Tape } from '@/components/Brand';
import { PROGRESS_API_CONFIGURED } from '@/api/config';
import { xpApi } from '@/api/endpoints';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const { me, missions, logMission, claimed, claimable, claimRewards, city } = useApp();
  const { mode } = useAuth();
  const { syncServerXp, exerciseToday, posts, following } = useApp();
  const locks = useLocks();
  const eventsLocked = locks.locked('events');
  // Crew Activity: the Social "Following" feed (same shared posts + selector), latest 4.
  const crewActivity = useMemo(() => selectFeed(posts, 'Following', { following, meId: me.id, cityId: city.id }).slice(0, 4), [posts, following, me.id, city.id]);
  // Today's rings add what you logged with the form coach.
  const activeMin = today.active.value + exerciseToday.minutes;
  const kcalToday = today.kcal.value + exerciseToday.kcal;
  // Signed in: the server's XP total (derived from real activity) replaces the demo figure.
  // With the progress-service configured, AppState syncs XP from it instead (it is the XP authority).
  useEffect(() => {
    if (mode !== 'live' || PROGRESS_API_CONFIGURED) return;
    xpApi.me().then((r) => syncServerXp(r.xp)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // Locked (not-yet-launched) missions stay visible at the end but don't count.
  const daily = missions.filter((m) => m.tab === 'Daily').sort((a, b) => Number(LOCKED_MISSIONS.has(a.id)) - Number(LOCKED_MISSIONS.has(b.id)));
  const activeDaily = daily.filter((m) => !LOCKED_MISSIONS.has(m.id));
  const doneCount = activeDaily.filter((m) => m.current >= m.goal).length;

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
            <RingStat progress={activeMin / today.active.goal} color={colors.secondary} color2={colors.blue} icon="timer-outline" value={`${activeMin}m`} label="Active" />
            <RingStat progress={kcalToday / today.kcal.goal} color={colors.orange} color2={colors.gold} icon="fire" value={String(kcalToday)} label="kcal" />
            <RingStat progress={Math.min(1, today.streak / 14)} color={colors.violet} color2={colors.primary} icon="lightning-bolt" value={`${today.streak}d`} label="Streak" />
          </View>
          <StartExercise />
        </Card>
      </FadeIn>

      {/* Start run CTA */}
      <FadeIn index={2}>
        <PressScale onPress={() => router.push('/run')} style={{ marginTop: 14 }} scaleTo={0.98}>
          <SceneImage kind="run" seed={4} height={132} scrim="strong">
            <View style={styles.runCta}>
              <View style={{ flex: 1 }}>
                <OverlayKicker>{city.venues?.runs?.[0] ?? 'City Loop'} · 2.4 km loop</OverlayKicker>
                <Display size={30} color={colors.onImage}>Start a run</Display>
                <OverlaySub>Run or walk · your route unlocks zones to claim</OverlaySub>
              </View>
              <View style={styles.playBtn}>
                <Icon name="play" size={30} color={colors.onPrimary} />
              </View>
            </View>
          </SceneImage>
        </PressScale>
      </FadeIn>

      {/* Missions */}
      <SectionHeader kicker="01 — Today" title="Today's Missions" action={`${doneCount}/${activeDaily.length} done`} onAction={() => router.push('/missions')} />
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

      <Tape items={['Touch grass (literally)', 'Every run leaves a mark', 'Claim your block', 'No pressure, all vibes']} color={colors.secondary} rotate={2} style={{ marginTop: 26, marginBottom: -6 }} />

      {/* Territory — the campus map's zones (backend truth) */}
      <SectionHeader kicker="02 — Territory" title="Own your campus" action="Map" onAction={() => router.push('/explore')} />
      {CAMPUS_SOURCE === 'off' ? <CampusNotLive /> : <CampusTerritoryCard />}
      {CAMPUS_SOURCE !== 'off' && <ActiveNowStrip />}
      {CAMPUS_SOURCE !== 'off' && <SocialShortcuts />}

      {/* Challenges */}
      <PressScale onPress={() => router.push('/challenges')} scaleTo={0.98} style={{ marginTop: 12 }}>
        <View style={styles.battle}>
          <Icon name="sword-cross" size={26} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <RowTitle>Choose your battle</RowTitle>
            <Text style={styles.zoneInfo}>Daily, head-to-head, group & special challenges</Text>
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

      {/* Leaderboard — top squirrels today, from the campus backend */}
      {CAMPUS_SOURCE !== 'off' && <HomeLeaderboard campusName={city.campus} />}

      {/* Events — campus events (RSVP state lives on the server) */}
      {CAMPUS_SOURCE !== 'off' && !eventsLocked && <HomeEvents />}

      {/* Friends activity */}
      <SectionHeader kicker="05 — Right now" title="Crew Activity" action="Feed" onAction={() => router.push('/social')} />
      {crewActivity.length === 0 ? (
        <Card>
          <Text style={styles.hint}>Nothing yet. Follow people on Social and their runs and workouts show up here.</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {crewActivity.map((p, i) => {
            const u = p.authorId === me.id ? me : userById(p.authorId);
            const line = activityLine(p);
            return (
              <FadeIn key={p.id} index={i}>
                <PressScale onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} style={styles.activity} scaleTo={0.985} accessibilityLabel={`${u.name} ${line.text}`}>
                  <Avatar user={u} size={38} />
                  <Text style={styles.activityText} numberOfLines={2}>
                    <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{p.authorId === me.id ? 'You' : u.name.split(' ')[0]} </Text>
                    {line.text}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Icon name={line.icon} size={18} color={colors.primary} />
                    <Text style={styles.leaderSub}>{timeAgo(p.minutesAgo)}</Text>
                  </View>
                </PressScale>
              </FadeIn>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

/** Start Exercise: the footer of Today's progress. Opens the exercise picker (backend catalog). */
function StartExercise() {
  const { activeExercise, exerciseToday } = useApp();
  const catalog = useExerciseCatalog();
  const ready = catalog.data?.filter((e) => e.status === 'enabled').length;
  const activeName = activeExercise ? EXERCISE_LIBRARY.find((e) => e.key === activeExercise.key)?.name ?? 'Exercise' : null;
  const sub = activeName
    ? `${activeName} in progress · tap to resume`
    : exerciseToday.sessions
      ? `${exerciseToday.sessions} done today · ${exerciseToday.minutes} min · keep it going`
      : ready
        ? `${ready} exercises ready · form-coached reps`
        : 'Form-coached reps and timed sets';
  const open = () =>
    activeExercise
      ? router.push({ pathname: '/exercise/train/[key]', params: { key: activeExercise.key, session: activeExercise.sessionId ?? '' } })
      : router.push('/exercise/select');
  return (
    <PressScale onPress={open} scaleTo={0.985} style={styles.exRow} accessibilityLabel={activeName ? `Resume ${activeName}` : 'Start Exercise'}>
      <View style={styles.exIcon}>
        <Icon name={activeName ? 'play-circle' : 'arm-flex'} size={22} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <RowTitle>{activeName ? 'Resume exercise' : 'Start Exercise'}</RowTitle>
        <RowSub>{sub}</RowSub>
      </View>
      <View style={styles.exGo}>
        <Text style={styles.exGoText}>{activeName ? 'Resume' : 'Start'}</Text>
        <Icon name="arrow-right" size={16} color={colors.onPrimary} />
      </View>
    </PressScale>
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
  exRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  exIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  exGo: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 8 },
  exGoText: { color: colors.onPrimary, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primary, padding: 14, transform: [{ rotate: '-0.6deg' }], shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  zoneKicker: { color: colors.primary, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 1.4 },
  zonePct: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 18 },
  zoneInfo: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 6 },
  battle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', padding: 14 },
  hello: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 15, flexShrink: 1 },
  cardTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  link: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13 },
  rings: { flexDirection: 'row', justifyContent: 'space-between' },
  ringValue: { color: colors.text, fontFamily: fonts.display, fontSize: 18, marginTop: 6, letterSpacing: 0.3 },
  ringLabel: { color: colors.dim, fontFamily: fonts.medium, fontSize: 11 },
  runCta: { position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end' },
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
