import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wordmark } from '@/components/Brand';
import { Button, Display, IconButton, Kicker, Tagline, tap } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/**
 * Sign in or create a Squirrel Social account (Exercise backend, /api/auth). The same account
 * signs in to the Run Module. Without a configured server: demo mode, or a developer token.
 */
export default function SignIn() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = () => router.replace('/home');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.col, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-left" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} label="Back" />
          <Wordmark size={24} />
        </View>

        <Kicker style={{ marginTop: 28 }}>{creating ? 'New here' : 'Welcome back'}</Kicker>
        <Display size={46} style={{ marginTop: 6, lineHeight: 48 }}>
          {creating ? 'Join the' : 'Back in'}
          {'\n'}
          <Text style={{ color: colors.primary }}>{creating ? 'squad.' : 'the game.'}</Text>
        </Display>

        <View style={{ gap: 10, marginTop: 22 }}>
          {creating && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.mute} autoComplete="given-name" />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.mute} autoComplete="family-name" />
              </View>
            </View>
          )}
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.mute} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={creating ? 'Password (8+ characters)' : 'Password'} placeholderTextColor={colors.mute} secureTextEntry autoComplete={creating ? 'new-password' : 'password'} />
          {creating ? (
            <Button
              label={busy ? 'Creating account…' : 'Create account'}
              icon="arrow-right"
              disabled={busy || !firstName.trim() || !lastName.trim() || !email.trim() || password.length < 8}
              onPress={() => run(() => auth.signUp({ first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(), password }))}
            />
          ) : (
            <Button label={busy ? 'Signing in…' : 'Sign in'} icon="arrow-right" disabled={busy || !email || !password} onPress={() => run(() => auth.signIn(email.trim(), password))} />
          )}
          {!auth.authConfigured && <Text style={styles.warn}>No account server is connected. Set EXPO_PUBLIC_EXERCISE_API_URL, or use demo mode for now.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={() => { setCreating((v) => !v); setError(null); }} accessibilityLabel={creating ? 'I already have an account' : 'Create an account'}>
            <Text style={styles.switch}>{creating ? 'Already have an account? Sign in' : 'New to Squirrel Social? Create an account'}</Text>
          </Pressable>
        </View>

        <View style={styles.or}>
          <View style={styles.rule} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.rule} />
        </View>
        <Button
          label="Continue in demo mode"
          variant="secondary"
          size="md"
          onPress={() => {
            tap();
            auth.continueDemo();
            done();
          }}
        />

        <Pressable onPress={() => setShowToken((v) => !v)} style={{ marginTop: 18 }} accessibilityLabel="Developer token">
          <Text style={styles.dev}>{showToken ? '− ' : '+ '}Developer: paste a backend token</Text>
        </Pressable>
        {showToken && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput style={[styles.input, { fontFamily: fonts.mono, fontSize: 12 }]} value={token} onChangeText={setToken} placeholder="eyJhbGciOiJSUzI1NiIs…" placeholderTextColor={colors.mute} autoCapitalize="none" multiline />
            <Button label="Use token" size="sm" variant="secondary" disabled={!token.trim() || !auth.apiConfigured} onPress={() => run(() => auth.signInWithToken(token.trim()))} />
            {!auth.apiConfigured && <Text style={styles.warn}>Set EXPO_PUBLIC_API_URL to talk to the Run Module backend.</Text>}
          </View>
        )}

        <View style={{ flex: 1 }} />
        <Tagline size={16} rotate={-3} style={{ alignSelf: 'flex-end' }}>Zero gym-bro energy required.</Tagline>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, paddingHorizontal: 20, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  warn: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, lineHeight: 16 },
  error: { color: colors.secondary, fontFamily: fonts.semibold, fontSize: 13 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textTransform: 'uppercase' },
  dev: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  switch: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center', marginTop: 4 },
});
