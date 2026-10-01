/**
 * CAMPUS AMBASSADOR — waitlist (POST /v1/ambassador/waitlist, api/campus/ambassadorWaitlist.ts).
 * Entry point: Profile → More.
 *
 * Four honest outcomes, never a fake one:
 *   editing      the form, pre-filled from what the app already knows (your email, campus)
 *   success      only after a real 2xx, or the server's 409 "already on the list"
 *   unavailable  "Ambassador waitlist · Not live yet" — the endpoint isn't built, so the form
 *                stays (layout kept) but Join is disabled and nothing is sent or saved
 *   error        real failures (offline, 401, 422, 5xx) with the answers kept and Try again
 */
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/art/Mascot';
import { errorKind, errorText, featureUnavailable } from '@/api/campus';
import { ambassadorWaitlistLive, joinAmbassadorWaitlist, YEARS_OF_STUDY, type YearOfStudy } from '@/api/campus/ambassadorWaitlist';
import type { Me } from '@/api/campus/types';
import { NotLiveYet } from '@/components/campus/States';
import { Button, Display, FadeIn, Header, Icon, Kicker, Label, tap } from '@/components/ui';
import { useConfig, useMe } from '@/hooks/useCampus';
import { isCollegeEmail, isEmail, normalizePhone } from '@/logic/profileValidation';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, gradients, MAX_WIDTH, radius } from '@/theme';

const FULL_NAME_MAX = 80;
const COLLEGE_MAX = 120;
const COURSE_MAX = 80;
const MOTIVATION_MAX = 500;
const INSTAGRAM_RE = /^[A-Za-z0-9._]{1,30}$/;

type Fields = {
  full_name: string;
  personal_email: string;
  college_email: string;
  phone: string;
  college: string;
  course: string;
  year_of_study: YearOfStudy | null;
  motivation: string;
  instagram: string;
};
type FieldKey = keyof Fields;
type Phase = { kind: 'editing' } | { kind: 'submitting' } | { kind: 'success'; alreadyListed: boolean } | { kind: 'error'; cause: unknown };

const LABELS: Record<FieldKey, string> = {
  full_name: 'Full name',
  personal_email: 'Personal email',
  college_email: 'College email (official)',
  phone: 'Phone number',
  college: 'College / campus',
  course: 'Course',
  year_of_study: 'Year of study',
  motivation: 'Why do you want to be a Campus Ambassador?',
  instagram: 'Instagram',
};

const hasLetter = (s: string) => /\p{L}/u.test(s);

/** Inline validation; the same email / phone rules as profile building (logic/profileValidation.ts). */
function validate(f: Fields, domains: string[]): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const name = f.full_name.trim();
  if (!name) e.full_name = 'Your full name is required.';
  else if (name.length < 2 || !hasLetter(name)) e.full_name = 'Enter your full name.';
  if (!f.personal_email.trim()) e.personal_email = 'Personal email is required.';
  else if (!isEmail(f.personal_email)) e.personal_email = 'That doesn’t look like an email address.';
  if (!f.college_email.trim()) e.college_email = 'College email is required.';
  else if (!isEmail(f.college_email)) e.college_email = 'That doesn’t look like an email address.';
  else if (!isCollegeEmail(f.college_email, domains)) e.college_email = domains.length ? `Use your official ${domains.map((d) => `@${d}`).join(' or ')} address.` : 'Use your official college (.ac.in) address.';
  if (!f.phone.trim()) e.phone = 'Phone number is required.';
  else if (!normalizePhone(f.phone)) e.phone = 'Enter a valid 10-digit mobile number.';
  if (f.college.trim().length < 2) e.college = f.college.trim() ? 'Enter your college or campus name.' : 'College / campus is required.';
  if (f.course.trim().length < 2) e.course = f.course.trim() ? 'Enter your course, e.g. BS-MS.' : 'Course is required.';
  if (!f.year_of_study) e.year_of_study = 'Pick your year of study.';
  if (f.motivation.length > MOTIVATION_MAX) e.motivation = `Keep it under ${MOTIVATION_MAX} characters.`;
  const ig = f.instagram.trim().replace(/^@/, '');
  if (ig && !INSTAGRAM_RE.test(ig)) e.instagram = 'Use letters, numbers, “.” or “_” (up to 30).';
  return e;
}

