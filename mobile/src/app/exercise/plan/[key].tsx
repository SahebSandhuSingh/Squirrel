import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { SceneImage } from '@/components/cards';
import { exerciseApi, type CreatedSession } from '@/api/exercise';
import { RemoteStatus, Stepper } from '@/components/ExerciseParts';
import { Button, Card, Display, EmptyState, FadeIn, Header, Icon, Kicker, Screen, Tag, tap } from '@/components/ui';
import { exerciseByKey, PLAN_BOUNDS } from '@/data/exercises';
import { invalidateExercise, useExerciseCatalog, useExerciseSkill, useExerciseUser } from '@/hooks/useExercise';
import { colors, fonts, radius } from '@/theme';

/** Plan one exercise and save it as a session (POST /api/users/{id}/sessions). */
export default function PlanExercise() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const ex = exerciseByKey(String(key));
  const user = useExerciseUser();
  const catalog = useExerciseCatalog();
  const skill = useExerciseSkill(user?.user_id);
  const unit = ex?.measure === 'time' ? PLAN_BOUNDS.time : PLAN_BOUNDS.reps;
  const [sets, setSets] = useState<number>(PLAN_BOUNDS.sets.value);
  const [value, setValue] = useState<number>(unit.value);
  const [rest, setRest] = useState<number>(PLAN_BOUNDS.rest.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSession | null>(null);

  if (!ex || !user) {
    return (
      <Screen tabBar={false}>
        <Header back title="Plan" />
        <EmptyState title={!ex ? 'Unknown exercise' : 'No coach profile'} body={!ex ? 'This exercise is not in the library.' : 'Create a coach profile first.'} action="Back to coach" onAction={() => router.replace('/exercise')} />
      </Screen>
    );
  }

  const avail = catalog.data?.find((c) => c.id === ex.slug);
  const enabled = avail?.status === 'enabled';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await exerciseApi.createSession(user.user_id, {
        name: ex.name,
        slug: ex.slug,
        ...(ex.variant ? { variant: ex.variant } : {}),
        body_part: ex.bodyPart,
        training_tag: ex.tag,
        measure: ex.measure,
        sets,
        value,
        rest_seconds: sets > 1 ? rest : 0,
      });
      tap('success');
      invalidateExercise(user.user_id);
      setCreated(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the session.');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const target = created.target.type === 'reps' ? `${created.target.value} reps` : `${Math.round(created.target.value_ms / 1000)} s`;
    return (
      <Screen tabBar={false}>
        <Header back title="Session saved" />
        <FadeIn>
          <Card glow={colors.green}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Mascot pose="celebrate" size={90} animated />
              <View style={{ flex: 1 }}>
                <Kicker color={colors.green}>Saved on the server</Kicker>
                <Display size={26} style={{ marginTop: 4 }}>{created.exercise_name}</Display>
                <Text style={styles.meta}>
                  {created.sets} × {target}
                  {created.variant ? ` · ${created.variant} arm` : ''}
                  {created.sets > 1 ? ` · ${created.rest_seconds}s rest` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.mono}>Session {created.session_id}</Text>
          </Card>
        </FadeIn>
        <View style={styles.notice}>
          <Icon name="camera-off" size={18} color={colors.dim} />
          <Text style={styles.noticeText}>
            Live rep tracking uses the camera coach, which streams body-pose data to the server. The phone app can’t track pose yet, so train this session in the
            Exercise Mechanics web coach. Your scores and report appear here afterwards.
          </Text>
        </View>
        <Button label="View session" icon="arrow-right" onPress={() => router.replace({ pathname: '/exercise/session/[id]', params: { id: created.session_id } })} style={{ marginTop: 16 }} />
        <Button label="Back to coach" variant="secondary" size="md" onPress={() => router.back()} style={{ marginTop: 10 }} />
      </Screen>
    );
  }

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <SceneImage kind={ex.scene} seed={ex.key.length * 3} height={150}>
        <View style={{ position: 'absolute', left: 16, bottom: 14, right: 16 }}>
          <Kicker color={colors.onImage}>{ex.bodyPart.includes(ex.tag) ? ex.bodyPart : `${ex.bodyPart} · ${ex.tag}`}</Kicker>
          <Display size={34} color={colors.onImage}>{ex.name}</Display>
        </View>
      </SceneImage>
      <Text style={styles.blurb}>{ex.blurb}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {skill.data && <Tag label={`Skill: ${skill.data.skill_level}`} icon="account" color={colors.primary} />}
        {avail && <Tag label={`${avail.view} camera view`} icon="camera-outline" color={colors.dim} />}
      </View>

      <RemoteStatus loading={catalog.loading} error={catalog.error} hasData={!!catalog.data} onRetry={catalog.reload} label="availability" />
      {catalog.data && !enabled && (
        <Card style={{ marginTop: 14 }}>
          <Text style={styles.meta}>{avail ? 'This exercise is planned but not live on the coach yet.' : 'The server does not list this exercise.'}</Text>
        </Card>
      )}

      <View style={{ marginTop: 14 }}>
        <Stepper label="Sets" value={sets} min={PLAN_BOUNDS.sets.min} max={PLAN_BOUNDS.sets.max} step={1} onChange={setSets} />
        <Stepper
          label={ex.measure === 'reps' ? 'Reps per set' : 'Seconds per set'}
          value={value}
          unit={ex.measure === 'reps' ? 'reps' : 's'}
          min={unit.min}
          max={unit.max}
          step={unit.step}
          onChange={setValue}
        />
        {sets > 1 && <Stepper label="Rest between sets" value={rest} unit="s" min={PLAN_BOUNDS.rest.min} max={PLAN_BOUNDS.rest.max} step={PLAN_BOUNDS.rest.step} onChange={setRest} />}
      </View>

      {error && (
        <View style={[styles.notice, { borderColor: 'rgba(255,77,77,0.4)' }]}>
          <Icon name="alert-circle-outline" size={18} color={colors.coral} />
          <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
        </View>
      )}
      <Button label={busy ? 'Saving…' : 'Save session'} icon="arrow-right" disabled={busy || !enabled} onPress={save} style={{ marginTop: 18 }} />
      <Text style={[styles.meta, { marginTop: 10, textAlign: 'center' }]}>The coach runs one exercise per session for now.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blurb: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 12 },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, marginTop: 4 },
  mono: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 12 },
  notice: { flexDirection: 'row', gap: 10, marginTop: 14, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
  noticeText: { flex: 1, color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
