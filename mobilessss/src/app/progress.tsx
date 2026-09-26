import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { MiniBars, SceneImage, StatCard } from '@/components/cards';
import { Card, Display, FadeIn, Header, Icon, IconButton, Ring, Screen, Segmented, SectionHeader, Tagline } from '@/components/ui';
import { heatmap, recentActivities, stats, type Period, type Stat } from '@/data/stats';
import type { ProgressSession } from '@/api/exercise';
import { RemoteStatus } from '@/components/ExerciseParts';
import { useExerciseActivity, useExerciseProgress, useExerciseUser, useReloadOnFocus } from '@/hooks/useExercise';
import { colors, fonts, radius } from '@/theme';

const PERIODS: Period[] = ['Day', 'Week', 'Month', 'Year'];
const DAY = 86_400_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Workouts stat built from the coach's session list, bucketed for the selected period. */
function liveWorkoutStat(sessions: ProgressSession[], period: Period): Stat {
  const today = startOfDay(new Date());
  const count = (from: Date, to: Date) => sessions.filter((s) => s.date >= ymd(from) && s.date < ymd(to)).length;
  const next = (d: Date, n = 1) => new Date(d.getTime() + n * DAY);
  let values: number[] = [];
  let labels: string[] = [];
  let total = 0;
  if (period === 'Day' || period === 'Week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY);
      values.push(count(d, next(d)));
      labels.push('MTWTFSS'[(d.getDay() + 6) % 7]);
    }
    total = period === 'Day' ? values[6] : values.reduce((a, b) => a + b, 0);
  } else if (period === 'Month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    for (let w = 0; w < 5; w++) {
      const a = next(first, w * 7);
      if (a.getMonth() !== first.getMonth()) break;
      values.push(count(a, next(a, 7)));
      labels.push(`W${w + 1}`);
    }
    total = values.reduce((a, b) => a + b, 0);
  } else {
    for (let m = 0; m < 12; m++) {
      values.push(count(new Date(today.getFullYear(), m, 1), new Date(today.getFullYear(), m + 1, 1)));
      labels.push('JFMAMJJASOND'[m]);
    }
    total = values.reduce((a, b) => a + b, 0);
  }
  return { id: 'workouts', label: 'Coached workouts', value: String(total), unit: total === 1 ? 'session' : 'sessions', icon: 'arm-flex', color: '#D7FF1F', series: { labels, values } };
}

/** 5 weeks × 7 days (Mon-first, ending this week): 4 = trained that day, 0 = not. */
function liveHeatmap(dates: Set<string>): number[][] {
  const today = startOfDay(new Date());
  const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
  const start = new Date(monday.getTime() - 28 * DAY);
  return Array.from({ length: 5 }, (_, w) => Array.from({ length: 7 }, (_, d) => (dates.has(ymd(new Date(start.getTime() + (w * 7 + d) * DAY))) ? 4 : 0)));
}

const HEAT = [colors.cardHi, 'rgba(215,255,31,0.25)', 'rgba(215,255,31,0.45)', 'rgba(215,255,31,0.7)', '#D7FF1F'];