/** What the app already knows: your name, sign-in email, campus (and saved details, once that's live). */
function prefillFrom(me: Me | undefined, campusName: string | null): { fields: Fields; prefilled: Set<FieldKey> } {
  const d = me?.profile_details;
  const fields: Fields = {
    full_name: d?.full_name ?? me?.display_name ?? '',
    personal_email: d?.personal_email ?? '',
    college_email: d?.college_email ?? me?.email ?? '',
    phone: d?.phone?.replace(/^\+91/, '') ?? '',
    college: campusName ?? '',
    course: d?.course ?? '',
    year_of_study: null,
    motivation: '',
    instagram: '',
  };
  const prefilled = new Set((Object.keys(fields) as FieldKey[]).filter((k) => typeof fields[k] === 'string' && (fields[k] as string).length > 0));
  return { fields, prefilled };
}

export default function Ambassador() {
  const me = useMe();
  const config = useConfig();
  // Wait briefly for what we can pre-fill; a failed load just means an empty form.
  if ((!me.data && !me.error) || (!config.data && !config.error)) {
    return (
      <Shell>
        <Header back title="" />
        <View style={{ gap: 12, marginTop: 12 }}>
          <View style={[styles.skeleton, { height: 90 }]} />
          <View style={[styles.skeleton, { height: 260 }]} />
        </View>
      </Shell>
    );
  }
  const campus = config.data?.campus ?? null;
  return <Waitlist me={me.data} campusName={campus?.name ?? null} campusId={campus?.id ?? null} domains={campus?.email_domains ?? []} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={[styles.col, { paddingTop: insets.top + 8, flex: 1 }]}>{children}</View>
    </View>
  );
}

