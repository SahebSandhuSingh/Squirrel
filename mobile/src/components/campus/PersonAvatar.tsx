import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { PersonLite } from '@/api/campus';
import { Avatar } from '@/components/Avatar';
import { tap } from '@/components/ui';
import { users } from '@/data/users';
import { colors, fonts } from '@/theme';

const PALETTE = [colors.primary, colors.secondary, colors.purple, colors.blue, colors.orange, colors.green];

/**
 * Photo when the backend has one; the illustrated avatar for people who built one in-app;
 * otherwise a coloured initial. Never borrows someone else's face.
 */
export function PersonAvatar({ person, size = 44, ring, link = true }: { person: Pick<PersonLite, 'user_id' | 'display_name' | 'avatar_url'>; size?: number; ring?: string; link?: boolean }) {
  const local = users.find((u) => u.id === person.user_id);
  const open = () => {
    tap();
    router.push({ pathname: '/user/[id]', params: { id: person.user_id } });
  };
  let body: React.ReactNode;
  if (person.avatar_url) {
    body = <Image source={{ uri: person.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring }} accessibilityIgnoresInvertColors />;
  } else if (local) {
    body = <Avatar user={local} size={size} ring={ring ?? false} link={false} />;
  } else {
    const c = PALETTE[person.user_id.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) % PALETTE.length];
    body = (
      <View style={[styles.initial, { width: size, height: size, borderRadius: size / 2, borderColor: ring ?? c }]}>
        <Text style={[styles.initialText, { fontSize: size * 0.42, color: c }]}>{person.display_name.slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  }
  if (!link) return <>{body}</>;
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Open ${person.display_name}'s profile`}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  initial: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: colors.cardHi },
  initialText: { fontFamily: fonts.display },
});
