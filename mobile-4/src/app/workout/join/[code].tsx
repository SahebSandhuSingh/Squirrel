/**
 * JOIN A SHARED WORKOUT — where an invite link lands (squirrelsocial://workout/join/{code}, or
 * /w/{code} on the web). Shows who invited you and the exercise, then Join → the session.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { errorKind, errorText, featureUnavailable } from '@/api/campus';
import type { SharedWorkoutSession } from '@/api/campus/types';
import { sharedWorkoutApi } from '@/api/sharedWorkout';
import { LoadingRows } from '@/components/campus/States';
import { ExerciseHeader, Participants, seatOf, SharedEnded, SharedTag } from '@/components/workout/SharedWorkout';
import { Button, Display, Header, Screen, tap } from '@/components/ui';
import { EXERCISE_LIBRARY } from '@/data/exercises';
import { useMe } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { colors } from '@/theme';

export default function JoinSharedWorkout() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useMe();
  const meId = me.data?.user_id ?? null;
  const { toast } = useApp();
  const [s, setS] = useState<SharedWorkoutSession | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [joining, setJoining] = useState(false);
  const home = () => router.replace('/home');

  useEffect(() => {
    let off = false;
    sharedWorkoutApi.previewInvite(code).then((x) => !off && setS(x), (e) => !off && setError(e));
    return () => {
      off = true;
    };
  }, [code]);

  // Already part of it (e.g. the host opened their own link): go straight in.
  const mine = !!s && !!meId && (s.host.user.user_id === meId || s.partner?.user.user_id === meId);
  useEffect(() => {
    if (mine && s) router.replace({ pathname: '/workout/[id]', params: { id: s.session_id } });
  }, [mine, s]);

  const join = async () => {
    tap('impact');
    setJoining(true);
    try {
      const joined = await sharedWorkoutApi.join(code);
      router.replace({ pathname: '/workout/[id]', params: { id: joined.session_id } });
    } catch (e) {
      setJoining(false);
      toast(errorText(e), 'alert-circle-outline', colors.coral);
    }
  };

  const ex = s ? EXERCISE_LIBRARY.find((e) => e.key === s.exercise.key) : undefined;
  const host = s?.host.user.display_name.split(' ')[0] ?? 'Someone';

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      {error ? (
        <SharedEnded kind={featureUnavailable(error) ? 'unavailable' : errorKind(error) === 'not_found' ? 'not_found' : 'error'} detail={featureUnavailable(error) || errorKind(error) === 'not_found' ? undefined : errorText(error)} primary="Back to Home" onPrimary={home} />
      ) : !s ? (
        <LoadingRows rows={3} height={84} />
      ) : s.status === 'expired' ? (
        <SharedEnded kind="expired" primary="Back to Home" onPrimary={home} />
      ) : s.status === 'completed' || s.status === 'cancelled' ? (
        <SharedEnded kind="already_completed" primary="Back to Home" onPrimary={home} />
      ) : s.partner && !mine ? (
        <SharedEnded kind="error" detail="This session already has two people." primary="Back to Home" onPrimary={home} />
      ) : (
        <View style={{ gap: 16 }}>
          <SharedTag status="invite" />
          <Display size={36}>{host} wants to{'\n'}work out with you</Display>
          <ExerciseHeader name={s.exercise.name} icon={ex?.icon} blurb={ex?.blurb} plan={s.exercise.target != null ? `${s.exercise.target} reps · together` : undefined} />
          <Participants you={{ ...seatOf(null, 'You'), person: me.data ?? null }} partner={{ ...seatOf(s.host, 'Host') }} />
          <Button label={joining ? 'Joining…' : 'Join workout'} icon="arrow-right" disabled={joining || !meId} onPress={join} />
          {!meId && <Button label="Sign in to join" variant="secondary" size="md" onPress={() => router.push('/sign-in')} />}
        </View>
      )}
    </Screen>
  );
}
