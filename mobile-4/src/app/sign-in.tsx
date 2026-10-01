/**
 * SIGN IN / JOIN. Campus-only: a .ac.in email gets a one-time code (Exercise backend
 * /api/auth/email/start → /email/verify). A new address also gives a name, and optionally a
 * friend's invite code (`?invite=<code>` pre-fills it). Password sign-in (older accounts) and the
 * developer token stay available underneath. New accounts go to onboarding first.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { campusApi, CAMPUS_SOURCE } from '@/api/campus';
import { isAcademicEmail, useAuth } from '@/auth/AuthProvider';
import { Wordmark } from '@/components/Brand';
import { Button, Display, IconButton, Kicker, Tagline, tap } from '@/components/ui';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/** Onboarding first for new accounts; Home otherwise. Falls back to Home if the campus API is down. */
async function routeAfterSignIn(newAccount = false) {
  if (newAccount) return router.replace('/onboarding');
  if (CAMPUS_SOURCE === 'off') return router.replace('/home');
  try {
    const me = await campusApi.me();
    router.replace(me.onboarding_completed ? '/home' : '/onboarding');
  } catch {
    router.replace('/home');
  }
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { mode, invite: invited } = useLocalSearchParams<{ mode?: string; invite?: string }>();
  const joining = mode === 'join' || mode === 'create'; // 'create': invite links from the Social service
  const [email, setEmail] = useState(joining ? '' : auth.lastEmail ?? '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  /** The address has no account yet: ask for a name (and take an invite code). */
  const [newAccount, setNewAccount] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [invite, setInvite] = useState(invited ?? '');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailOk = isAcademicEmail(email);

  const run = async (fn: () => Promise<void | { newAccount: boolean }>, after = true) => {
    setBusy(true);
    setError(null);
    auth.clearNotice();
    try {
      const r = await fn();
      if (after) await routeAfterSignIn(!!r && r.newAccount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.col, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-left" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} label="Back" />
          <Wordmark size={24} />
        </View>

        <Kicker style={{ marginTop: 28 }}>{joining ? 'Join your campus' : 'Welcome back'}</Kicker>
        <Display size={44} style={{ marginTop: 6, lineHeight: 46 }}>
          {joining ? 'Get in with your' : 'Back in'}
          {'\n'}
          <Text style={{ color: colors.primary }}>{joining ? '.ac.in email' : 'the game.'}</Text>
        </Display>
        <Text style={styles.lead}>Squirrel Social is campus-only. We’ll send a one-time code to your institute inbox — no password needed.</Text>

        <View style={{ gap: 10, marginTop: 18 }}>
          <TextInput
            style={[styles.input, email.length > 4 && !emailOk && { borderColor: colors.coral }]}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setCodeSent(false);
            }}
            placeholder="you@iiserkol.ac.in"
            placeholderTextColor={colors.mute}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            accessibilityLabel="Institute email"
          />
          {email.length > 4 && !emailOk && <Text style={styles.error}>Use your institute email — it ends in .ac.in.</Text>}
          {!codeSent ? (
            <Button
              label={busy ? 'Sending…' : 'Send my code'}
              icon="arrow-right"
              disabled={busy || !emailOk}
              onPress={() =>
                run(async () => {
                  const r = await auth.requestEmailCode(email);
                  setNewAccount(!!r.newAccount);
                  setCodeSent(true);
                }, false)
              }
            />
          ) : (
            <>
              <Text style={styles.sent}>Code sent to {email.trim()}</Text>
              <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.mute} keyboardType="number-pad" maxLength={8} autoComplete="one-time-code" accessibilityLabel="Sign-in code" />
              {newAccount && (
                <>
                  <Text style={styles.lead}>New here — what should we call you?</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.mute} autoComplete="given-name" maxLength={80} accessibilityLabel="First name" />
                    <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.mute} autoComplete="family-name" maxLength={80} accessibilityLabel="Last name" />
                  </View>
                  <TextInput style={styles.input} value={invite} onChangeText={setInvite} placeholder="Friend’s invite code (optional)" placeholderTextColor={colors.mute} autoCapitalize="characters" maxLength={16} accessibilityLabel="Invite code" />
                </>
              )}
              <Button
                label={busy ? 'Checking…' : newAccount ? 'Join' : 'Sign in'}
                icon="arrow-right"
                disabled={busy || code.trim().length < 4 || (newAccount && !firstName.trim())}
                onPress={() => run(() => auth.verifyEmailCode(email, code, newAccount ? { first_name: firstName.trim(), last_name: lastName.trim() } : undefined, invite))}
              />
              <Text style={styles.link} onPress={() => { setCodeSent(false); setCode(''); }}>Use a different email</Text>
            </>
          )}
          {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          {auth.notice && !error && <Text style={styles.sent}>{auth.notice}</Text>}
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
          <Text style={styles.dev}>{showMore ? '− ' : '+ '}Other sign-in options</Text>
        </Pressable>
        {showMore && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.mute} secureTextEntry autoComplete="password" />
            <Button label="Sign in with password" size="sm" variant="secondary" disabled={busy || !emailOk || !password || !auth.authConfigured} onPress={() => run(() => auth.signIn(email.trim(), password))} />
            {!auth.authConfigured && <Text style={styles.warn}>No account service is connected yet (EXPO_PUBLIC_EXERCISE_API_URL).</Text>}
            <TextInput style={[styles.input, { fontFamily: fonts.mono, fontSize: 12 }]} value={token} onChangeText={setToken} placeholder="Developer: paste a backend token (eyJhbGciOi…)" placeholderTextColor={colors.mute} autoCapitalize="none" multiline />
            <Button label="Use token" size="sm" variant="secondary" disabled={!token.trim() || !auth.apiConfigured} onPress={() => run(() => auth.signInWithToken(token.trim()))} />
            {!auth.apiConfigured && <Text style={styles.warn}>Set EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SOCIAL_API_URL / EXPO_PUBLIC_EXERCISE_API_URL to use a token.</Text>}
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
  dev: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
});