/** YOUR PROGRESS — fitness-game analytics dashboard. */
export default function Progress() {
  const [period, setPeriod] = useState<Period>('Week');
  const data = stats[period];
  const steps = data[0];

  // Workouts, streak and recent coached sessions come from the Exercise backend when connected.
  const coach = useExerciseUser();
  const year = new Date().getFullYear();
  const prog = useExerciseProgress(coach?.user_id);
  const act = useExerciseActivity(coach?.user_id, year);
  const prevAct = useExerciseActivity(coach?.user_id, year - 1); // the 5-week grid can span New Year
  useReloadOnFocus(prog.reload, act.reload);
  const live = !!prog.data;
  const workouts = useMemo(() => (prog.data ? liveWorkoutStat(prog.data.sessions, period) : null), [prog.data, period]);
  const heat = useMemo(() => (act.data ? liveHeatmap(new Set([...(act.data ?? []), ...(prevAct.data ?? [])])) : heatmap), [act.data, prevAct.data]);
  const recentCoached = (prog.data?.sessions ?? []).slice(-3).reverse();

  return (
    <Screen tabBar={false}>
      <Header back title="Your Progress" right={<IconButton icon="share-variant-outline" color={colors.primary} onPress={() => router.push('/compose')} label="Share progress" />} />
      <Segmented items={PERIODS} value={period} onChange={setPeriod} />
      <Text style={styles.source}>
        {live ? 'Steps, active time and kcal are sample data · workouts and streak are live from the coach' : 'Sample data · connect the form coach for live workouts'}
      </Text>
      {coach && <RemoteStatus loading={prog.loading} error={prog.error} hasData={live} onRetry={prog.reload} label="workouts" />}

      {/* Hero chart */}
      <FadeIn key={period}>
        <Card glow={colors.green}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ring progress={steps.progress ?? 0} size={92} stroke={9} color={colors.green} color2={colors.secondary}>
              <Text style={styles.ringPct}>{Math.round((steps.progress ?? 0) * 100)}%</Text>
              <Text style={styles.ringLbl}>of goal</Text>
            </Ring>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.kicker}>Steps this {period.toLowerCase()}</Text>
              <Display size={36}>{steps.value}</Display>
              <Text style={styles.sub}>{steps.unit} · {steps.delta ?? 'on track'} vs last {period.toLowerCase()}</Text>
            </View>
          </View>
          <View style={{ marginTop: 16 }}>
            <MiniBars values={steps.series.values} color={colors.green} height={90} barWidth={steps.series.values.length > 8 ? 12 : 22} />
            <View style={styles.axis}>
              {steps.series.labels.map((l, i) => (
                <Text key={i} style={[styles.axisLbl, { width: steps.series.values.length > 8 ? 12 : 22 }]}>{l}</Text>
              ))}
            </View>
          </View>
        </Card>
      </FadeIn>

      <View style={{ gap: 10, marginTop: 12 }}>
        {data.slice(1).map((s, i) => (
          <FadeIn key={`${period}-${s.id}`} index={i}>
            <StatCard stat={s.id === 'workouts' && workouts ? workouts : s.id === 'streak' && prog.data ? { ...s, label: 'Streak', value: `${prog.data.streak_days} ${prog.data.streak_days === 1 ? 'day' : 'days'}`, delta: undefined, progress: undefined } : s} />
          </FadeIn>
        ))}
      </View>

      {/* Streak heatmap */}
      <SectionHeader title="Streak Calendar" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="fire" size={22} color={colors.orange} />
          <Text style={styles.streak}>{live ? `${prog.data!.streak_days}-day streak` : '12-day streak'}</Text>
          <Text style={styles.sub}>{live ? '· coached sessions' : '· sample'}</Text>
        </View>
        <View style={{ gap: 6 }}>
          {heat.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
              {row.map((v, c) => (
                <View key={c} style={[styles.cell, { backgroundColor: HEAT[v] }]} />
              ))}
            </View>
          ))}
        </View>
        <View style={[styles.axis, { marginTop: 6 }]}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <Text key={i} style={[styles.axisLbl, { flex: 1 }]}>{d}</Text>
          ))}
        </View>
      </Card>

      {/* Recent */}
      <SectionHeader title="Recent Activity" />
      <View style={{ gap: 10 }}>
        {recentCoached.map((s) => (
          <Pressable key={s.session_id} onPress={() => router.push({ pathname: '/exercise/session/[id]', params: { id: s.session_id } })} style={styles.activity} accessibilityLabel="Open session report">
            <SceneImage kind="gym" seed={s.session_id.length} height={56} style={{ width: 56, borderRadius: radius.sm }} scrim={false} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.actTitle} numberOfLines={1}>{s.exercises.filter(Boolean).join(', ') || 'Coached session'}</Text>
              <Text style={styles.sub}>{s.day} {s.date}, {s.start_time}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.actBig}>{s.reps} reps</Text>
              <Text style={styles.sub}>{s.score == null ? 'not scored' : `form ${Math.round(s.score)}`}</Text>
            </View>
          </Pressable>
        ))}
        {recentActivities.map((a) => (
          <View key={a.id} style={styles.activity}>
            <SceneImage kind={a.scene} seed={a.id.length * 5} height={56} style={{ width: 56, borderRadius: radius.sm }} scrim={false} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.actTitle} numberOfLines={1}>{a.title}</Text>
              <Text style={styles.sub}>{a.when}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.actBig}>{a.km ? `${a.km} km` : `${a.minutes} min`}</Text>
              <Text style={styles.sub}>{a.kcal} kcal</Text>
            </View>
          </View>
        ))}
      </View>

      <SceneImage kind="city-dawn" seed={77} height={160} style={{ marginTop: 20 }} scrim={false}>
        <Tagline size={22} color={colors.onImage} style={{ position: 'absolute', left: 16, top: 28 }}>
          Consistency{'\n'}looks good{'\n'}on you.
        </Tagline>
        <Mascot pose="drink" size={160} animated style={{ position: 'absolute', right: -4, bottom: -12 }} />
      </SceneImage>
    </Screen>
  );
}

const styles = StyleSheet.create({
  source: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginBottom: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  ringPct: { color: colors.text, fontFamily: fonts.display, fontSize: 22 },
  ringLbl: { color: colors.dim, fontFamily: fonts.medium, fontSize: 10, marginTop: -2 },
  kicker: { color: colors.green, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  sub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisLbl: { color: colors.mute, fontFamily: fonts.semibold, fontSize: 10, textAlign: 'center' },
  streak: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: 6 },
  activity: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10 },
  actTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  actBig: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
});
