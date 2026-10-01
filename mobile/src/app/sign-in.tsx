/**
 * SIGN IN / JOIN. Campus-only: sign-up needs an IISER Kolkata email (EXPO_PUBLIC_ALLOWED_EMAIL_DOMAINS).
 *   Join     email → 6-digit code by email → name + password → account (Exercise /api/auth/register)
 *   Sign in  email + password (/api/auth/login)
 * An invite link (?invite=CODE, from a friend's referral) is claimed on the Social service right
 * after sign-in — that's what moves the friend up the waitlist. A developer token stays available.
 * After sign-in, people who haven't finished onboarding go there first.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { campusApi, CAMPUS_SOURCE } from '@/api/campus';
import { SOCIAL_API_CONFIGURED, socialApi } from '@/api/social';
import { AccountExistsError, campusDomainsText, isCampusEmail, useAuth } from '@/auth/AuthProvider';
import { Wordmark } from '@/components/Brand';
import { Button, Display, Icon, IconButton, Kicker, Segmented, Tagline, tap } from '@/components/ui';
import { pendingInvite } from '@/state/invite';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/** Claim a pending invite, then onboarding for new accounts, Home otherwise. */
async function routeAfterSignIn() {
  const code = await pendingInvite.get();
  if (code && SOCIAL_API_CONFIGURED) {
    // A code that's invalid, your own, or already used just doesn't apply; sign-in still succeeds.
    await socialApi.claimReferral(code).catch(() => null);
    await pendingInvite.clear();
  }
  if (CAMPUS_SOURCE === 'off') return router.replace('/home');
  try {
    const me = await campusApi.me();
    router.replace(me.onboarding_completed ? '/home' : '/onboarding');
  } catch {
    router.replace('/home');
  }
}

