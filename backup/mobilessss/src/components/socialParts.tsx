/**
 * Shared pieces for backend-connected Social / Profile screens: author adapter, loading
 * skeleton, error + retry, sign-in prompt, empty feed and the Follow button.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Animated, Easing, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { Mascot } from '@/art/Mascot';
import type { AvatarUser } from '@/components/Avatar';
import { Button, Display, EmptyState, Icon, NATIVE, PressScale, TogglePill } from '@/components/ui';
import { isAuthError, socialErrorText, type Follower, type PostAuthor } from '@/api/social';
import { useFollow } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import type { FollowState } from '@/state/socialStore';
import type { AccessoryStyle, AvatarLook, BodyType, BottomStyle, HairStyle, TopStyle } from '@/types';
import { colors, fonts, radius } from '@/theme';

// ---------------------------------------------------------------------------
// Author → Avatar
// ---------------------------------------------------------------------------

const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(n) % xs.length];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

/** A stable illustrated look for someone who hasn't designed their avatar yet. */
export function defaultLook(id: string): AvatarLook {
  const h = hash(id);
  return {
    body: pick<BodyType>(['female', 'male'], h),
    skin: pick(['#F6D3B8', '#E8B48F', '#C98A5E', '#A0643A', '#6E4127', '#4A2A1A'], h >> 1),
    hair: pick<HairStyle>(['bun', 'long', 'ponytail', 'short', 'curly', 'buzz', 'afro', 'bob'], h >> 3),
    hairColor: pick(['#1A1116', '#3B2218', '#6B3A1F', '#E5C07B'], h >> 5),
    top: pick<TopStyle>(['hoodie', 'tee', 'crop', 'tank', 'jacket'], h >> 7),
    topColor: pick(['#D7FF1F', '#FF2D9B', '#A855F7', '#16101E', '#FFFFFF'], h >> 9),
    bottom: pick<BottomStyle>(['joggers', 'shorts', 'leggings'], h >> 11),
    bottomColor: pick(['#16101E', '#1B1524', '#A855F7'], h >> 13),
    shoeColor: pick(['#FFFFFF', '#D7FF1F'], h >> 15),
    accessory: pick<AccessoryStyle>(['none', 'shades', 'cap', 'headphones', 'headband'], h >> 17),
  };
}

