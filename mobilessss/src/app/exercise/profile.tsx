import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { EXERCISE_API_CONFIGURED } from '@/api/config';
import { ApiError } from '@/api/client';
import { exerciseApi, type ExerciseProfileInput } from '@/api/exercise';
import { useAuth } from '@/auth/AuthProvider';
import { RemoteStatus, StatTile } from '@/components/ExerciseParts';
import { Button, Card, Display, EmptyState, Header, Kicker, Screen, Segmented, tap } from '@/components/ui';
import { invalidateExercise, useExerciseProfile, useExerciseUser } from '@/hooks/useExercise';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const GENDERS = ['female', 'male', 'other'] as const;
const GENDER_LABELS = { female: 'Female', male: 'Male', other: 'Other' };

/** Coach profile: create (POST /api/users), link an existing id (GET /api/users/{id}), or view. */
export default function ExerciseProfileScreen() {
  const user = useExerciseUser();
  if (!EXERCISE_API_CONFIGURED) {
    return (
      <Screen tabBar={false}>
        <Header back title="Coach profile" />
        <EmptyState title="Coach not connected" body="Set EXPO_PUBLIC_EXERCISE_API_URL in mobile/.env and restart the app." />
      </Screen>
    );
  }
  return user ? <ViewProfile uid={user.user_id} /> : <CreateProfile />;
}

function ViewProfile({ uid }: { uid: string }) {
  const { setExerciseUser } = useAuth();
  const { toast } = useApp();
  const p = useExerciseProfile(uid);
  const notFound = p.error != null && /not found/i.test(p.error);
  const bmi = p.data ? p.data.weight_kg / (p.data.height_cm / 100) ** 2 : null;
  const unlink = async () => {
    invalidateExercise(uid);
    await setExerciseUser(null);
    toast('Coach profile unlinked from this device', 'link-variant', colors.dim);
  };
  return (
    <Screen tabBar={false}>
      <Header back title="Coach profile" />
      {notFound ? (
        <EmptyState title="Profile not on the server" body={`The server has no profile for ${uid}. It may have been reset. Unlink it and create a new one.`} action="Unlink and start over" onAction={unlink} />
      ) : (
        <RemoteStatus loading={p.loading} error={p.error} hasData={!!p.data} onRetry={p.reload} label="profile" />
      )}
      {p.data && (
        <>
          <Kicker>Coach ID</Kicker>
          <Text selectable style={styles.id}>{p.data.user_id}</Text>
          <Display size={32} style={{ marginTop: 10 }}>{p.data.first_name} {p.data.last_name}</Display>
          <View style={styles.tiles}>
            <StatTile value={`${p.data.height_cm}`} label="Height cm" />
            <StatTile value={`${p.data.weight_kg}`} label="Weight kg" />
            <StatTile value={bmi ? bmi.toFixed(1) : '—'} label="BMI" color={colors.primary} />
          </View>
          <Card style={{ marginTop: 12, gap: 6 }}>
            <Row k="Gender" v={p.data.gender} />
            <Row k="Date of birth" v={p.data.date_of_birth} />
            <Row k="Email" v={p.data.email} />
            <Row k="Mobile" v={p.data.mobile} />
            <Row k="Created" v={p.data.created_at.slice(0, 10)} />
          </Card>
          <Text style={styles.note}>The coach service can’t edit or delete profiles yet. Keep your Coach ID to use this profile on another device.</Text>
          <Button label="Unlink from this device" variant="secondary" size="md" onPress={unlink} style={{ marginTop: 16 }} />
        </>
      )}
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v} numberOfLines={1}>{v}</Text>
    </View>
  );
}

/** Client checks mirror the backend's UserProfile validation, so most mistakes never reach it. */
function validate(f: Record<string, string>): string | null {
  if (!f.first_name.trim() || !f.last_name.trim()) return 'Enter your first and last name.';
  const h = Number(f.height_cm);
  const w = Number(f.weight_kg);
  // Same bounds as the backend (profiles/vocab.py HEIGHT_CM, WEIGHT_KG; check_date_of_birth).
  if (!(h >= 50 && h <= 272)) return 'Height must be between 50 and 272 cm.';
  if (!(w >= 20 && w <= 400)) return 'Weight must be between 20 and 400 kg.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date_of_birth) || Number.isNaN(Date.parse(f.date_of_birth))) return 'Date of birth must be YYYY-MM-DD.';
  if (f.date_of_birth < '1900-01-01' || f.date_of_birth > new Date().toISOString().slice(0, 10)) return 'Date of birth must be between 1900 and today.';
  if (f.mobile.trim().length < 3) return 'Enter your mobile number.';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return 'Enter a valid email.';
  return null;
}

