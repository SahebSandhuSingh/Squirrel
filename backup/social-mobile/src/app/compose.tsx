import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StickerArt } from '@/art/Sticker';
import { Avatar } from '@/components/Avatar';
import { SceneImage } from '@/components/cards';
import { SignInToSocial, toAvatarUser } from '@/components/socialParts';
import { Button, Chips, Header, Icon, Label, Screen, tap } from '@/components/ui';
import { postsApi, socialErrorText, type ActivityInput, type PostSticker } from '@/api/social';
import { CAPTION_MAX } from '@/api/socialRules';
import { invalidateRemote } from '@/api/useRemote';
import { POST_STICKERS } from '@/data/posts';
import { useMyProfile, useSocialEnabled } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { invalidatePagedPrefix } from '@/state/socialStore';
import type { SceneKind } from '@/types';
import { colors, fonts, radius } from '@/theme';

const SCENES: SceneKind[] = ['city-sunset', 'run', 'yoga', 'brunch', 'cafe', 'rooftop', 'lake', 'city-night', 'hiit', 'cycling', 'stadium'];
const STICKER_ITEM: Record<PostSticker, string> = { 'one-more-km': 'st-km', fire: 'st-fire', 'good-vibes': 'st-vibes', 'neon-heart': 'st-heart', 'squirrel-flex': 'st-flex', hydrate: 'st-hydrate' };

const KINDS = ['None', 'Workout', 'Yoga', 'Ride', 'Meal'] as const;
type Kind = (typeof KINDS)[number];

const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

/**
 * Post composer. After a run it's opened with the Run Module's `run_id`: the server fetches the
 * run's distance and time itself, so the numbers can't be edited here. Other activities are
 * self-reported and show as unverified.
 */
