import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { SocialPost } from '@/components/cards';
import { BlockSkeleton, confirmAction, FeedSkeleton, SignInToSocial, SocialError, toAvatarUser } from '@/components/socialParts';
import { Button, EmptyState, Header, IconButton, Screen } from '@/components/ui';
import { commentsApi, socialErrorText, type Comment } from '@/api/social';
import { COMMENT_MAX } from '@/api/socialRules';
import { timeAgo } from '@/data/posts';
import { useComments, useMyProfile, usePost } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { bumpComments } from '@/state/socialStore';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/** Post detail + comments (GET/POST /v1/posts/:id/comments, DELETE /v1/comments/:id). */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { toast, look } = useApp();
  const post = usePost(id);
  const comments = useComments(id);
  const me = useMyProfile();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Comments you add or remove here, layered over the fetched pages.
  const [added, setAdded] = useState<Comment[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  if (!post.enabled) {
    return (
      <Screen tabBar={false}>
        <Header back title="Post" />
        <SignInToSocial />
      </Screen>
    );
  }
  if (post.deleted) {
    return (
      <Screen tabBar={false}>
        <Header back title="Post" />
        <EmptyState title="Post deleted" body="It's gone, along with its likes and comments." action="Back to Social" onAction={() => router.replace('/social')} />
      </Screen>
    );
  }
  if (!post.data) {
    return (
      <Screen tabBar={false}>
        <Header back title="Post" />
        {post.error ? <SocialError error={post.error} onRetry={post.reload} /> : <FeedSkeleton count={1} />}
      </Screen>
    );
  }
  const p = post.data;
  const list = [...comments.items, ...added.filter((a) => !comments.items.some((c) => c.id === a.id))].filter((c) => !removed.has(c.id));

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const c = await commentsApi.create(p.id, body);
      setAdded((xs) => [...xs, c]);
      bumpComments(p, 1);
      setDraft('');
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle-outline', colors.coral);
    } finally {
      setSending(false);
    }
  };

  const remove = async (c: Comment) => {
    if (!(await confirmAction('Delete comment?', 'This can’t be undone.'))) return;
    setRemoved((s) => new Set(s).add(c.id));
    try {
      await commentsApi.remove(c.id);
      bumpComments(p, -1);
    } catch (e) {
      setRemoved((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
      toast(socialErrorText(e), 'alert-circle-outline', colors.coral);
    }
  };

  const myAvatar = me.data ? toAvatarUser(me.data.user, true) : { id: 'me', name: 'You', look, isMe: true };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tabBar={false} style={{ paddingBottom: 100 }}>
        <Header back title="Post" />
        <View style={{ marginTop: 8 }}>
          <SocialPost post={p} onDeleted={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />
        </View>
        <Text style={styles.h}>{p.comments_count.toLocaleString('en-IN')} comment{p.comments_count === 1 ? '' : 's'}</Text>
        {comments.loading && !list.length ? (
          <View style={{ gap: 10 }}>
            <BlockSkeleton height={44} />
            <BlockSkeleton height={44} />
          </View>
        ) : comments.error && !list.length ? (
          <SocialError compact error={comments.error} onRetry={comments.retry} />
        ) : !list.length ? (
          <Text style={styles.empty}>No comments yet. Say something nice.</Text>
        ) : null}
        {list.map((c) => (
          <View key={c.id} style={styles.comment}>
            <Avatar user={toAvatarUser(c.author)} size={34} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cText}>
                <Text style={{ fontFamily: fonts.bold, color: colors.text }}>{c.author.username} </Text>
                {c.body}
              </Text>
              <Text style={styles.ago}>{timeAgo(c.created_at)}</Text>
            </View>
            {c.can_delete && (
              <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityLabel="Delete comment">
                <Text style={styles.del}>Delete</Text>
              </Pressable>
            )}
          </View>
        ))}
        {comments.hasMore && (
          comments.loadingMore ? <ActivityIndicator color={colors.primary} /> : <Button label="Load more comments" variant="secondary" size="sm" onPress={comments.loadMore} />
        )}
        {!!comments.error && list.length > 0 && <SocialError compact error={comments.error} onRetry={comments.retry} />}
      </Screen>
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.inputInner}>
          <Avatar user={myAvatar} size={34} link={false} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            placeholderTextColor={colors.dim}
            style={styles.input}
            onSubmitEditing={send}
            returnKeyType="send"
            maxLength={COMMENT_MAX}
            editable={!sending}
          />
          {sending ? <ActivityIndicator color={colors.primary} /> : <IconButton icon="send" color={draft.trim() ? colors.primary : colors.dim} onPress={send} label="Send" />}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  h: { color: colors.sub, fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  empty: { color: colors.dim, fontFamily: fonts.regular, fontSize: 14, marginBottom: 12 },
  comment: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  cText: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  ago: { color: colors.mute, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  del: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textTransform: 'uppercase', marginLeft: 8, marginTop: 3 },
  inputBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 16, backgroundColor: 'rgba(17,17,19,0.98)', borderTopWidth: 1, borderTopColor: colors.line },
  inputInner: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: MAX_WIDTH - 32, alignSelf: 'center' },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 14, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, height: 42, borderWidth: 1, borderColor: colors.line },
});
