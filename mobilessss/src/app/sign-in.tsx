import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wordmark } from '@/components/Brand';
import { Button, Display, Icon, IconButton, Kicker, Tagline, tap } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

/**
 * Sign in or create a Squirrel Social account (Exercise backend, /api/auth). The same account
 * signs in to the Run Module. Without a configured server: demo mode, or a developer token.
 * `/sign-in?mode=create` opens on "create account" (Welcome → Get started).
 */
export default function SignIn() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [creating, setCreating] = useState(params.mode === 'create');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(params.mode === 'create' ? '' : auth.lastEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const run = async (fn: () => Promise<void>, next: '/home' | '/avatar' = '/home') => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  /** Checks done here, in plain words, before anything is sent. */
  const problem = (): string | null => {
    if (creating && (!firstName.trim() || !lastName.trim())) return 'Enter your first and last name.';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (creating && password.length < MIN_PASSWORD) return `Your password needs at least ${MIN_PASSWORD} characters.`;
    if (!password) return 'Enter your password.';
    return null;
  };

  const submit = () => {
    if (busy) return;
    const p = problem();
    if (p) {
      setError(p);
      return;
    }
    auth.clearNotice();
    if (creating) {
      // A new account picks its look next, then lands on Home.
      run(() => auth.signUp({ first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(), password }), '/avatar');
    } else {
      run(() => auth.signIn(email.trim(), password));
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

        {auth.notice && !error && <Text style={[styles.notice, { marginTop: 18 }]}>{auth.notice}</Text>}

        <View style={{ gap: 10, marginTop: 22 }}>
          {creating && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.mute}
                  autoComplete="given-name" textContentType="givenName" returnKeyType="next" onSubmitEditing={() => lastNameRef.current?.focus()} submitBehavior="submit" />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput ref={lastNameRef} style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.mute}
                  autoComplete="family-name" textContentType="familyName" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} submitBehavior="submit" />
              </View>
            </View>
          )}
          <TextInput ref={emailRef} style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.mute}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType={creating ? 'emailAddress' : 'username'}
            returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} submitBehavior="submit" />
          <View>
            <TextInput ref={passwordRef} style={[styles.input, { paddingRight: 48 }]} value={password} onChangeText={setPassword}
              placeholder={creating ? `Password (${MIN_PASSWORD}+ characters)` : 'Password'} placeholderTextColor={colors.mute}
              secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
              autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'}
              returnKeyType="go" onSubmitEditing={submit} />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eye} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.dim} />
            </Pressable>
          </View>
          {creating && password.length > 0 && password.length < MIN_PASSWORD && (
            <Text style={styles.hint}>{MIN_PASSWORD - password.length} more character{MIN_PASSWORD - password.length === 1 ? '' : 's'}</Text>
          )}
          <Button
            label={busy ? (creating ? 'Creating account…' : 'Signing in…') : creating ? 'Create account' : 'Sign in'}
            icon="arrow-right"
            disabled={busy}
            onPress={submit}
          />
          {!auth.authConfigured && <Text style={styles.warn}>No account server is connected. Set EXPO_PUBLIC_EXERCISE_API_URL, or use demo mode for now.</Text>}
          {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
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
            router.replace('/home');
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
  eye: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  hint: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: -4 },
  notice: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
});