export default function Compose() {
  const { run_id, km, min, pace } = useLocalSearchParams<{ run_id?: string; km?: string; min?: string; pace?: string }>();
  const enabled = useSocialEnabled();
  const me = useMyProfile();
  const { owned, look, city, toast } = useApp();
  const [scene, setScene] = useState<SceneKind>(run_id ? 'run' : 'city-sunset');
  const [sticker, setSticker] = useState<PostSticker | null>(run_id ? 'one-more-km' : null);
  const [caption, setCaption] = useState(run_id && km ? `Just one more km turned into ${km}. 🏃‍♀️` : '');
  const [kind, setKind] = useState<Kind>('None');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [kcal, setKcal] = useState('');
  const [busy, setBusy] = useState(false);

  if (!enabled) {
    return (
      <Screen tabBar={false}>
        <Header back title="New Post" />
        <SignInToSocial title="Sign in to post" body="Posts, likes and comments are saved to your account so friends can see them." />
      </Screen>
    );
  }

  const manual = (): ActivityInput | null | string => {
    if (kind === 'None') return null;
    const m = num(minutes);
    const d = num(distance);
    const c = num(kcal);
    if ([m, d, c].some((x) => x !== undefined && !Number.isFinite(x))) return 'Numbers only, please.';
    if (kind === 'Meal') return name.trim() ? { source: 'manual', type: 'meal', name: name.trim() } : 'Name your meal.';
    if (!m || m < 1) return 'How many minutes?';
    if (kind === 'Ride') return d && d > 0 ? { source: 'manual', type: 'ride', distance_km: d, duration_minutes: Math.round(m) } : 'How far did you ride (km)?';
    if (kind === 'Workout') return name.trim() ? { source: 'manual', type: 'workout', name: name.trim(), duration_minutes: Math.round(m), calories: c != null ? Math.round(c) : undefined } : 'Name your workout.';
    return { source: 'manual', type: 'yoga', duration_minutes: Math.round(m) };
  };

  const post = async () => {
    const activity: ActivityInput | null | string = run_id ? { source: 'run', run_id } : manual();
    if (typeof activity === 'string') {
      toast(activity, 'alert-circle-outline', colors.coral);
      return;
    }
    const text = caption.trim();
    if (!text && !activity) {
      toast('Write something first.', 'pencil-outline', colors.coral);
      return;
    }
    const profile = me.data?.user;
    setBusy(true);
    try {
      await postsApi.create({
        caption: text,
        backdrop: { scene, seed: Date.now() % 97 },
        sticker,
        city_id: city.id,
        area: profile && profile.city_id === city.id ? profile.area : null,
        activity,
      });
      invalidatePagedPrefix('social:feed');
      invalidatePagedPrefix('social:posts');
      invalidateRemote('social:me');
      toast('Posted to your feed', 'send', colors.primary);
      router.replace('/social');
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle-outline', colors.coral);
    } finally {
      setBusy(false);
    }
  };

  const avatar = me.data ? toAvatarUser(me.data.user, true) : { id: 'me', name: 'You', look, isMe: true };
  const runChip = run_id ? `🏃 ${[km && `${km} km`, min && `${min} min`, pace && `${pace}/km`].filter(Boolean).join(' · ') || 'Your run'}` : null;

  return (
    <Screen tabBar={false}>
      <Header back title="New Post" />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 10 }}>
        <Avatar user={avatar} size={44} link={false} />
        <TextInput value={caption} onChangeText={setCaption} placeholder="What did you move today?" placeholderTextColor={colors.dim} multiline style={styles.input} maxLength={CAPTION_MAX} />
      </View>
      <Text style={styles.counter}>{caption.length}/{CAPTION_MAX}</Text>

      <SceneImage kind={scene} seed={7} aspect={1.2} style={{ marginTop: 8 }} scrim={false}>
        {runChip && (
          <View style={styles.actChip}>
            <Text style={styles.actText}>{runChip}</Text>
            <Icon name="check-decagram" size={13} color={colors.primary} />
          </View>
        )}
        {sticker && <StickerArt kind={sticker} size={90} style={{ position: 'absolute', right: 12, top: 12, transform: [{ rotate: '8deg' }] }} />}
      </SceneImage>
      {run_id && <Text style={styles.note}>Distance and time come from the server’s record of this run.</Text>}

      {!run_id && (
        <>
          <Label style={{ marginTop: 18, marginBottom: 8 }}>Activity</Label>
          <Chips items={KINDS} value={kind} onChange={setKind} />
          {kind !== 'None' && (
            <View style={styles.fields}>
              {(kind === 'Workout' || kind === 'Meal') && <TextInput value={name} onChangeText={setName} placeholder={kind === 'Meal' ? 'What did you eat?' : 'Workout name (e.g. Push Day)'} placeholderTextColor={colors.mute} style={styles.field} maxLength={60} />}
              {kind !== 'Meal' && <TextInput value={minutes} onChangeText={setMinutes} placeholder="Minutes" placeholderTextColor={colors.mute} style={styles.field} keyboardType="number-pad" maxLength={4} />}
              {kind === 'Ride' && <TextInput value={distance} onChangeText={setDistance} placeholder="Distance (km)" placeholderTextColor={colors.mute} style={styles.field} keyboardType="decimal-pad" maxLength={6} />}
              {kind === 'Workout' && <TextInput value={kcal} onChangeText={setKcal} placeholder="Calories (optional)" placeholderTextColor={colors.mute} style={styles.field} keyboardType="number-pad" maxLength={5} />}
              <Text style={styles.note}>Self-reported activities show without the verified tick.</Text>
            </View>
          )}
        </>
      )}

      <Label style={{ marginTop: 18, marginBottom: 8 }}>Backdrop</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SCENES.map((s) => (
          <Pressable key={s} onPress={() => { tap(); setScene(s); }} style={[styles.thumb, scene === s && { borderColor: colors.primary }]} accessibilityLabel={s}>
            <SceneImage kind={s} seed={3} height={66} style={{ width: 66, borderRadius: radius.sm }} scrim={false} />
          </Pressable>
        ))}
      </ScrollView>

      <Label style={{ marginTop: 18, marginBottom: 8 }}>Sticker</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable onPress={() => setSticker(null)} style={[styles.sticker, !sticker && { borderColor: colors.primary }]}>
          <Text style={{ color: colors.dim, fontFamily: fonts.semibold }}>None</Text>
        </Pressable>
        {POST_STICKERS.map((k) => {
          const has = owned.has(STICKER_ITEM[k]) || k === 'neon-heart' || k === 'one-more-km';
          return (
            <Pressable key={k} disabled={!has} onPress={() => { tap(); setSticker(k); }} style={[styles.sticker, sticker === k && { borderColor: colors.primary }, !has && { opacity: 0.35 }]}>
              <StickerArt kind={k} size={56} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Button label={busy ? 'Posting…' : 'Post'} iconLeft="send" disabled={busy} onPress={post} style={{ marginTop: 22 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, minHeight: 60, color: colors.text, fontFamily: fonts.regular, fontSize: 16, paddingTop: 10, textAlignVertical: 'top' },
  counter: { color: colors.mute, fontFamily: fonts.mono, fontSize: 10, textAlign: 'right' },
  actChip: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,10,10,0.8)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  actText: { color: colors.onImage, fontFamily: fonts.semibold, fontSize: 12 },
  note: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 8 },
  fields: { gap: 8, marginTop: 10 },
  field: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  thumb: { borderRadius: radius.sm + 2, borderWidth: 2, borderColor: 'transparent' },
  sticker: { width: 70, height: 70, borderRadius: radius.md, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
