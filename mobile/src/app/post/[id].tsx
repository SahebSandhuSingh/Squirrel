import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { SocialPost } from '@/components/cards';
import { EmptyState, Header, IconButton, Screen } from '@/components/ui';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

const SEED_COMMENTS = [
  { u: 'u_meera', t: 'That sunset though 😍', ago: '1h' },
  { u: 'u_zoya', t: 'Pace is looking strong!! See you Thursday', ago: '1h' },
  { u: 'u_dev', t: 'Early Birds would be proud 🐦', ago: '45m' },
  { u: 'u_isha', t: 'Brunch after next time? 🥑', ago: '20m' },
];

/** Post detail + comments. */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { posts, me } = useApp();
  const post = posts.find((p) => p.id === id);
  const [comments, setComments] = useState(SEED_COMMENTS);
  const [draft, setDraft] = useState('');

  if (!post) return <Screen tabBar={false}><Header back title="Post" /><EmptyState title="Post not found" body="It may have been removed." /></Screen>;

  const send = () => {
    if (!draft.trim()) return;
    setComments([...comments, { u: me.id, t: draft.trim(), ago: 'now' }]);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tabBar={false} style={{ paddingBottom: 100 }}>
        <Header back title="Post" />
        <View style={{ marginTop: 8 }}>
          <SocialPost post={post} />
        </View>
        <Text style={styles.h}>{comments.length} comments</Text>
        {comments.map((c, i) => {
          const u = c.u === me.id ? me : userById(c.u);
          return (
            <View key={i} style={styles.comment}>
              <Avatar user={u} size={34} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.cText}>
                  <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{u.handle} </Text>
                  {c.t}
                </Text>
                <Text style={styles.ago}>{c.ago}</Text>
              </View>
            </View>
          );
        })}
      </Screen>
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.inputInner}>
          <Avatar user={me} size={34} link={false} />
          <TextInput value={draft} onChangeText={setDraft} placeholder="Add a comment…" placeholderTextColor={colors.dim} style={styles.input} onSubmitEditing={send} returnKeyType="send" />
          <IconButton icon="send" color={colors.primary} onPress={send} label="Send" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  h: { color: colors.sub, fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  comment: { flexDirection: 'row', marginBottom: 14 },
  cText: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  ago: { color: colors.mute, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  inputBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 16, backgroundColor: 'rgba(7,5,13,0.97)', borderTopWidth: 1, borderTopColor: colors.line },
  inputInner: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: MAX_WIDTH - 32, alignSelf: 'center' },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 14, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: colors.line },
});
