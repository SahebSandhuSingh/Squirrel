import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StickerArt } from '@/art/Sticker';
import { Avatar } from '@/components/Avatar';
import { SceneImage } from '@/components/cards';
import { Button, Header, Label, Screen, tap } from '@/components/ui';
import type { Activity, Post } from '@/data/posts';
import { useApp } from '@/state/AppState';
import type { SceneKind, StickerKind } from '@/types';
import { colors, fonts, radius } from '@/theme';

const SCENES: SceneKind[] = ['city-sunset', 'run', 'gym', 'yoga', 'brunch', 'cafe', 'rooftop', 'lake', 'city-night', 'hiit', 'cycling', 'stadium'];
const STICKERS: NonNullable<Post['sticker']>[] = ['one-more-km', 'fire', 'good-vibes', 'neon-heart', 'squirrel-flex', 'hydrate'];

/** Post composer (also reached after finishing a run with the run prefilled). */
export default function Compose() {
  const { km, min, pace } = useLocalSearchParams<{ km?: string; min?: string; pace?: string }>();
  const { me, addPost, owned } = useApp();
  const [scene, setScene] = useState<SceneKind>(km ? 'run' : 'city-sunset');
  const [sticker, setSticker] = useState<Post['sticker']>(km ? 'one-more-km' : undefined);
  const [caption, setCaption] = useState(km ? `Just one more km turned into ${km}. 🏃‍♀️` : '');
  const activity: Activity | undefined = km ? { type: 'run', km: +km, minutes: +(min ?? 0), pace: pace ?? '' } : undefined;

  const post = () => {
    addPost({ caption: caption.trim() || 'Moving with the crew 💪', scene, seed: Date.now() % 97, activity, sticker });
    router.replace('/social');
  };

  return (
    <Screen tabBar={false}>
      <Header back title="New Post" />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 10 }}>
        <Avatar user={me} size={44} link={false} />
        <TextInput value={caption} onChangeText={setCaption} placeholder="What did you move today?" placeholderTextColor={colors.dim} multiline style={styles.input} maxLength={280} />
      </View>

      <SceneImage kind={scene} seed={7} aspect={1.2} style={{ marginTop: 14 }} scrim={false}>
        {activity && (
          <View style={styles.actChip}>
            <Text style={styles.actText}>🏃 {activity.km} km · {activity.minutes} min · {activity.pace}/km</Text>
          </View>
        )}
        {sticker && <StickerArt kind={sticker} size={90} style={{ position: 'absolute', right: 12, top: 12, transform: [{ rotate: '8deg' }] }} />}
      </SceneImage>

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
        <Pressable onPress={() => setSticker(undefined)} style={[styles.sticker, !sticker && { borderColor: colors.primary }]}>
          <Text style={{ color: colors.dim, fontFamily: fonts.semibold }}>None</Text>
        </Pressable>
        {STICKERS.map((k) => {
          const id = { 'one-more-km': 'st-km', fire: 'st-fire', 'good-vibes': 'st-vibes', 'neon-heart': 'st-heart', 'squirrel-flex': 'st-flex', hydrate: 'st-hydrate' }[k];
          const has = owned.has(id) || k === 'neon-heart' || k === 'one-more-km';
          return (
            <Pressable key={k} disabled={!has} onPress={() => { tap(); setSticker(k); }} style={[styles.sticker, sticker === k && { borderColor: colors.primary }, !has && { opacity: 0.35 }]}>
              <StickerArt kind={k as StickerKind} size={56} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Button label="Post · +20 XP" iconLeft="send" onPress={post} style={{ marginTop: 22 }} />
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
