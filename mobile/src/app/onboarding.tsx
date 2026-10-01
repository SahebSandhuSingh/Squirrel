/**
 * ONBOARDING: wingman intro → About you (profile details: 7 compulsory fields, CGPA optional) →
 * "What are you looking for?" (Date / Friends / Crew) → hostel → Open to Meet → saved to the
 * profile (PATCH /v1/me, with `profile_details`). Date can be picked as a preference even
 * while Date Mode is locked; the Date Mode screens stay behind the backend's safety gate.
 *
 * Saving `profile_details` has no backend yet (capability 'profileDetails'): while it's
 * unavailable, "About you" shows "Not live yet" instead of collecting details it can't store,
 * and Finish saves everything else (mode, hostel, onboarding done) — PATCH /v1/me itself is live.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { campusApi, errorKind, errorText, featureUnavailable, isEndpointAvailable, type ConnectionMode, type Me } from '@/api/campus';
import { OpenToMeetToggle } from '@/components/campus/Social';
import { DEFAULT_COURSES, ProfileDetailsForm } from '@/components/profile/ProfileDetailsForm';
import { useAuth } from '@/auth/AuthProvider';
import { isComplete, normalizePhone, validateDetails, type DetailsForm } from '@/logic/profileValidation';
import { ErrorState, NotLiveYet } from '@/components/campus/States';
import { Button, Display, FadeIn, Header, Icon, Kicker, PressScale, ProgressBar, Screen, Tagline, tap } from '@/components/ui';
import { invalidateCampus, useAction, useConfig, useHostelOptions, useMe } from '@/hooks/useCampus';
import { alpha, colors, fonts, radius } from '@/theme';

const MODES: { id: ConnectionMode; title: string; line: string; body: string; icon: React.ComponentProps<typeof Icon>['name']; color: string }[] = [
  { id: 'friends', title: 'Friends', line: 'Find your people', body: 'Meet people who run your routes and hang in your zones.', icon: 'account-heart', color: colors.primary },
  { id: 'crew', title: 'Crew', line: 'Squad up', body: 'Join a crew, hold territory together, win hostel battles.', icon: 'account-group', color: colors.blue },
  { id: 'date', title: 'Date', line: 'Move first, then meet', body: 'Activity-first dating — never photo-first. Opens behind a safety gate.', icon: 'heart-multiple', color: colors.secondary },
];

const STEPS = 5;

export default function Onboarding() {
  const config = useConfig();
  const me = useMe();
  const zones = useHostelOptions();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [hostel, setHostel] = useState<string | null>(null);
  const auth = useAuth();
  const domains = config.data?.campus.email_domains ?? [];
  const courses = config.data?.campus.courses?.length ? config.data.campus.courses : DEFAULT_COURSES;
  const [details, setDetails] = useState<DetailsForm | null>(null);
  const saved = me.data?.profile_details;
  // Prefill from anything already known (a saved profile, or the college email you signed in with).
  const form: DetailsForm = details ?? {
    full_name: saved?.full_name ?? '',
    personal_email: saved?.personal_email ?? '',
    college_email: saved?.college_email ?? auth.email ?? me.data?.email ?? '',
    phone: saved?.phone?.replace(/^\+91/, '') ?? '',
    gender: saved?.gender ?? '',
    age: saved?.age != null ? String(saved.age) : '',
    course: saved?.course ?? '',
    cgpa: saved?.cgpa != null ? String(saved.cgpa) : '',
  };
  const detailErrors = validateDetails(form, domains); // cheap; recomputed each render
  const [showAllErrors, setShowAllErrors] = useState(false);
  const missing = Object.keys(detailErrors).length;
  // Built but not deployed (404 no_route / 501) is found out at save time: save the rest, say so.
  const [detailsLive, setDetailsLive] = useState(() => isEndpointAvailable('profileDetails'));
  const save = useAction(async (patch: Parameters<typeof campusApi.updateMe>[0]) => {
    try {
      return await campusApi.updateMe(patch);
    } catch (e) {
      if (patch.profile_details === undefined || !featureUnavailable(e)) throw e; // real errors stay real
      setDetailsLive(false);
      const { profile_details: _unsaved, ...rest } = patch;
      return campusApi.updateMe(rest);
    }
  });
  const dateGate = config.data?.features.date_mode;
  const hostels = zones.list;
  const chosenMode = mode ?? me.data?.connection_mode ?? null;
  const chosenHostel = hostel ?? me.data?.hostel_zone_id ?? null;

  const next = () => {
    tap();
    setStep((s) => Math.min(STEPS - 1, s + 1));
  };
  const detailsNext = () => {
    if (detailsLive && !isComplete(detailErrors)) {
      tap('impact');
      setShowAllErrors(true);
      return;
    }
    next();
  };
  const finish = async () => {
    if (detailsLive && !isComplete(detailErrors)) return setStep(1); // never complete with a required field missing
    const profile_details = {
      full_name: form.full_name.trim(),
      personal_email: form.personal_email.trim().toLowerCase(),
      college_email: form.college_email.trim().toLowerCase(),
      phone: normalizePhone(form.phone)!,
      gender: form.gender,
      age: Number(form.age),
      course: form.course.trim(),
      cgpa: form.cgpa.trim() ? Number(form.cgpa) : null,
    };
    const r: Me | null = await save.run({ ...(detailsLive ? { profile_details } : {}), ...(chosenMode ? { connection_mode: chosenMode } : {}), ...(chosenHostel ? { hostel_zone_id: chosenHostel } : {}), onboarding_completed: true });
    if (r) {
      invalidateCampus('me');
      tap('success');
      router.replace({ pathname: '/avatar', params: { from: 'onboarding' } });
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen tabBar={false}>
      <Header back={step > 0} title="" />
      <ProgressBar progress={(step + 1) / STEPS} color={colors.primary} height={5} />

      {step === 0 && (
        <FadeIn style={{ alignItems: 'center', marginTop: 20 }}>
          <Mascot pose="wave" size={170} animated />
          <Kicker style={{ marginTop: 10 }}>Your wingman</Kicker>
          <Display size={40} style={{ textAlign: 'center', marginTop: 4 }}>Hey, I’m your{'\n'}<Text style={{ color: colors.primary }}>campus squirrel</Text></Display>
          <Text style={styles.lead}>
            Here’s the loop: <Text style={styles.em}>move</Text> → <Text style={styles.em}>discover people</Text> → <Text style={styles.em}>claim territory</Text> → <Text style={styles.em}>join crews</Text> → <Text style={styles.em}>meet IRL</Text>. A few details, two quick questions and you’re in.
          </Text>
          <Button label="Let’s go" icon="arrow-right" onPress={next} style={{ alignSelf: 'stretch', marginTop: 24 }} />
        </FadeIn>
      )}

      {step === 1 && (
        <FadeIn>
          <Kicker style={{ marginTop: 16 }}>Step 1 · About you</Kicker>
          <Display size={38} style={{ marginTop: 4 }}>Build your{'\n'}<Text style={{ color: colors.primary }}>profile</Text></Display>
          <Text style={styles.lead2}>These stay private to you and the Squirrel team — your public profile shows only your name, hostel and activity.</Text>
          <View style={{ marginTop: 16 }}>
            {detailsLive ? (
              <ProfileDetailsForm value={form} onChange={setDetails} errors={detailErrors} showAll={showAllErrors} courses={courses} />
            ) : (
              <NotLiveYet name="Profile details" body="Saving your name, contact details, course and CGPA isn’t live yet, so we won’t ask for them now. Everything else in setup still saves." />
            )}
          </View>
          {detailsLive && showAllErrors && missing > 0 && (
            <Text style={[styles.err, { marginTop: 14 }]} accessibilityLiveRegion="polite">
              {missing === 1 ? '1 field needs a look' : `${missing} fields need a look`} before you continue.
            </Text>
          )}
          <Button label="Continue" icon="arrow-right" onPress={detailsNext} style={{ marginTop: 14 }} accessibilityLabel={detailsLive && missing ? `Continue. ${missing} fields still need attention` : 'Continue'} />
        </FadeIn>
      )}

      {step === 2 && (
        <FadeIn>
          <Kicker style={{ marginTop: 16 }}>Step 2 · Connection mode</Kicker>
          <Display size={38} style={{ marginTop: 4 }}>What are you{'\n'}looking for?</Display>
          <Text style={styles.lead2}>Pick one — you can change it any time on your profile.</Text>
          <View style={{ gap: 12, marginTop: 16 }}>
            {MODES.map((m) => {
              const on = chosenMode === m.id;
              const locked = m.id === 'date' && dateGate && !dateGate.available;
              return (
                <PressScale
                  key={m.id}
                  onPress={() => { tap(); setMode(m.id); }}
                  scaleTo={0.98}
                  style={[styles.mode, { borderColor: on ? m.color : colors.line }, on && { backgroundColor: `${m.color}14` }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${m.title}: ${m.body}`}>
                  <View style={[styles.modeIcon, { backgroundColor: on ? m.color : colors.cardHi }]}>
                    <Icon name={m.icon} size={26} color={on ? colors.onPrimary : m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.modeTitle, { color: m.color }]}>{m.title}</Text>
                      {locked && (
                        <View style={styles.gate}>
                          <Icon name="shield-lock-outline" size={11} color={colors.dim} />
                          <Text style={styles.gateText}>Safety gate</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modeLine}>{m.line}</Text>
                    <Text style={styles.modeBody}>{m.body}</Text>
                  </View>
                  <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? m.color : colors.dim} />
                </PressScale>
              );
            })}
          </View>
          {chosenMode === 'date' && dateGate && !dateGate.available && (
            <Text style={styles.note}>Saved as your preference. Date Mode itself opens once campus safety features are live — Friends and Crew work right away.</Text>
          )}
          <Button label="Continue" icon="arrow-right" disabled={!chosenMode} onPress={next} style={{ marginTop: 18 }} />
        </FadeIn>
      )}

      {step === 3 && (
        <FadeIn>
          <Kicker style={{ marginTop: 16 }}>Step 3 · Hostel</Kicker>
          <Display size={38} style={{ marginTop: 4 }}>Rep your{'\n'}<Text style={{ color: colors.primary }}>hostel</Text></Display>
          <Text style={styles.lead2}>Your moves count toward Hostel vs Hostel. Only your hostel name is shown — never your room.</Text>
          {zones.error && !hostels.length ? (
            <ErrorState cause={zones.cause} onRetry={zones.reload} compact />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
              {hostels.map((h) => {
                const on = chosenHostel === h.id;
                return (
                  <PressScale key={h.id} onPress={() => { tap(); setHostel(h.id); }} scaleTo={0.97} style={[styles.hostel, on && { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Icon name="home-city" size={22} color={on ? colors.primary : colors.dim} />
                    <Text style={[styles.hostelText, on && { color: colors.primary }]}>{h.hostel ?? h.name}</Text>
                  </PressScale>
                );
              })}
              {!hostels.length && !zones.error && <Text style={styles.note}>{zones.loading ? 'Loading hostels…' : 'No hostels listed yet.'}</Text>}
            </View>
          )}
          <Button label="Continue" icon="arrow-right" onPress={next} style={{ marginTop: 18 }} />
          <Text style={styles.skip} onPress={next}>I’m a day scholar — skip</Text>
        </FadeIn>
      )}

      {step === 4 && (
        <FadeIn>
          <Kicker style={{ marginTop: 16 }}>Step 4 · Open to Meet</Kicker>
          <Display size={38} style={{ marginTop: 4 }}>Up for{'\n'}<Text style={{ color: colors.primary }}>IRL plans?</Text></Display>
          <Text style={styles.lead2}>Optional. You can flip this any time — it’s off until you turn it on.</Text>
          <View style={{ marginTop: 14 }}>
            <OpenToMeetToggle value={me.data?.open_to_meet ?? false} />
          </View>
          {!detailsLive && (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Icon name="progress-wrench" size={16} color={colors.violet} />
              <Text style={styles.noticeText}>Profile details aren’t saved yet — that part isn’t live. Your mode, hostel and setup will be saved.</Text>
            </View>
          )}
          {save.status === 'error' && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.err}>{errorText(save.error)}</Text>
              {errorKind(save.error) === 'not_live' && <Text style={styles.skip} onPress={() => router.replace({ pathname: '/avatar', params: { from: 'onboarding' } })}>Continue without saving</Text>}
            </View>
          )}
          <Button label={save.status === 'loading' ? 'Saving…' : 'Finish'} icon="check" disabled={save.status === 'loading'} onPress={finish} style={{ marginTop: 18 }} />
          <Tagline size={16} rotate={-3} style={{ alignSelf: 'center', marginTop: 16 }}>Same campus. New people.</Tagline>
        </FadeIn>
      )}
    </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.sub, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12 },
  lead2: { color: colors.dim, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 8 },
  em: { color: colors.primary, fontFamily: fonts.semibold },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, padding: 14 },
  modeIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.5 },
  modeLine: { color: colors.text, fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  modeBody: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  gate: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.lineHi, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  gateText: { color: colors.dim, fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  note: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 10 },
  hostel: { width: '47%', flexGrow: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.line, paddingVertical: 18 },
  hostelText: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 0.8, textTransform: 'uppercase' },
  skip: { color: colors.dim, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', marginTop: 12, paddingVertical: 6 },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, borderWidth: 1, borderColor: alpha(colors.violet, 0.45), backgroundColor: alpha(colors.violet, 0.06), borderRadius: radius.md, padding: 10 },
  noticeText: { flex: 1, color: colors.sub, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
});
