import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { BlockSkeleton, SignInToSocial, SocialError, toAvatarUser } from '@/components/socialParts';
import { Button, Header, Icon, Label, Screen, tap } from '@/components/ui';
import { ApiError } from '@/api/client';
import { profileApi, socialErrorText, type Profile, type UpdateProfileRequest, type Visibility } from '@/api/social';
import { BIO_MAX, COLLEGE_MAX, DISPLAY_NAME_MAX, INTEREST_MAX_LEN, INTERESTS_MAX, normalizeUsername, usernameProblem } from '@/api/socialRules';
import { invalidateRemote, useRemote } from '@/api/useRemote';
import { communityApi } from '@/api/community';
import { cities, cityById } from '@/data/cities';
import { useMyProfile } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const SUGGESTED_INTERESTS = ['Runner', 'Yoga', 'HIIT', 'Strength', 'Cycling', 'Early Birds', 'No Sugar Club', 'Coach', 'Mindfulness', 'Coffee'];

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad'; text?: string };

/** Edit your profile (PATCH /v1/users/me/profile). Only changed fields are sent. */
export default function ProfileEdit() {
  const { data, error, reload, enabled } = useMyProfile();
  if (!enabled) {
    return (
      <Screen tabBar={false}>
        <Header back title="Edit Profile" />
        <SignInToSocial />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen tabBar={false}>
        <Header back title="Edit Profile" />
        {error ? <SocialError error={error} onRetry={reload} /> : <BlockSkeleton height={320} style={{ marginTop: 10 }} />}
      </Screen>
    );
  }
  return <EditForm profile={data} />;
}

