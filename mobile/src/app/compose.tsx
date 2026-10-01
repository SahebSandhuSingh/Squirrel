import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { StickerArt } from '@/art/Sticker';
import { Avatar } from '@/components/Avatar';
import { SceneImage } from '@/components/cards';
import { Button, Header, Label, Screen, tap } from '@/components/ui';
import { PhotoUpload, type ApprovedPhoto } from '@/components/media/PhotoUpload';
import { NotLiveYet } from '@/components/campus/States';
import { useApp } from '@/state/AppState';
import type { SceneKind, StickerKind } from '@/types';
import { colors, fonts, radius } from '@/theme';

const SCENES: SceneKind[] = ['city-sunset', 'run', 'yoga', 'brunch', 'cafe', 'rooftop', 'lake', 'city-night', 'hiit', 'cycling', 'stadium'];
const STICKERS: StickerKind[] = ['one-more-km', 'fire', 'good-vibes', 'neon-heart', 'squirrel-flex', 'hydrate'];
type RunActivity = { km: number; minutes: number; pace: string };

/**
 * Post composer (also reached after finishing a run, with that run's real numbers prefilled).
 * Posting has no backend on this build, so it says "Posts · Not live yet" and Post is disabled:
 * nothing is saved locally or shown in a feed as if it had been posted.
 */
export default function Compose() {
  const { km, min, pace } = useLocalSearchParams<{ km?: string; min?: string; pace?: string }>();
  const { me } = useApp();
  const [scene, setScene] = useState<SceneKind>(km ? 'run' : 'city-sunset');
  const [sticker, setSticker] = useState<StickerKind | undefined>(km ? 'one-more-km' : undefined);
  const [caption, setCaption] = useState(km ? `Just one more km turned into ${km}. 🏃‍♀️` : '');
  const [photo, setPhoto] = useState<ApprovedPhoto | null>(null);
  const activity: RunActivity | undefined = km ? { km: +km, minutes: +(min ?? 0), pace: pace ?? '' } : undefined;

  return (
    <Screen tabBar={false}>
      <Header back title={activity ? 'Share your run' : 'New Post'} />
      <NotLiveYet name="Posts" compact body="Sharing posts switches on once the feed backend is connected. Your run is already saved by the Run Module." />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 10 }}>
        <Avatar user={me} size={44} link={false} />
        <TextInput value={caption} onChangeText={setCaption} placeholder="What did you move today?" placeholderTextColor={colors.dim} multiline style={styles.input} maxLength={280} />
      </View>

      <SceneImage kind={scene} seed={7} aspect={1.2} style={{ marginTop: 14 }} scrim={false}>
        {photo && <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your approved photo" />}
        {activity && (
          <View style={styles.actChip}>
            <Text style={styles.actText}>🏃 {activity.km} km · {activity.minutes} min · {activity.pace}/km</Text>
          </View>
        )}
        {sticker && <StickerArt kind={sticker} size={90} style={{ position: 'absolute', right: 12, top: 12, transform: [{ rotate: '8deg' }] }} />}
      </SceneImage>

      <Label style={{ marginTop: 18, marginBottom: 8 }}>Photo</Label>
      <PhotoUpload
        purpose="post"
        onChange={(p) => setPhoto(p)}
      />

      <Label style={{ marginTop: 18, marginBottom: 8 }}>{photo ? 'Backdrop (behind your photo)' : 'Backdrop'}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SCENES.map((s) => (
          <Pressable key={s} onPress={() => { tap(); setScene(s); }} style={[styles.thumb, scene === s && { borderColor: colors.primary }]} accessibilityLabel={s}>
            <SceneImage kind={s} seed={3} height={66} style={{ width: 66, borderRadius: radius.sm }} scrim={false} />
          </Pressable>
        ))}
      </ScrollView>

      <Label style={{ marginTop: 18, marginBottom: 8 }}>Sticker</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable onPress={() => setSticker(undefined)} style={[styles.sticker, !sticker && { borderColor: colors.primary }]}>
          <Text style={{ color: colors.dim, fontFamily: fonts.semibold }}>None</Text>
        </Pressable>
        {STICKERS.map((k) => {
          return (
            <Pressable key={k} onPress={() => { tap(); setSticker(k); }} style={[styles.sticker, sticker === k && { borderColor: colors.primary }]} accessibilityLabel={k}>
              <StickerArt kind={k} size={56} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Button label="Posting · Not live yet" iconLeft="lock-outline" onPress={() => {}} disabled style={{ marginTop: 22 }} accessibilityLabel="Post. Not live yet, nothing is sent." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, minHeight: 60, color: colors.text, fontFamily: fonts.regular, fontSize: 16, paddingTop: 10, textAlignVertical: 'top' },
  actChip: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(10,10,10,0.8)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  actText: { color: colors.onImage, fontFamily: fonts.semibold, fontSize: 12 },
  thumb: { borderRadius: radius.sm + 2, borderWidth: 2, borderColor: 'transparent' },
  sticker: { width: 70, height: 70, borderRadius: radius.md, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
