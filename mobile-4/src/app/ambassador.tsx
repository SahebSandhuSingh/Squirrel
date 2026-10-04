/**
 * BECOME A SQUIRREL AMBASSADOR (Dev A). The form's fields come from the backend — the app never
 * invents one — and once you've applied, you see your status instead of the form.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { errorText } from '@/api/campus';
import { applyAmbassador, getAmbassador } from '@/api/campus/community';
import type { AmbassadorApplication, AmbassadorField, AmbassadorState, AmbassadorStatus } from '@/api/campus/types';
import { ErrorState, LoadingRows, SourceBadge } from '@/components/campus/States';
import { shortTime } from '@/components/campus/territoryUi';
import { Button, Card, Display, Header, Icon, Kicker, Screen, tap } from '@/components/ui';
import { invalidateCampus, useCampus, useConfig } from '@/hooks/useCampus';
import { alpha, colors, fonts, radius } from '@/theme';

const STATUS: Record<AmbassadorStatus, { label: string; line: string; color: string; icon: React.ComponentProps<typeof Icon>['name']; step: number }> = {
  pending: { label: 'Pending', line: 'Your application is in the nest.', color: colors.violet, icon: 'progress-clock', step: 1 },
  under_review: { label: 'Under review', line: 'The team is reading it now.', color: colors.violet, icon: 'eye-outline', step: 2 },
  approved: { label: 'Approved', line: 'Welcome to the crew behind the crew.', color: colors.primary, icon: 'check-decagram', step: 3 },
  rejected: { label: 'Not this time', line: 'Thanks for putting your hand up. Keep moving — there’ll be another round.', color: colors.dim, icon: 'close-circle-outline', step: 3 },
};

export default function Ambassador() {
  const config = useConfig();
  const r = useCampus<AmbassadorState>('ambassador', () => getAmbassador());
  const [justApplied, setJustApplied] = useState<AmbassadorApplication | null>(null);
  const campus = config.data?.campus.name ?? 'your campus';
  const app = justApplied ?? r.data?.application ?? null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tabBar={false}>
        <Header back title="" right={<SourceBadge />} />
        <Kicker color={colors.violet}>Ambassador programme</Kicker>
        <Display size={36} style={{ marginTop: 4 }}>
          Become a{'\n'}
          <Text style={{ color: colors.primary }}>Squirrel ambassador</Text>
        </Display>
        <Text style={styles.lead}>Help grow the Squirrel Social campus at {campus}.</Text>

        {r.error && !r.data ? (
          <ErrorState cause={r.cause} onRetry={r.reload} feature="Ambassador applications" />
        ) : !r.data ? (
          <LoadingRows rows={4} height={64} style={{ marginTop: 18 }} />
        ) : app ? (
          <StatusView app={app} fresh={!!justApplied} />
        ) : !r.data.open ? (
          <Card style={styles.center}>
            <Icon name="door-closed" size={28} color={colors.dim} />
            <Text style={styles.cardTitle}>Applications are closed</Text>
            <Text style={styles.body}>{r.data.closed_reason ?? 'Check back soon — new rounds open through the year.'}</Text>
          </Card>
        ) : (
          <ApplyForm
            fields={r.data.fields}
            onApplied={(a) => {
              setJustApplied(a);
              invalidateCampus('ambassador');
            }}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function ApplyForm({ fields, onApplied }: { fields: AmbassadorField[]; onApplied: (a: AmbassadorApplication) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.prefill ?? ''])));
  const [key] = useState(() => `ambassador:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const missing = fields.filter((f) => f.required && !(answers[f.key] ?? '').trim());
  const submit = async () => {
    tap('impact');
    setSending(true);
    setError(null);
    try {
      // Send only the fields the backend asked for.
      const body = Object.fromEntries(fields.map((f) => [f.key, (answers[f.key] ?? '').trim()]).filter(([, v]) => v));
      const a = await applyAmbassador(body, key);
      tap('success');
      onApplied(a);
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  };
  return (
    <View style={{ gap: 14, marginTop: 18 }}>
      {fields.map((f) => (
        <View key={f.key} style={{ gap: 6 }}>
          <View style={styles.labelRow}>
            <Text style={styles.label} nativeID={`amb-${f.key}`}>
              {f.label}
              {f.required ? <Text style={{ color: colors.secondary }}> *</Text> : <Text style={styles.optional}> · optional</Text>}
            </Text>
            {f.max_length != null && f.type !== 'select' && <Text style={styles.count}>{(answers[f.key] ?? '').length}/{f.max_length}</Text>}
          </View>
          {f.type === 'select' && f.options?.length ? (
            <View style={styles.options}>
              {f.options.map((o) => {
                const on = answers[f.key] === o;
                return (
                  <Pressable key={o} onPress={() => { tap(); setAnswers((a) => ({ ...a, [f.key]: o })); }} style={[styles.option, on && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Text style={[styles.optionText, on && { color: colors.primary }]}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput
              value={answers[f.key] ?? ''}
              onChangeText={(t) => setAnswers((a) => ({ ...a, [f.key]: t }))}
              placeholder={f.placeholder ?? ''}
              placeholderTextColor={colors.mute}
              maxLength={f.max_length ?? undefined}
              multiline={f.type === 'multiline'}
              style={[styles.input, f.type === 'multiline' && styles.multi]}
              accessibilityLabel={f.label}
              accessibilityLabelledBy={`amb-${f.key}`}
              autoCapitalize={f.key === 'handle' ? 'none' : 'sentences'}
            />
          )}
        </View>
      ))}
      {!!error && <Text style={styles.err} accessibilityLiveRegion="polite">{errorText(error)}</Text>}
      <Button label={sending ? 'Applying…' : 'Apply now'} icon="arrow-right" disabled={sending || missing.length > 0} onPress={submit} />
      {missing.length > 0 && <Text style={styles.hint}>Fill in {missing.map((f) => f.label.toLowerCase()).join(', ')} to apply.</Text>}
    </View>
  );
}

function StatusView({ app, fresh }: { app: AmbassadorApplication; fresh: boolean }) {
  const s = STATUS[app.status] ?? STATUS.pending;
  const steps = ['Submitted', 'Under review', 'Decision'];
  return (
    <>
      {fresh && (
        <Card style={[styles.center, { borderColor: alpha(colors.primary, 0.45) }]}>
          <Mascot pose="celebrate" size={96} animated />
          <Display size={26} style={{ textAlign: 'center' }}>Application received</Display>
          <Text style={styles.body}>You’ve officially entered the nest.</Text>
        </Card>
      )}
      <Text style={styles.section}>Application status</Text>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={s.icon} size={24} color={s.color} />
          <Text style={[styles.status, { color: s.color }]}>{s.label}</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.count}>Sent {shortTime(app.submitted_at)}</Text>
        </View>
        <View style={styles.track} accessibilityLabel={`Step ${s.step} of 3: ${steps[s.step - 1]}`}>
          {steps.map((label, i) => (
            <View key={label} style={{ flex: 1, gap: 4 }}>
              <View style={[styles.seg, { backgroundColor: i < s.step ? s.color : colors.line }]} />
              <Text style={[styles.stepText, i < s.step && { color: colors.sub }]}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.body}>{app.message ?? s.line}</Text>
      </Card>
      {app.status === 'approved' && <Button label="Open your campus" variant="secondary" iconLeft="map-marker-radius" onPress={() => router.push('/explore')} style={{ marginTop: 14 }} />}
    </>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.sub, fontFamily: fonts.medium, fontSize: 15, marginTop: 8 },
  center: { marginTop: 18, alignItems: 'center', gap: 8, paddingVertical: 20 },
  cardTitle: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 0.8, textTransform: 'uppercase' },
  body: { color: colors.dim, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  label: { flex: 1, color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
  optional: { color: colors.mute, fontFamily: fonts.label, fontSize: 13, textTransform: 'none' },
  count: { color: colors.mute, fontFamily: fonts.mono, fontSize: 11 },
  input: { color: colors.text, fontFamily: fonts.regular, fontSize: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11 },
  multi: { minHeight: 96, textAlignVertical: 'top' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  optionOn: { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) },
  optionText: { color: colors.sub, fontFamily: fonts.label, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  hint: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  section: { color: colors.dim, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  status: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.4, textTransform: 'uppercase' },
  track: { flexDirection: 'row', gap: 6 },
  seg: { height: 4, borderRadius: 2 },
  stepText: { color: colors.mute, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
});
