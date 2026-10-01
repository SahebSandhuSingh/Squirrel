/**
 * SIGN IN / JOIN. Campus-only: a .ac.in email gets a one-time code. Password sign-in and the
 * developer token stay available underneath for testing against real backends.
 * After sign-in, people who haven't finished onboarding go there first.
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
async function routeAfterSignIn() {
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
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const joining = mode === 'join';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailOk = isAcademicEmail(email);

  const run = async (fn: () => Promise<void>, after = true) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (after) await routeAfterSignIn();
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
                  await auth.requestEmailCode(email);
                  setCodeSent(true);
                }, false)
              }
            />
          ) : (
            <>
              <Text style={styles.sent}>Code sent to {email.trim()}</Text>
              <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.mute} keyboardType="number-pad" maxLength={8} autoComplete="one-time-code" accessibilityLabel="Sign-in code" />
              <Button label={busy ? 'Checking…' : joining ? 'Join' : 'Sign in'} icon="arrow-right" disabled={busy || code.trim().length < 4} onPress={() => run(() => auth.verifyEmailCode(email, code))} />
              <Text style={styles.link} onPress={() => { setCodeSent(false); setCode(''); }}>Use a different email</Text>
            </>
          )}
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
          <Text style={styles.dev}>{showMore ? '− ' : '+ '}Other sign-in options</Text>
        </Pressable>
        {showMore && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.mute} secureTextEntry autoComplete="password" />
            <Button label="Sign in with password" size="sm" variant="secondary" disabled={busy || !emailOk || !password || !auth.authConfigured} onPress={() => run(() => auth.signIn(email.trim(), password))} />
            {!auth.authConfigured && <Text style={styles.warn}>No account service is connected yet (EXPO_PUBLIC_AUTH_URL).</Text>}
            <TextInput style={[styles.input, { fontFamily: fonts.mono, fontSize: 12 }]} value={token} onChangeText={setToken} placeholder="Developer: paste a backend token (eyJhbGciOi…)" placeholderTextColor={colors.mute} autoCapitalize="none" multiline />
            <Button label="Use token" size="sm" variant="secondary" disabled={!token.trim() || !auth.apiConfigured} onPress={() => run(() => auth.signInWithToken(token.trim()))} />
            {!auth.apiConfigured && <Text style={styles.warn}>Set EXPO_PUBLIC_API_URL / EXPO_PUBLIC_CAMPUS_API_URL / EXPO_PUBLIC_PROGRESS_API_URL to use a token.</Text>}
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