const TABS = ['Join', 'Sign in'] as const;

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const params = useLocalSearchParams<{ mode?: string; invite?: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]>(params.mode === 'join' || params.mode === 'create' || params.invite ? 'Join' : 'Sign in');
  const joining = tab === 'Join';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const emailOk = isCampusEmail(email);
  const exercise = auth.accounts === 'exercise';

  // Remember an invite from the link so it survives onboarding / an app restart.
  useEffect(() => {
    const c = (params.invite ?? '').trim().toUpperCase();
    if (c) void pendingInvite.set(c).then(() => setInvite(c));
    else void pendingInvite.get().then(setInvite);
  }, [params.invite]);

  const run = async (fn: () => Promise<void>, after = true) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      if (after) await routeAfterSignIn();
    } catch (e) {
      if (e instanceof AccountExistsError) {
        setTab('Sign in');
        setCodeSent(false);
        setNote(e.message);
      } else setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const createReady = code.trim().length === 6 && first.trim() && last.trim() && password.length >= 8;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.col, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-left" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} label="Back" />
          <Wordmark size={24} />
        </View>

        <Kicker style={{ marginTop: 28 }}>{joining ? 'Join IISER Kolkata' : 'Welcome back'}</Kicker>
        <Display size={44} style={{ marginTop: 6, lineHeight: 46 }}>
          {joining ? 'Get in with your' : 'Back in'}
          {'\n'}
          <Text style={{ color: colors.primary }}>{joining ? 'campus email' : 'the game.'}</Text>
        </Display>
        <Text style={styles.lead}>
          {joining ? `Squirrel Social is campus-only: sign-up is open to ${campusDomainsText} addresses. We’ll email you a 6-digit code to prove it’s you.` : 'Sign in with your campus email and password.'}
        </Text>

        {invite && (
          <View style={styles.invite} accessibilityLabel={`Invite code ${invite}`}>
            <Icon name="ticket-confirmation-outline" size={16} color={colors.primary} />
            <Text style={styles.inviteText}>Invite code {invite} — applied when you’re in</Text>
          </View>
        )}

        <Segmented items={TABS} value={tab} onChange={(v) => { setTab(v); setError(null); setNote(null); }} style={{ marginTop: 16 }} />

        <View style={{ gap: 10, marginTop: 14 }}>
          <TextInput
            style={[styles.input, email.length > 4 && !emailOk && { borderColor: colors.coral }]}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setCodeSent(false);
            }}
            placeholder={`you@${campusDomainsText.split(' ')[0].slice(1)}`}
            placeholderTextColor={colors.mute}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            accessibilityLabel="Campus email"
          />
          {email.length > 4 && !emailOk && <Text style={styles.error}>Use your campus email ({campusDomainsText}).</Text>}

          {!joining ? (
            <>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.mute} secureTextEntry autoComplete="password" accessibilityLabel="Password" />
              <Button label={busy ? 'Signing in…' : 'Sign in'} icon="arrow-right" disabled={busy || !emailOk || !password || !auth.authConfigured} onPress={() => run(() => auth.signIn(email, password))} />
            </>
          ) : !codeSent ? (
            <Button
              label={busy ? 'Sending…' : 'Email me a code'}
              icon="arrow-right"
              disabled={busy || !emailOk || !auth.authConfigured}
              onPress={() =>
                run(async () => {
                  await auth.requestEmailCode(email);
                  setCodeSent(true);
                }, false)
              }
            />
          ) : (
            <>
              <Text style={styles.sent}>Code sent to {email.trim()} · valid for a few minutes</Text>
              <TextInput style={[styles.input, styles.code]} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} placeholder="6-digit code" placeholderTextColor={colors.mute} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" accessibilityLabel="Email code" />
              {exercise ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={first} onChangeText={setFirst} placeholder="First name" placeholderTextColor={colors.mute} autoComplete="given-name" accessibilityLabel="First name" />
                    <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={last} onChangeText={setLast} placeholder="Last name" placeholderTextColor={colors.mute} autoComplete="family-name" accessibilityLabel="Last name" />
                  </View>
                  <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Choose a password (8+ characters)" placeholderTextColor={colors.mute} secureTextEntry autoComplete="new-password" accessibilityLabel="New password" />
                  <Button label={busy ? 'Creating…' : 'Create my account'} icon="arrow-right" disabled={busy || !createReady} onPress={() => run(() => auth.register({ email, code, password, firstName: first, lastName: last }))} />
                </>
              ) : (
                <Button label={busy ? 'Checking…' : 'Join'} icon="arrow-right" disabled={busy || code.trim().length < 4} onPress={() => run(() => auth.verifyEmailCode(email, code))} />
              )}
              <Text style={styles.link} onPress={() => { setCodeSent(false); setCode(''); }}>Use a different email</Text>
            </>
          )}
          {!auth.authConfigured && <Text style={styles.warn}>No account service is connected to this build (EXPO_PUBLIC_EXERCISE_API_URL or EXPO_PUBLIC_AUTH_URL).</Text>}
          {note && <Text style={styles.note} accessibilityRole="alert">{note}</Text>}
          {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        </View>

        <View style={styles.or}>
          <View style={styles.rule} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.rule} />
        </View>
        <Button
          label="Look around first"
          variant="secondary"
          size="md"
          onPress={() => {
            tap();
            auth.continueDemo();
            router.replace('/onboarding');
          }}
        />

        <Pressable onPress={() => setShowMore((v) => !v)} style={{ marginTop: 18 }} accessibilityRole="button">
          <Text style={styles.dev}>{showMore ? '− ' : '+ '}Developer sign-in</Text>
        </Pressable>
        {showMore && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput style={[styles.input, { fontFamily: fonts.mono, fontSize: 12 }]} value={token} onChangeText={setToken} placeholder="Paste a backend token (eyJhbGciOi…)" placeholderTextColor={colors.mute} autoCapitalize="none" multiline />
            <Button label="Use token" size="sm" variant="secondary" disabled={!token.trim() || !auth.apiConfigured} onPress={() => run(() => auth.signInWithToken(token.trim()))} />
            {!auth.apiConfigured && <Text style={styles.warn}>No backend is configured to accept a token.</Text>}
          </View>
        )}

        <Tagline size={16} rotate={-3} style={{ alignSelf: 'flex-end', marginTop: 28 }}>Same campus. New people.</Tagline>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  col: { flexGrow: 1, paddingHorizontal: 20, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  lead: { color: colors.dim, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 10 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  code: { fontFamily: fonts.labelBold, fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  sent: { color: colors.primary, fontFamily: fonts.mono, fontSize: 12 },
  link: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center', paddingVertical: 4 },
  warn: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 },
  error: { color: colors.secondary, fontFamily: fonts.semibold, fontSize: 13 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textTransform: 'uppercase' },
  note: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  inviteText: { color: colors.text, fontFamily: fonts.medium, fontSize: 13, flex: 1 },
  dev: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
});