function Waitlist({ me, campusName, campusId, domains }: { me: Me | undefined; campusName: string | null; campusId: string | null; domains: string[] }) {
  const insets = useSafeAreaInsets();
  const { toast } = useApp();
  const [initial] = useState(() => prefillFrom(me, campusName));
  const [f, setF] = useState<Fields>(initial.fields);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
  // Unavailable: switched off in code, or the server said the route isn't there (404/405/501).
  const [live, setLive] = useState(ambassadorWaitlistLive);
  const scroll = useRef<ScrollView>(null);
  const refs = useRef<Partial<Record<FieldKey, TextInput | null>>>({});

  const errors = validate(f, domains);
  const errorOf = (k: FieldKey) => (attempted || touched.has(k) ? errors[k] : undefined);
  const set = (k: FieldKey) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const blur = (k: FieldKey) => () => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  const next = (k: FieldKey) => () => refs.current[k]?.focus();
  const submitting = phase.kind === 'submitting';

  const submit = async () => {
    if (!live) return;
    setAttempted(true);
    const count = Object.keys(errors).length;
    if (count) {
      tap();
      toast(`Check ${count} field${count > 1 ? 's' : ''} above`, 'alert-circle-outline', colors.coral);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setPhase({ kind: 'submitting' });
    try {
      const college = f.college.trim();
      const result = await joinAmbassadorWaitlist({
        full_name: f.full_name.trim().replace(/\s+/g, ' '),
        personal_email: f.personal_email.trim().toLowerCase(),
        college_email: f.college_email.trim().toLowerCase(),
        phone: normalizePhone(f.phone) as string,
        college,
        campus_id: campusId && college === campusName ? campusId : null,
        course: f.course.trim().replace(/\s+/g, ' '),
        year_of_study: f.year_of_study as YearOfStudy,
        motivation: f.motivation.trim() || null,
        instagram: f.instagram.trim().replace(/^@/, '') || null,
      });
      tap('success');
      setPhase({ kind: 'success', alreadyListed: result.alreadyListed });
    } catch (e) {
      if (featureUnavailable(e)) {
        // Not an error: the endpoint isn't there. Keep the answers, disable Join, say so.
        setLive(false);
        setPhase({ kind: 'editing' });
        scroll.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      setPhase({ kind: 'error', cause: e });
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); // show why, right above "Try again"
    }
  };

  if (phase.kind === 'success') return <SuccessState alreadyListed={phase.alreadyListed} />;

  const signIn = phase.kind === 'error' && errorKind(phase.cause) === 'unauthorized';
  const field = (k: FieldKey, props: TextInputProps & { required?: boolean; nextKey?: FieldKey; hint?: string }) => {
    const { required = true, nextKey, hint, ...input } = props;
    return (
      <Field label={LABELS[k]} required={required} error={errorOf(k)} hint={hint} prefilled={initial.prefilled.has(k) && f[k] === initial.fields[k]}>
        <TextInput
          ref={(r) => {
            refs.current[k] = r;
          }}
          value={f[k] as string}
          onChangeText={set(k)}
          onBlur={blur(k)}
          editable={!submitting}
          placeholderTextColor={colors.mute}
          returnKeyType={nextKey ? 'next' : 'done'}
          onSubmitEditing={nextKey ? next(nextKey) : undefined}
          blurOnSubmit={!nextKey}
          style={[styles.input, errorOf(k) && styles.inputError, !input.multiline && { height: 48 }, input.multiline && { minHeight: 96 }]}
          accessibilityLabel={`${LABELS[k]}${required ? ', required' : ', optional'}`}
          {...input}
        />
      </Field>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.col, { paddingTop: insets.top + 8, paddingBottom: 24 }]} showsVerticalScrollIndicator={false}>
        <Header back title="" />
        <Kicker color={colors.violet}>Campus Ambassador</Kicker>
        <Display size={36} style={{ marginTop: 4 }}>
          Rep your{'\n'}
          <Text style={{ color: colors.primary }}>campus</Text>
        </Display>
        <FadeIn>
          <View style={styles.intro}>
            <View style={{ flex: 1 }}>
              <Kicker>Waitlist</Kicker>
              <Text style={styles.introText}>Rep Squirrel Social{campusName ? ` at ${campusName}` : ' on your campus'}. We’re collecting interest through a waitlist; join it and we’ll reach out with next steps.</Text>
            </View>
            <Mascot pose="cheer" size={78} />
          </View>
        </FadeIn>

        {!live && (
          <View style={{ marginTop: 14 }}>
            <NotLiveYet name="Ambassador waitlist" compact body="Sign-ups aren’t being accepted yet, so Join is switched off and nothing you type here is sent or saved. Check back soon." />
          </View>
        )}
        {initial.prefilled.size > 0 && <Text style={styles.note}>We’ve filled in what the app already knows. Check it and complete the rest.</Text>}
        <Text style={styles.legend}>
          <Text style={{ color: colors.primary }}>*</Text> Required
        </Text>

        {field('full_name', { autoComplete: 'name', textContentType: 'name', autoCapitalize: 'words', maxLength: FULL_NAME_MAX, placeholder: 'As on your college ID', nextKey: 'personal_email' })}
        {field('personal_email', { keyboardType: 'email-address', autoComplete: 'email', textContentType: 'emailAddress', autoCapitalize: 'none', autoCorrect: false, maxLength: 254, placeholder: 'you@gmail.com', nextKey: 'college_email' })}
        {field('college_email', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false, maxLength: 254, placeholder: domains[0] ? `you@${domains[0]}` : 'you@college.ac.in', hint: 'The address your college gave you.', nextKey: 'phone' })}
        {field('phone', { keyboardType: 'phone-pad', autoComplete: 'tel', textContentType: 'telephoneNumber', maxLength: 16, placeholder: '98765 43210', hint: 'Indian mobile, +91 added for you.', nextKey: 'college' })}
        {field('college', { autoCapitalize: 'words', maxLength: COLLEGE_MAX, placeholder: 'e.g. IISER Kolkata', nextKey: 'course' })}
        {field('course', { autoCapitalize: 'words', maxLength: COURSE_MAX, placeholder: 'e.g. BS-MS' })}

        <Field label={LABELS.year_of_study} required error={errorOf('year_of_study')}>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {YEARS_OF_STUDY.map((y) => {
              const on = f.year_of_study === y;
              return (
                <Pressable
                  key={y}
                  disabled={submitting}
                  onPress={() => {
                    tap();
                    setF((x) => ({ ...x, year_of_study: y }));
                    blur('year_of_study')();
                  }}
                  style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.8 }]}
                  accessibilityRole="radio"
                  accessibilityLabel={y}
                  accessibilityState={{ selected: on, disabled: submitting }}>
                  <Text style={[styles.chipText, on && { color: colors.onPrimary }]}>{y}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {field('motivation', { required: false, multiline: true, maxLength: MOTIVATION_MAX + 50, placeholder: 'Your crew, your campus, your plan. A few lines is plenty.', textAlignVertical: 'top', hint: `${f.motivation.length}/${MOTIVATION_MAX}` })}
        {field('instagram', { required: false, autoCapitalize: 'none', autoCorrect: false, maxLength: 31, placeholder: '@yourhandle' })}

        {phase.kind === 'error' && (
          <View style={styles.errorCard} accessibilityLiveRegion="polite">
            <Icon name={errorKind(phase.cause) === 'offline' ? 'wifi-off' : 'cloud-off-outline'} size={20} color={colors.coral} />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Couldn’t send that</Text>
              <Text style={styles.errorBody}>{errorText(phase.cause)} Your answers are still here.</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Pinned above the keyboard and the home indicator, so it's always reachable. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.footerInner}>
          {signIn ? (
            <Button label="Sign in to continue" iconLeft="login" onPress={() => router.push('/sign-in')} />
          ) : !live ? (
            <Button label="Waitlist · Not live yet" iconLeft="lock-outline" disabled onPress={() => {}} accessibilityLabel="Join the waitlist. Not live yet, nothing is sent." />
          ) : (
            <Button
              label={submitting ? 'Sending…' : phase.kind === 'error' ? 'Try again' : 'Join the waitlist'}
              iconLeft={phase.kind === 'error' ? 'refresh' : 'send'}
              onPress={submit}
              disabled={submitting}
              accessibilityLabel={submitting ? 'Sending your details' : 'Join the Campus Ambassador waitlist'}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, required, error, hint, prefilled, children }: { label: string; required: boolean; error?: string; hint?: string; prefilled?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Label style={{ flexShrink: 1 }} color={colors.sub}>
          {label}
          {required && <Text style={{ color: colors.primary }}> *</Text>}
        </Label>
        {!required && <Text style={styles.optional}>Optional</Text>}
        {prefilled && (
          <View style={styles.fromProfile}>
            <Icon name="account-check-outline" size={11} color={colors.primary} />
            <Text style={styles.fromProfileText}>Pre-filled</Text>
          </View>
        )}
      </View>
      {children}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

function SuccessState({ alreadyListed }: { alreadyListed: boolean }) {
  return (
    <Shell>
      <View style={styles.center}>
        <FadeIn>
          <Mascot pose="celebrate" size={150} animated />
        </FadeIn>
        <FadeIn delay={120}>
          <Display size={38} style={{ textAlign: 'center', marginTop: 10 }}>
            {alreadyListed ? 'Already on the list' : 'You’re on the list'}
          </Display>
        </FadeIn>
        <FadeIn delay={220}>
          <Text style={styles.centerBody}>We’ll reach out with the next steps for Campus Ambassadors.</Text>
          <View style={styles.received}>
            <Icon name="check-circle" size={16} color={colors.onPrimary} />
            <Text style={styles.receivedText}>{alreadyListed ? 'On the waitlist' : 'Added to the waitlist'}</Text>
          </View>
        </FadeIn>
        <Button label="Back to profile" variant="secondary" size="md" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} style={{ alignSelf: 'stretch', marginTop: 26 }} />
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  skeleton: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14 },
  introText: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 6 },
  note: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 12 },
  legend: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, marginTop: 14, textTransform: 'uppercase' },
  field: { marginTop: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' },
  optional: { color: colors.mute, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  fromProfile: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.lineHi, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  fromProfileText: { color: colors.dim, fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.text, fontFamily: fonts.regular, fontSize: 15, minHeight: 48 },
  inputError: { borderColor: colors.coral },
  error: { color: colors.coral, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, marginTop: 6 },
  hint: { color: colors.mute, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 13 },
  errorCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 18, backgroundColor: alpha(colors.coral, 0.06), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.coral, padding: 12 },
  errorTitle: { color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.8, textTransform: 'uppercase' },
  errorBody: { color: colors.sub, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  footer: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg2, paddingTop: 10, paddingHorizontal: 16 },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH - 32, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingBottom: 40 },
  centerBody: { color: colors.sub, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  received: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 18, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  receivedText: { color: colors.onPrimary, fontFamily: fonts.label, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' },
});