/** Return to the hub underneath (it re-renders with the new profile) instead of stacking a second one. */
const done = () => (router.canGoBack() ? router.back() : router.replace('/exercise'));

function CreateProfile() {
  const { setExerciseUser } = useAuth();
  const [f, setF] = useState({ first_name: '', last_name: '', height_cm: '', weight_kg: '', date_of_birth: '', mobile: '', email: '' });
  const [gender, setGender] = useState<(typeof GENDERS)[number]>('female');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [linkId, setLinkId] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const create = async () => {
    const bad = validate(f);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const body: ExerciseProfileInput = {
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        gender,
        height_cm: Number(f.height_cm),
        weight_kg: Number(f.weight_kg),
        date_of_birth: f.date_of_birth,
        mobile: f.mobile.trim(),
        email: f.email.trim(),
      };
      const created = await exerciseApi.createUser(body);
      tap('success');
      await setExerciseUser(created);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the profile.');
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await exerciseApi.getProfile(linkId.trim());
      await setExerciseUser({ user_id: p.user_id, first_name: p.first_name, last_name: p.last_name });
      done();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? 'No profile with that Coach ID.' : e instanceof Error ? e.message : 'Could not link.');
    } finally {
      setBusy(false);
    }
  };

  const input = (k: keyof typeof f, placeholder: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <TextInput style={styles.input} value={f[k]} onChangeText={set(k)} placeholder={placeholder} placeholderTextColor={colors.mute} {...extra} />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tabBar={false}>
        <Header back title="Coach profile" />
        <Text style={styles.note}>The coach uses your height and weight to judge range of motion. This creates your profile on the Exercise Mechanics server.</Text>
        <View style={{ gap: 10, marginTop: 14 }}>
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>{input('first_name', 'First name', { autoComplete: 'given-name' })}</View>
            <View style={{ flex: 1 }}>{input('last_name', 'Last name', { autoComplete: 'family-name' })}</View>
          </View>
          <Segmented items={GENDERS} labels={GENDER_LABELS} value={gender} onChange={setGender} />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>{input('height_cm', 'Height (cm)', { keyboardType: 'decimal-pad' })}</View>
            <View style={{ flex: 1 }}>{input('weight_kg', 'Weight (kg)', { keyboardType: 'decimal-pad' })}</View>
          </View>
          {input('date_of_birth', 'Date of birth (YYYY-MM-DD)', { keyboardType: 'numbers-and-punctuation', maxLength: 10 })}
          {input('mobile', 'Mobile', { keyboardType: 'phone-pad', autoComplete: 'tel' })}
          {input('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email' })}
          {error && <Text style={styles.error}>{error}</Text>}
          <Button label={busy ? 'Saving…' : 'Create profile'} icon="arrow-right" disabled={busy} onPress={create} />
        </View>

        <Pressable onPress={() => setShowLink((v) => !v)} style={{ marginTop: 22 }} accessibilityLabel="Link an existing coach profile">
          <Text style={styles.dev}>{showLink ? '− ' : '+ '}Already have a coach profile? Enter your Coach ID</Text>
        </Pressable>
        {showLink && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput style={[styles.input, { fontFamily: fonts.mono, fontSize: 13 }]} value={linkId} onChangeText={setLinkId} placeholder="e.g. aarav-sharma-3f9c1a" placeholderTextColor={colors.mute} autoCapitalize="none" />
            <Button label="Link profile" size="sm" variant="secondary" disabled={busy || !/^[a-z0-9-]{1,64}$/.test(linkId.trim())} onPress={link} />
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  pair: { flexDirection: 'row', gap: 10 },
  note: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 10 },
  error: { color: colors.coral, fontFamily: fonts.semibold, fontSize: 13 },
  dev: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  id: { color: colors.text, fontFamily: fonts.mono, fontSize: 14, marginTop: 4 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  k: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13 },
  v: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13, flexShrink: 1 },
});
