import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { AvatarCircle, GradientButton, Icon, IconButton, Tagline, tap } from '@/components/ui';
import { avatarRail, avatars, outfits } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

/** "Make it You" — avatar & style picker. */
export default function AvatarScreen() {
  const insets = useSafeAreaInsets();
  const { avatar, setAvatar, outfit, setOutfit } = useApp();
  const [rail, setRail] = useState('Outfits');
  const current = outfits.find((o) => o.id === outfit);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" size={30} onPress={() => router.back()} />
        <View style={{ alignItems: 'center', flex: 1, marginRight: 30 }}>
          <Tagline size={36} rotate={-4}>Make it You</Tagline>
          <Text style={styles.sub}>Choose your avatar & style</Text>
        </View>
      </View>

      <View style={styles.stage}>
        <View style={{ gap: 12 }}>
          {avatars.map((e, i) => (
            <Pressable key={i} onPress={() => { tap(); setAvatar(i); }}>
              <AvatarCircle emoji={e} size={52} ring={avatar === i ? colors.pink : colors.line} />
            </Pressable>
          ))}
        </View>

        <View style={styles.preview}>
          <View style={styles.glow} />
          <Text style={{ fontSize: 110 }}>{avatars[avatar]}</Text>
          <Text style={{ fontSize: 110, marginTop: -34 }}>{current?.emoji}</Text>
          <Text style={{ fontSize: 44, marginTop: -14 }}>👟👟</Text>
        </View>

        <View style={{ gap: 8 }}>
          {avatarRail.map((r) => {
            const on = rail === r.label;
            return (
              <Pressable key={r.label} onPress={() => { tap(); setRail(r.label); }} style={[styles.railItem, on && { borderColor: colors.pink }]}>
                <Icon name={r.icon} size={22} color={on ? colors.pink : colors.text} />
                <Text style={[styles.railText, on && { color: colors.pink }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 14 }}>
        {outfits.map((o) => (
          <Pressable key={o.id} onPress={() => { tap(); setOutfit(o.id); }} style={[styles.outfit, outfit === o.id && { borderColor: colors.pink }]}>
            <View style={[styles.swatch, { backgroundColor: o.color }]}>
              <Text style={{ fontSize: 34 }}>{o.emoji}</Text>
            </View>
          </Pressable>
        ))}
        <View style={[styles.outfit, { justifyContent: 'center' }]}>
          <Icon name="chevron-right" size={28} color={colors.pink} />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 16 }}>
        <GradientButton label="Continue" onPress={() => router.replace('/home')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  sub: { color: colors.dim, fontFamily: fonts.medium, marginTop: 4 },
  stage: { flex: 1, flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, alignItems: 'center' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: colors.purple, opacity: 0.25 },
  railItem: { width: 62, height: 58, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 2 },
  railText: { color: colors.text, fontSize: 10, fontFamily: fonts.medium },
  outfit: { width: 78, height: 84, borderRadius: radius.md, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 60, height: 66, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
