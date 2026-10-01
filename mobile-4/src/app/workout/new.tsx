/**
 * WORKOUT WITH PARTNER — create a shared session for the exercise you picked, then share the
 * invite from the session screen. Rep-based exercises only (it's a rep race).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { featureUnavailable } from '@/api/campus';
import { sharedWorkoutApi } from '@/api/sharedWorkout';
import { ExerciseHeader, SharedEnded, SharedTag } from '@/components/workout/SharedWorkout';
import { Button, Display, Header, Icon, Screen, tap } from '@/components/ui';
import { EXERCISE_LIBRARY, PLAN_BOUNDS } from '@/data/exercises';
import { colors, fonts } from '@/theme';

const STEPS: [React.ComponentProps<typeof Icon>['name'], string][] = [
  ['share-variant', 'Invite your workout buddy'],
  ['check-circle-outline', 'Both tap “I’m ready”'],
  ['timer-outline', 'A shared countdown starts you together'],
  ['account-multiple', 'See each other’s reps live'],
];

export default function NewSharedWorkout() {
  const { exercise } = useLocalSearchParams<{ exercise?: string }>();
  const ex = EXERCISE_LIBRARY.find((e) => e.key === exercise);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (!ex) {
    return (
      <Screen tabBar={false}>
        <Header back title="" />
        <SharedEnded kind="not_found" detail="Pick an exercise first, then choose Workout with partner." primary="Choose an exercise" onPrimary={() => router.replace('/exercise/select')} />
      </Screen>
    );
  }
  const target = ex.measure === 'reps' ? PLAN_BOUNDS.reps.value : null;

  const create = async () => {
    tap('impact');
    setCreating(true);
    setError(null);
    try {
      const s = await sharedWorkoutApi.create({ key: ex.key, target, sets: 1 });
      router.replace({ pathname: '/workout/[id]', params: { id: s.session_id } });
    } catch (e) {
      setError(e);
      setCreating(false);
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      {error && featureUnavailable(error) ? (
        <SharedEnded kind="unavailable" primary="Train solo instead" onPrimary={() => router.replace('/exercise/select')} secondary="Back" onSecondary={back} />
      ) : (
        <View style={{ gap: 16 }}>
          <SharedTag />
          <Display size={38}>
            Workout with{'\n'}
            <Text style={{ color: colors.primary }}>a partner</Text>
          </Display>
          <ExerciseHeader name={ex.name} blurb={ex.blurb} icon={ex.icon} plan={target != null ? `${target} reps · together` : 'Timed · together'} />
          {ex.measure !== 'reps' ? (
            <Text style={styles.note}>Shared workouts are rep races — pick a rep-based exercise.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {STEPS.map(([icon, text], i) => (
                <View key={text} style={styles.step}>
                  <Text style={styles.stepN}>{i + 1}</Text>
                  <Icon name={icon} size={18} color={colors.secondary} />
                  <Text style={styles.stepText}>{text}</Text>
                </View>
              ))}
            </View>
          )}
          {!!error && <Text style={styles.err}>Couldn’t create the session. Try again.</Text>}
          <Button label={creating ? 'Creating…' : 'Create shared session'} icon="arrow-right" disabled={creating || ex.measure !== 'reps'} onPress={create} />
          <Button label="Train solo instead" variant="ghost" size="md" onPress={() => router.replace('/exercise/select')} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepN: { width: 22, color: colors.mute, fontFamily: fonts.display, fontSize: 20 },
  stepText: { flex: 1, color: colors.sub, fontFamily: fonts.medium, fontSize: 14 },
  note: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13 },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
});