function EditForm({ profile }: { profile: Profile }) {
  const { toast, look } = useApp();
  const u = profile.user;
  const [username, setUsername] = useState(u.username);
  const [displayName, setDisplayName] = useState(u.display_name);
  const [bio, setBio] = useState(u.bio ?? '');
  const [cityId, setCityId] = useState<string | null>(u.city_id);
  const [area, setArea] = useState<string | null>(u.area);
  const [college, setCollege] = useState(u.college ?? '');
  const [hostel, setHostel] = useState<string | null>(u.hostel ?? null);
  // Hostels to pick from (SOCIAL_HOSTELS on the server); none yet: the picker stays hidden.
  const hostels = useRemote('community:config', () => communityApi.config()).data?.hostels ?? [];
  const [interests, setInterests] = useState<string[]>(u.interests);
  const [custom, setCustom] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(u.visibility);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [saving, setSaving] = useState(false);

  const uname = normalizeUsername(username);
  const unameChanged = uname !== u.username;
  const localProblem = unameChanged ? usernameProblem(uname) : null;

  // Username availability: rules locally first, then the server (debounced).
  useEffect(() => {
    if (!unameChanged || localProblem) return;
    let live = true;
    const t = setTimeout(() => {
      setCheck({ state: 'checking' });
      profileApi
        .usernameAvailability(uname)
        .then((r) => live && setCheck(r.available ? { state: 'ok', text: 'Available' } : { state: 'bad', text: r.reason ?? 'Not available' }))
        .catch((e) => live && setCheck({ state: 'bad', text: socialErrorText(e) }));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [uname, unameChanged, localProblem]);

  const unameStatus: Check = !unameChanged ? { state: 'idle' } : localProblem ? { state: 'bad', text: localProblem } : check;

  const toggleInterest = (t: string) => {
    tap();
    setInterests((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : xs.length >= INTERESTS_MAX ? xs : [...xs, t]));
  };
  const addCustom = () => {
    const t = custom.trim().slice(0, INTEREST_MAX_LEN);
    if (t && !interests.some((x) => x.toLowerCase() === t.toLowerCase()) && interests.length < INTERESTS_MAX) setInterests([...interests, t]);
    setCustom('');
  };

  const save = async () => {
    const body: UpdateProfileRequest = {};
    if (unameChanged || !profile.username_confirmed) body.username = uname;
    if (displayName.trim() !== u.display_name) body.display_name = displayName.trim();
    if (bio.trim() !== (u.bio ?? '')) body.bio = bio.trim();
    if (cityId !== u.city_id) body.city_id = cityId;
    if (area !== u.area) body.area = area;
    if (college.trim() !== (u.college ?? '')) body.college = college.trim() || null;
    if (hostel !== (u.hostel ?? null)) body.hostel = hostel;
    if (JSON.stringify(interests) !== JSON.stringify(u.interests)) body.interests = interests;
    if (visibility !== u.visibility) body.visibility = visibility;
    // First save also stores the look you designed locally, so others see your avatar.
    if (!u.avatar_look) body.avatar_look = look;
    if (!Object.keys(body).length) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      await profileApi.update(body);
      invalidateRemote('social:');
      toast('Profile saved', 'check-circle', colors.green);
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setCheck({ state: 'bad', text: e.message });
      toast(socialErrorText(e), 'alert-circle-outline', colors.coral);
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !!displayName.trim() && unameStatus.state !== 'bad' && unameStatus.state !== 'checking';
  const city = cityId ? cityById(cityId) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tabBar={false}>
        <Header back title="Edit Profile" />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <Avatar user={{ ...toAvatarUser(u, true), look: u.avatar_look ?? look }} size={72} link={false} />
          <Button label="Design avatar" variant="secondary" size="sm" iconLeft="face-man-shimmer" onPress={() => router.push({ pathname: '/avatar', params: { from: 'profile' } })} />
        </View>
        {!profile.username_confirmed && <Text style={styles.hint}>Pick your username: it’s how friends find you.</Text>}

        <Label style={styles.label}>Username</Label>
        <View style={styles.row}>
          <Text style={styles.at}>@</Text>
          <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} style={[styles.input, { flex: 1 }]} placeholderTextColor={colors.mute} placeholder="username" />
          {unameStatus.state === 'checking' && <ActivityIndicator color={colors.primary} />}
          {unameStatus.state === 'ok' && <Icon name="check-circle" size={20} color={colors.green} />}
          {unameStatus.state === 'bad' && <Icon name="close-circle" size={20} color={colors.coral} />}
        </View>
        {!!unameStatus.text && <Text style={[styles.hint, { color: unameStatus.state === 'bad' ? colors.coral : colors.green }]}>{unameStatus.text}</Text>}

        <Label style={styles.label}>Name</Label>
        <TextInput value={displayName} onChangeText={setDisplayName} maxLength={DISPLAY_NAME_MAX} style={styles.input} placeholderTextColor={colors.mute} placeholder="Your name" />

        <Label style={styles.label}>Bio</Label>
        <TextInput value={bio} onChangeText={setBio} maxLength={BIO_MAX} multiline style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholderTextColor={colors.mute} placeholder="What moves you?" />
        <Text style={styles.counter}>{bio.length}/{BIO_MAX}</Text>

        <Label style={styles.label}>City</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {cities.map((c) => (
            <Chip key={c.id} label={c.name} on={cityId === c.id} onPress={() => { setCityId(cityId === c.id ? null : c.id); setArea(null); }} />
          ))}
        </ScrollView>
        {city && (
          <>
            <Label style={styles.label}>Area</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {city.areas.map((a) => (
                <Chip key={a} label={a} on={area === a} onPress={() => setArea(area === a ? null : a)} />
              ))}
            </ScrollView>
          </>
        )}

        <Label style={styles.label}>College</Label>
        <TextInput value={college} onChangeText={setCollege} maxLength={COLLEGE_MAX} style={styles.input} placeholderTextColor={colors.mute} placeholder="Optional" />

        {hostels.length > 0 && (
          <>
            <Label style={styles.label}>Hostel · for hostel vs hostel</Label>
            <View style={styles.wrap}>
              {hostels.map((h) => (
                <Chip key={h} label={h} on={hostel === h} onPress={() => setHostel(hostel === h ? null : h)} />
              ))}
            </View>
          </>
        )}

        <Label style={styles.label}>Interests · {interests.length}/{INTERESTS_MAX}</Label>
        <View style={styles.wrap}>
          {[...new Set([...SUGGESTED_INTERESTS, ...interests])].map((t) => (
            <Chip key={t} label={t} on={interests.includes(t)} onPress={() => toggleInterest(t)} />
          ))}
        </View>
        <View style={[styles.row, { marginTop: 8 }]}>
          <TextInput value={custom} onChangeText={setCustom} onSubmitEditing={addCustom} maxLength={INTEREST_MAX_LEN} style={[styles.input, { flex: 1 }]} placeholderTextColor={colors.mute} placeholder="Add your own" returnKeyType="done" />
          <Button label="Add" size="sm" variant="secondary" onPress={addCustom} disabled={!custom.trim() || interests.length >= INTERESTS_MAX} />
        </View>

        <Label style={styles.label}>Who can see your posts</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Everyone" on={visibility === 'public'} onPress={() => setVisibility('public')} />
          <Chip label="Followers I approve" on={visibility === 'private'} onPress={() => setVisibility('private')} />
        </View>
        <Text style={styles.hint}>{visibility === 'private' ? 'New followers need your OK. Your name and avatar stay visible.' : 'Anyone can see your posts and follow you.'}</Text>

        <Button label={saving ? 'Saving…' : 'Save'} iconLeft="content-save-outline" onPress={save} disabled={!canSave} style={{ marginTop: 22, marginBottom: 30 }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  at: { color: colors.dim, fontFamily: fonts.bold, fontSize: 18 },
  hint: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 6 },
  counter: { color: colors.mute, fontFamily: fonts.mono, fontSize: 10, textAlign: 'right', marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 13 },
});
