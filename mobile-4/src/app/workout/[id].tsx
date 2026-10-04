/**
 * SHARED WORKOUT SESSION — waiting room → ready → shared countdown → rep race → done.
 * The phase comes from the server's session (derivePhase); the countdown is aligned to the
 * server clock so both phones start together. Your reps are yours (you tap them) and are
 * reported up; your partner's only ever come from the backend.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { errorText } from '@/api/campus';
import { ActiveShared, Countdown, InvitePanel, Participants, ReadyButton, seatOf, SharedComplete, SharedEnded, SharedTag, WaitingForPartner, ExerciseHeader } from '@/components/workout/SharedWorkout';
import { Header, Screen, tap } from '@/components/ui';
import { LoadingRows } from '@/components/campus/States';
import { EXERCISE_LIBRARY, estimateKcal } from '@/data/exercises';
import { useMe } from '@/hooks/useCampus';
import { derivePhase, useSharedWorkout } from '@/hooks/useSharedWorkout';
import { useApp } from '@/state/AppState';
import { colors, fonts } from '@/theme';

export default function SharedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const meId = me.data?.user_id ?? null;
  const w = useSharedWorkout(id, meId);
  const { toast, completeExercise } = useApp();
  const [myReps, setMyReps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [xp, setXp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const startedAt = useRef<number | null>(null);

  const s = w.session;
  const phase = derivePhase(s, meId, w.serverNow, finished, w.loadError);
  const lost = w.conn === 'lost' && (phase === 'waiting' || phase === 'lobby' || phase === 'countdown' || phase === 'active');
  const ex = s ? EXERCISE_LIBRARY.find((e) => e.key === s.exercise.key) : undefined;
  const partnerName = w.partner?.user.display_name.split(' ')[0] ?? 'Partner';
  const home = () => router.replace('/home');

  useEffect(() => {
    if (phase === 'active' && startedAt.current == null) startedAt.current = Date.now();
  }, [phase]);

  // Leaving mid-session (back gesture / hardware back) asks first, then tells the server.
  const navigation = useNavigation();
  const inSession = phase === 'waiting' || phase === 'lobby' || phase === 'countdown' || phase === 'active';
  const inSessionRef = useRef(inSession);
  useEffect(() => {
    inSessionRef.current = inSession;
  });
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!inSessionRef.current) return;
        e.preventDefault();
        tap();
        setConfirmExit(true);
        toast('Tap Exit again to leave the shared workout', 'exit-run', colors.gold);
      }),
    [navigation, toast],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(errorText(e), 'alert-circle-outline', colors.coral);
    } finally {
      setBusy(false);
    }
  };
  const exit = () => {
    if (!confirmExit) {
      tap();
      setConfirmExit(true);
      toast('Tap Exit again to leave the shared workout', 'exit-run', colors.gold);
      return;
    }
    void run(async () => {
      await w.leave();
      inSessionRef.current = false;
    });
  };
  const addRep = (d: number) => {
    const next = Math.max(0, myReps + d);
    if (next === myReps) return;
    tap(d > 0 ? 'impact' : 'select');
    setMyReps(next);
    w.reportReps(next);
  };
  const finish = () =>
    run(async () => {
      await w.complete(myReps);
      setFinished(true);
      tap('success');
      // Your reps feed XP and missions exactly like a solo workout (same app rules, no new maths).
      if (ex && myReps > 0) {
        const secs = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : myReps * 3;
        setXp(completeExercise({ key: ex.key, slug: ex.slug, reps: myReps, timedSeconds: 0, activeSeconds: secs, kcal: estimateKcal(ex, secs) }).xp);
      }
    });

  const you = seatOf(w.me, 'You');
  const partner = seatOf(w.partner, 'Partner');

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      {lost ? (
        <SharedEnded kind="connection_lost" primary="Try to reconnect" onPrimary={w.reload} secondary="Leave" onSecondary={home} />
      ) : phase === 'loading' ? (
        <View style={{ gap: 12 }}>
          <SharedTag status="connecting" />
          <LoadingRows rows={3} height={84} />
        </View>
      ) : phase === 'unavailable' || phase === 'not_found' || phase === 'error' ? (
        <SharedEnded kind={phase} detail={phase === 'error' ? errorText(w.loadError) : undefined} primary={phase === 'error' ? 'Try again' : 'Back to Home'} onPrimary={phase === 'error' ? w.reload : home} secondary={phase === 'unavailable' ? 'Train solo' : undefined} onSecondary={() => router.replace('/exercise/select')} />
      ) : phase === 'expired' || phase === 'you_left' || phase === 'already_completed' || phase === 'partner_left_before_start' ? (
        <SharedEnded kind={phase} primary="New shared session" onPrimary={() => router.replace({ pathname: '/workout/new', params: { exercise: s?.exercise.key ?? '' } })} secondary="Back to Home" onSecondary={home} />
      ) : phase === 'partner_left_during' ? (
        <SharedEnded kind="partner_left_during" detail={`${partnerName} left. You did ${myReps} reps — finish them solo or wrap up.`} primary={myReps > 0 ? 'Save my reps' : 'Back to Home'} onPrimary={myReps > 0 ? finish : home} secondary="Back to Home" onSecondary={home} />
      ) : phase === 'complete' ? (
        <SharedComplete myReps={myReps || (w.me?.reps ?? 0)} partnerReps={w.partner?.reps ?? null} partnerName={partnerName} partnerStillGoing={!!w.partner && !w.partner.finished_at && s?.status !== 'completed'} xp={xp} onHome={home} onProgress={() => router.replace('/progress')} />
      ) : phase === 'countdown' ? (
        <View style={{ gap: 14 }}>
          <SharedTag status="starting" />
          <Participants you={you} partner={partner} />
          <Countdown seconds={w.secondsToStart ?? 0} />
        </View>
      ) : phase === 'active' && s ? (
        <ActiveShared exercise={s.exercise.name} target={s.exercise.target} myReps={myReps} partnerReps={w.partner?.reps ?? null} partnerName={partnerName} conn={w.conn} paused={paused} onRep={() => addRep(1)} onUndo={() => addRep(-1)} onPause={() => setPaused((p) => !p)} onFinish={finish} onExit={exit} />
      ) : s ? (
        <View style={{ gap: 16 }}>
          <SharedTag status={phase === 'waiting' ? 'waiting' : 'lobby'} />
          <ExerciseHeader name={s.exercise.name} icon={ex?.icon} blurb={ex?.blurb} plan={s.exercise.target != null ? `${s.exercise.target} reps · together` : undefined} />
          <Participants you={you} partner={partner} />
          {phase === 'waiting' && w.me?.role === 'host' && (
            <>
              <WaitingForPartner />
              <InvitePanel url={s.invite_url} code={s.invite_code} exerciseName={s.exercise.name} />
            </>
          )}
          {phase === 'lobby' && <ReadyButton ready={!!w.me?.ready} busy={busy} onToggle={() => run(() => w.setReady(!w.me?.ready))} />}
          <ExitLink onExit={exit} confirm={confirmExit} />
        </View>
      ) : null}
    </Screen>
  );
}

/** A quiet "leave" link under the lobby (two taps, so it's never accidental). */
function ExitLink({ onExit, confirm }: { onExit: () => void; confirm: boolean }) {
  return (
    <Text onPress={onExit} accessibilityRole="button" style={{ alignSelf: 'center', color: confirm ? colors.coral : colors.dim, fontFamily: fonts.medium, fontSize: 13, paddingVertical: 8 }}>
      {confirm ? 'Tap again to leave the session' : 'Leave session'}
    </Text>
  );
}
