import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Scene } from '@/art/Scene';
import { Mascot } from '@/art/Mascot';
import { PoseSkeleton, squatPose } from '@/components/PoseSkeleton';
import { Button, Display, Icon, Ring, tap } from '@/components/ui';
import { estimateKcal, exerciseByKey, PLAN_BOUNDS } from '@/data/exercises';
import type { XpLine } from '@/logic/xp';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/**
 * ACTIVE EXERCISE: the session planned on the Exercise backend (sets, target, rest).
 * Reps are counted by the user (tap each rep, or "Set done"); timed sets count down in
 * real time. The camera is a mirror for form; the phone has no pose model, so nothing is
 * auto-counted. On finish, completeExercise() feeds missions, XP and today's activity.
 */

const GUIDE_MS = 3000; // follow-along tempo for the squat guide (not a counter)
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Summary = { reps: number; secs: number; kcal: number; xp: number; lines: XpLine[]; leveledUp: boolean };

export default function Train() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ key: string; sets?: string; value?: string; rest?: string; session?: string }>();
  const ex = exerciseByKey(String(params.key));
  const { activeExercise, beginExercise, endExercise, completeExercise } = useApp();

  const timed = ex?.measure === 'time';
  const sets = Number(params.sets) || PLAN_BOUNDS.sets.value;
  const target = Number(params.value) || (timed ? PLAN_BOUNDS.time.value : PLAN_BOUNDS.reps.value);
  const rest = Number(params.rest ?? PLAN_BOUNDS.rest.value);
  const sessionId = params.session ? String(params.session) : undefined;

  const [perm, requestPerm] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [camFailed, setCamFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<'work' | 'rest' | 'done'>('work');
  const [set, setSet] = useState(1);
  const [reps, setReps] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  const [elapsed, setElapsed] = useState(0); // active seconds (work only)
  const [setSecs, setSetSecs] = useState(0);
  const [restLeft, setRestLeft] = useState(rest);
  const [guide, setGuide] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const live = useRef({ set: 1, setSecs: 0, rest, totalReps: 0, elapsed: 0, finished: false });

  // One active exercise at a time: another exercise already holds the guard → blocked.
  const [mountActive] = useState(activeExercise);
  const blocked = !!ex && !!mountActive && mountActive.key !== ex.key;
  useEffect(() => {
    if (ex && !mountActive) beginExercise({ key: ex.key, sessionId });
  }, [ex, mountActive, beginExercise, sessionId]);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm, requestPerm]);

  const finish = useCallback(() => {
    if (!ex || live.current.finished) return;
    live.current.finished = true;
    const secs = live.current.elapsed;
    const repsDone = live.current.totalReps;
    const kcal = estimateKcal(ex, secs);
    setPhase('done');
    if (repsDone === 0 && (!timed || secs < 10)) {
      // Nothing done: don't record an empty session.
      setSummary({ reps: 0, secs, kcal: 0, xp: 0, lines: [], leveledUp: false });
    } else {
      const r = completeExercise({ key: ex.key, slug: ex.slug, reps: timed ? 0 : repsDone, timedSeconds: timed ? secs : 0, activeSeconds: secs, kcal });
      setSummary({ reps: repsDone, secs, kcal, xp: r.xp, lines: r.lines, leveledUp: r.leveledUp });
      tap('success');
    }
    endExercise();
  }, [ex, timed, completeExercise, endExercise]);

  const nextSet = useCallback(() => {
    live.current = { ...live.current, set: live.current.set + 1, setSecs: 0 };
    setSet(live.current.set);
    setReps(0);
    setSetSecs(0);
    setPhase('work');
  }, []);

  const completeSet = useCallback(() => {
    tap('success');
    if (live.current.set >= sets) finish();
    else if (rest > 0) {
      live.current.rest = rest;
      setRestLeft(rest);
      setPhase('rest');
    } else nextSet();
  }, [sets, rest, finish, nextSet]);

  // Seconds: active time, timed-set countdown, rest countdown.
  useEffect(() => {
    if (paused || phase === 'done' || blocked) return;
    const id = setInterval(() => {
      if (phase === 'work') {
        live.current.elapsed += 1;
        live.current.setSecs += 1;
        setElapsed(live.current.elapsed);
        setSetSecs(live.current.setSecs);
        if (timed && live.current.setSecs >= target) completeSet();
      } else {
        live.current.rest -= 1;
        setRestLeft(live.current.rest);
        if (live.current.rest <= 0) nextSet();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [paused, phase, blocked, timed, target, completeSet, nextSet]);

  // Follow-along guide animation (squat only).
  useEffect(() => {
    if (paused || phase !== 'work' || ex?.slug !== 'squat') return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const t = ((Date.now() - t0) % GUIDE_MS) / GUIDE_MS;
      setGuide(t < 0.5 ? t * 2 : (1 - t) * 2);
    }, 40);
    return () => clearInterval(id);
  }, [paused, phase, ex?.slug]);

  const addRep = (d: 1 | -1) => {
    if (phase !== 'work' || paused || timed) return;
    const next = Math.max(0, reps + d);
    if (next === reps) return;
    tap(d > 0 ? 'impact' : 'select');
    setReps(next);
    live.current.totalReps += d;
    setTotalReps(live.current.totalReps);
    if (next >= target) completeSet();
  };

  const leave = (to: 'home' | 'session') => {
    if (to === 'session' && sessionId) router.dismissTo({ pathname: '/exercise/session/[id]', params: { id: sessionId } });
    else router.dismissTo('/home');
  };

  if (!ex || blocked) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 28 }]}>
        <Mascot pose="sit" size={130} />
        <Display size={30} style={{ marginTop: 10, textAlign: 'center' }}>{!ex ? 'Unknown exercise' : 'Another exercise is running'}</Display>
        <Text style={styles.overlaySub}>{!ex ? 'This exercise is not in the library.' : 'Finish or end it before starting a new one.'}</Text>
        <Button label="Back to Home" size="md" onPress={() => router.dismissTo('/home')} style={{ marginTop: 20, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const kcal = estimateKcal(ex, elapsed);
  const progress = timed ? setSecs / target : reps / target;
  const showCamera = perm?.granted && !camFailed;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {showCamera ? (
        <CameraView style={StyleSheet.absoluteFill} facing={facing} mirror={facing === 'front'} active={!paused && phase !== 'done'} onMountError={() => setCamFailed(true)} />
      ) : (
        <Scene kind={ex.scene} seed={9} aspect={0.46} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={['rgba(6,6,6,0.6)', 'rgba(6,6,6,0.1)', 'rgba(6,6,6,0.1)', 'rgba(6,6,6,0.9)']} locations={[0, 0.22, 0.55, 1]} style={StyleSheet.absoluteFill} />

      {ex.slug === 'squat' && phase === 'work' && (
        <View style={[styles.stage, { top: insets.top + 120, bottom: 300 + insets.bottom }]} pointerEvents="none">
          <PoseSkeleton pose={squatPose(guide)} />
        </View>
      )}

      <View style={[styles.col, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        {/* Top: exercise + count, close */}
        <View style={styles.topRow}>
          <View style={styles.counter}>
            <Ring progress={progress} size={62} stroke={6} color={colors.primary}>
              <Icon name={ex.icon} size={24} color={colors.primary} />
            </Ring>
            <View style={{ marginLeft: 12, flexShrink: 1 }}>
              <Text style={styles.exName} numberOfLines={1}>{ex.name}</Text>
              <Text style={styles.count}>
                <Text style={{ color: colors.primary }}>{timed ? mmss(setSecs) : reps}</Text> / {timed ? mmss(target) : target}
              </Text>
              <Text style={styles.setText}>Set {set} of {sets}</Text>
            </View>
          </View>
          <RoundBtn icon="close" label="End exercise" onPress={() => setPaused(true)} />
        </View>
        <View style={styles.pill}>
          <View style={styles.dot} />
          <Text style={styles.pillText}>{timed ? 'Keep going until the timer ends' : ex.slug === 'squat' ? 'Follow the guide · tap each rep' : 'Tap each rep'}</Text>
        </View>

        <View style={{ flex: 1 }} />

        {/* Rep tap target (reps) */}
        {!timed && phase === 'work' && (
          <View style={styles.tapRow}>
            <Pressable onPress={() => addRep(-1)} style={styles.undo} accessibilityLabel="Undo one rep" disabled={reps === 0}>
              <Icon name="minus" size={22} color={reps === 0 ? colors.mute : colors.text} />
            </Pressable>
            <Pressable onPress={() => addRep(1)} style={styles.repBtn} accessibilityLabel="Count one rep">
              <Text style={styles.repPlus}>+1</Text>
              <Text style={styles.repLbl}>rep</Text>
            </Pressable>
            <Pressable onPress={() => { if (reps > 0) completeSet(); }} style={[styles.undo, { width: 'auto', paddingHorizontal: 14 }]} accessibilityLabel="Set done" disabled={reps === 0}>
              <Text style={[styles.setDone, reps === 0 && { color: colors.mute }]}>Set done</Text>
            </Pressable>
          </View>
        )}

        {/* Stats */}
        <View style={styles.stats}>
          <Stat value={mmss(elapsed)} label="Time" />
          <View style={styles.div} />
          <Stat value={`${set}/${sets}`} label="Set" />
          <View style={styles.div} />
          <Stat value={timed ? mmss(elapsed) : String(totalReps)} label={timed ? 'Work' : 'Reps'} />
          <View style={styles.div} />
          <Stat value={String(kcal)} label="kcal est." />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <RoundBtn icon="stop" label="End exercise" size={60} onPress={() => setPaused(true)} />
          <Pressable onPress={() => { tap('impact'); setPaused((p) => !p); }} style={styles.pauseRing} accessibilityLabel={paused ? 'Resume' : 'Pause'}>
            <View style={styles.pauseInner}>
              <Icon name={paused ? 'play' : 'pause'} size={42} color={colors.text} />
            </View>
          </Pressable>
          <RoundBtn icon="camera-flip-outline" label="Flip camera" size={60} onPress={() => (perm?.granted ? setFacing((f) => (f === 'front' ? 'back' : 'front')) : requestPerm())} />
        </View>
      </View>

      {phase === 'rest' && (
        <View style={styles.overlay}>
          <Text style={styles.kicker}>Set {set} done · rest</Text>
          <Display size={96} color={colors.primary}>{restLeft}</Display>
          <Text style={styles.overlaySub}>Next: set {set + 1} of {sets}</Text>
          <Button label="Skip rest" size="md" onPress={nextSet} style={{ marginTop: 20, alignSelf: 'stretch' }} />
        </View>
      )}

      {paused && phase !== 'done' && (
        <View style={styles.overlay}>
          <Display size={46}>Paused</Display>
          <Text style={styles.overlaySub}>{timed ? mmss(elapsed) : `${totalReps} reps`} · {kcal} kcal est.</Text>
          <Button label="Resume" icon="play" onPress={() => setPaused(false)} style={{ marginTop: 22, alignSelf: 'stretch' }} />
          <Button label={totalReps > 0 || (timed && elapsed >= 10) ? 'Finish & save' : 'End without saving'} variant="secondary" size="md" onPress={() => { setPaused(false); finish(); }} style={{ marginTop: 10, alignSelf: 'stretch' }} />
        </View>
      )}

      {phase === 'done' && summary && (
        <View style={styles.overlay}>
          <Mascot pose={summary.xp ? 'celebrate' : 'sit'} size={120} animated />
          <Display size={38} style={{ marginTop: 6, textAlign: 'center' }}>{summary.xp ? 'Exercise done' : 'Nothing recorded'}</Display>
          <Text style={styles.overlaySub}>{ex.name}</Text>
          {summary.xp > 0 && (
            <>
              <View style={[styles.stats, { marginTop: 16, alignSelf: 'stretch' }]}>
                <Stat value={timed ? mmss(summary.secs) : String(summary.reps)} label={timed ? 'Work' : 'Reps'} />
                <View style={styles.div} />
                <Stat value={mmss(summary.secs)} label="Time" />
                <View style={styles.div} />
                <Stat value={String(summary.kcal)} label="kcal est." />
                <View style={styles.div} />
                <Stat value={`+${summary.xp}`} label="XP" accent />
              </View>
              <View style={{ alignSelf: 'stretch', marginTop: 10, gap: 4 }}>
                {summary.lines.map((l) => (
                  <View key={l.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.line}>{l.label}</Text>
                    <Text style={[styles.line, { color: colors.text }]}>{l.xp > 0 ? `+${l.xp}` : l.xp} XP</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.overlaySub, { fontSize: 12 }]}>Added to today&apos;s missions and progress.</Text>
            </>
          )}
          <Button label="Back to Home" icon="arrow-right" onPress={() => leave('home')} style={{ marginTop: 18, alignSelf: 'stretch' }} />
          {summary.xp > 0 && (
            <Button label="See my progress" variant="secondary" size="md" onPress={() => router.dismissTo('/progress')} style={{ marginTop: 10, alignSelf: 'stretch' }} />
          )}
        </View>
      )}
    </View>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.primary }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function RoundBtn({ icon, label, onPress, size = 50 }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} accessibilityLabel={label} style={[styles.round, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon name={icon} size={size * 0.46} color={colors.text} />
    </Pressable>
  );
}

const glass = 'rgba(17,17,19,0.8)';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  stage: { position: 'absolute', left: 0, right: 0 },
  col: { flex: 1, paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  counter: { flexDirection: 'row', alignItems: 'center', backgroundColor: glass, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, paddingVertical: 12, paddingLeft: 12, paddingRight: 20, flexShrink: 1 },
  exName: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  count: { color: colors.text, fontFamily: fonts.display, fontSize: 30, lineHeight: 38 },
  setText: { color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  round: { backgroundColor: glass, borderWidth: 1, borderColor: colors.lineHi, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 10, backgroundColor: colors.imageChip, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  pillText: { color: colors.onImageSub, fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  tapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 },
  undo: { width: 52, height: 52, borderRadius: 26, backgroundColor: glass, borderWidth: 1, borderColor: colors.lineHi, alignItems: 'center', justifyContent: 'center' },
  repBtn: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  repPlus: { color: colors.onPrimary, fontFamily: fonts.display, fontSize: 34, lineHeight: 38 },
  repLbl: { color: colors.onPrimary, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  setDone: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: glass, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 22 },
  statLabel: { color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  div: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 16 },
  pauseRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: colors.secondary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.secondary, shadowOpacity: 0.7, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 12, backgroundColor: 'rgba(255,45,155,0.08)' },
  pauseInner: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#0B0B0D', alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,6,0.93)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: colors.primary, fontFamily: fonts.label, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  overlaySub: { color: colors.sub, fontFamily: fonts.medium, fontSize: 15, marginTop: 6, textAlign: 'center' },
  line: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13 },
});