export const toAvatarUser = (a: Pick<PostAuthor, 'id' | 'display_name' | 'avatar_look' | 'avatar_url'>, isMe = false): AvatarUser => ({
  id: a.id,
  name: a.display_name,
  look: a.avatar_look ?? defaultLook(a.id),
  photo: a.avatar_url,
  isMe,
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function Shimmer({ style }: { style: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(v, { toValue: 0.45, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ backgroundColor: colors.cardHi, opacity: v }, style]} />;
}

/** Placeholder post cards while a feed loads. */
export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading posts" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skelPost}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Shimmer style={{ width: 40, height: 40, borderRadius: 20 }} />
            <View style={{ marginLeft: 10, gap: 6 }}>
              <Shimmer style={{ width: 120, height: 12, borderRadius: 6 }} />
              <Shimmer style={{ width: 80, height: 10, borderRadius: 5 }} />
            </View>
          </View>
          <Shimmer style={{ height: 260 }} />
          <View style={{ padding: 12, gap: 8 }}>
            <Shimmer style={{ width: '60%', height: 12, borderRadius: 6 }} />
            <Shimmer style={{ width: '85%', height: 12, borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Short block placeholder (profile header, comments). */
export function BlockSkeleton({ height = 80, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <Shimmer style={[{ height, borderRadius: radius.lg }, style]} />;
}

// ---------------------------------------------------------------------------
// Errors / empty / signed out
// ---------------------------------------------------------------------------

/** Full-width error with a Retry (or Sign in, when the session expired). */
export function SocialError({ error, onRetry, compact }: { error: unknown; onRetry: () => void; compact?: boolean }) {
  const auth = isAuthError(error);
  const text = socialErrorText(error);
  if (compact) {
    return (
      <View style={styles.errRow}>
        <Icon name="cloud-off-outline" size={18} color={colors.coral} />
        <Text style={styles.errText} numberOfLines={3}>{text}</Text>
        <Text onPress={auth ? () => router.push('/sign-in') : onRetry} style={styles.retry} accessibilityRole="button">
          {auth ? 'Sign in' : 'Retry'}
        </Text>
      </View>
    );
  }
  return (
    <EmptyState
      art={<Mascot pose="sit" size={120} />}
      title={auth ? 'Signed out' : "Couldn't load"}
      body={text}
      action={auth ? 'Sign in' : 'Try again'}
      onAction={auth ? () => router.push('/sign-in') : onRetry}
    />
  );
}

/** Demo mode / no Social service: say so plainly instead of showing made-up people. */
export function SignInToSocial({ title = 'Join the crew', body = 'Sign in to see real posts, follow friends and share your runs.' }: { title?: string; body?: string }) {
  return <EmptyState art={<Mascot pose="wave" size={130} />} title={title} body={body} action="Sign in" onAction={() => router.push('/sign-in')} />;
}

export function EmptyFeed({ body, onCreate }: { body: string; onCreate?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 }}>
      <Mascot pose="sleep" size={140} />
      <Display size={26} style={{ marginTop: 10, textAlign: 'center' }}>No posts yet</Display>
      <Text style={styles.emptyBody}>{body}</Text>
      {onCreate && <Button label="Create a post" size="md" iconLeft="plus" onPress={onCreate} style={{ marginTop: 16, alignSelf: 'stretch' }} />}
    </View>
  );
}

/** Destructive-action confirm: native alert on devices, window.confirm on web. */
export function confirmAction(title: string, message: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof globalThis.confirm === 'function' ? globalThis.confirm(`${title}\n\n${message}`) : true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

// ---------------------------------------------------------------------------
// Follow
// ---------------------------------------------------------------------------

/**
 * Follow / Following / Requested, with optimistic state that rolls back (and toasts why) if the
 * server refuses.
 */
export function useFollowToggle(userId: string, server: FollowState, username?: string, onDone?: () => void) {
  const f = useFollow(userId, server);
  const { toast } = useApp();
  const onPress = () =>
    f
      .toggle()
      .then((r) => {
        if (r?.requested) toast('Follow request sent', 'account-clock', colors.primary);
        else if (r?.following && username) toast(`Following @${username}`, 'account-check', colors.primary);
        if (r) onDone?.();
      })
      .catch((e) => toast(socialErrorText(e), 'alert-circle-outline', colors.coral));
  return { ...f, onPress, label: f.following ? 'Following' : f.requested ? 'Requested' : 'Follow' };
}

export function FollowPill({ userId, server, username, style }: { userId: string; server: FollowState; username?: string; style?: StyleProp<ViewStyle> }) {
  const f = useFollowToggle(userId, server, username);
  return <TogglePill on={f.following || f.requested} onPress={f.onPress} labelOff="Follow" labelOn={f.requested ? 'Requested' : 'Following'} color={colors.primary} style={style} accessibilityLabel={f.label} />;
}

/** A person in a list (followers, following, search): avatar, name, handle, Follow. */
export function PersonRow({ user, right }: { user: Follower; right?: ReactNode }) {
  return (
    <PressScale onPress={() => router.push(user.is_me ? '/profile' : { pathname: '/user/[id]', params: { id: user.id } })} style={styles.person} scaleTo={0.985} accessibilityLabel={`${user.display_name}, @${user.username}`}>
      <Avatar user={toAvatarUser(user, user.is_me)} size={46} level={user.level} link={false} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.personName} numberOfLines={1}>{user.display_name}</Text>
          {user.verified && <Icon name="check-decagram" size={14} color={colors.secondary} />}
        </View>
        <Text style={styles.personSub} numberOfLines={1}>@{user.username}{user.area ? ` · ${user.area}` : ''}</Text>
      </View>
      {right ?? (!user.is_me && <FollowPill userId={user.id} server={{ following: user.following, requested: user.requested }} username={user.username} style={{ minWidth: 96, paddingVertical: 7 }} />)}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10, marginBottom: 8 },
  personName: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 },
  personSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  skelPost: { marginBottom: 16, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,90,90,0.35)', padding: 12, marginVertical: 8 },
  errText: { flex: 1, color: colors.sub, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  retry: { color: colors.primary, fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  emptyBody: { color: colors.dim, fontFamily: fonts.regular, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
