import { FeatureGate, SoonPill, useLocks } from '@/components/Locked';
import { LOCKED_MISSIONS } from '@/data/features';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Scene } from '@/art/Scene';
import { ProductArt } from '@/art/Product';
import { StickerArt } from '@/art/Sticker';
import { RewardArt } from '@/art/Reward';
import { Mascot } from '@/art/Mascot';
import { Avatar, AvatarStack, type AvatarUser } from '@/components/Avatar';
import { Card, CoinIcon, Icon, IconBadge, NATIVE, PressScale, ProgressBar, Scrim, TogglePill, tap, textStyles } from '@/components/ui';
import type { Crew, EventItem } from '@/data/community';
import { formatEventDate } from '@/data/community';
import type { Mission } from '@/data/missions';
import { describeActivity, timeAgo, type Post } from '@/data/posts';
import { socialErrorText, type Follower } from '@/api/social';
import { confirmAction, FollowPill, toAvatarUser, useFollowToggle } from '@/components/socialParts';
import { usePostView } from '@/hooks/useSocial';
import { deletePost, toggleLike, toggleSave } from '@/state/socialStore';
import { rarityColor, type ShopItem } from '@/data/shop';
import type { Stat } from '@/data/stats';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import type { RewardArtKind, SceneKind } from '@/types';
import { colors, fonts, radius } from '@/theme';

// ---------------------------------------------------------------------------
// Scene image
// ---------------------------------------------------------------------------

export function SceneImage({ kind, seed, height, aspect, style, children, scrim = true }: { kind: SceneKind; seed?: number; height?: number; aspect?: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode; scrim?: boolean | 'strong' }) {
  return (
    <View style={[{ height, aspectRatio: height ? undefined : aspect, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bg2 }, style]}>
      <Scene kind={kind} seed={seed} aspect={aspect ?? 1.6} style={StyleSheet.absoluteFill} />
      {scrim && <Scrim strong={scrim === 'strong'} />}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toFixed(n % 1 === 0.5 ? 1 : 2).replace(/0$/, ''));

export function MissionCard({ mission: m, onLog, claimed, compact }: { mission: Mission; onLog: () => void; claimed: boolean; compact?: boolean }) {
  const locked = LOCKED_MISSIONS.has(m.id);
  const done = !locked && m.current >= m.goal;
  const pop = useAnimatedValue(done ? 1 : 0);
  useEffect(() => {
    if (done) Animated.spring(pop, { toValue: 1, useNativeDriver: NATIVE, speed: 12, bounciness: 14 }).start();
  }, [done, pop]);

  if (locked) {
    return (
      <View style={[styles.mission, { opacity: 0.6 }]} accessibilityLabel={`${m.title}, coming soon`}>
        <IconBadge icon={m.icon} color={colors.mute} size={compact ? 40 : 46} />
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={[styles.mTitle, { color: colors.sub }]} numberOfLines={1}>{m.title}</Text>
          <Text style={styles.mSub}>Not available yet</Text>
        </View>
        <SoonPill />
      </View>
    );
  }

  return (
    <View style={[styles.mission, done && { borderColor: claimed ? 'rgba(215,255,31,0.35)' : `${m.color}99`, backgroundColor: claimed ? 'rgba(215,255,31,0.05)' : colors.card }]}>
      {done && !claimed && <LinearGradient colors={[`${m.color}26`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />}
      <IconBadge icon={m.icon} color={m.color} size={compact ? 40 : 46} />
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={[styles.mTitle, claimed && { color: colors.sub }]} numberOfLines={1}>
          {m.title}
        </Text>
        <Text style={styles.mSub}>
          <Text style={{ color: done ? colors.green : colors.text, fontFamily: fonts.semibold }}>{fmt(m.current)}</Text> / {fmt(m.goal)}
          {m.unit ? ` ${m.unit}` : ''}
        </Text>
        <ProgressBar progress={m.current / m.goal} color={done ? colors.green : m.color} color2={done ? '#9CFFD2' : colors.primarySoft} style={{ marginTop: 7 }} height={5} />
      </View>
      <View style={{ alignItems: 'center', minWidth: 58 }}>
        {done ? (
          <Animated.View style={{ transform: [{ scale: pop }], alignItems: 'center' }}>
            <View style={[styles.doneDot, { backgroundColor: claimed ? colors.green : colors.gold }]}>
              <Icon name={claimed ? 'check-bold' : 'gift'} size={16} color={colors.onSecondary} />
            </View>
            <Text style={[styles.xp, claimed && { color: colors.green }]}>{claimed ? 'Claimed' : `+${m.xp} XP`}</Text>
          </Animated.View>
        ) : (
          <PressScale onPress={onLog} accessibilityLabel={`Log progress for ${m.title}`} style={{ alignItems: 'center' }}>
            <View style={styles.logBtn}>
              <Icon name="plus" size={18} color={colors.text} />
            </View>
            <Text style={styles.xp}>+{m.xp} XP</Text>
          </PressScale>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Crews & events
// ---------------------------------------------------------------------------

/** `members`: the avatars to show (a live crew's; demo crews look theirs up). */
export function CrewCard({ crew, joined, onToggle, members }: { crew: Crew; joined: boolean; onToggle: () => void; members?: AvatarUser[] }) {
  return (
    <PressScale onPress={() => router.push({ pathname: '/crew/[id]', params: { id: crew.id } })} style={styles.row} scaleTo={0.985}>
      <View style={[styles.crewIcon, { backgroundColor: crew.color }]}>
        <Icon name={crew.icon} size={26} color={colors.onSecondary} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={styles.title} numberOfLines={1}>{crew.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {crew.members.toLocaleString('en-IN')} members · {crew.scope}
        </Text>
        <View style={{ marginTop: 6 }}>
          <AvatarStack users={members ?? crew.memberIds.map(userById)} size={20} />
        </View>
      </View>
      <TogglePill on={joined} onPress={onToggle} labelOff="Join" labelOn="Joined" />
    </PressScale>
  );
}

/** `attendees`: the avatars to show (a live event's; demo events look theirs up). */
export function EventCard({ event, going, onToggle, variant = 'row', attendees: shown }: { event: EventItem; going: boolean; onToggle: () => void; variant?: 'row' | 'hero'; attendees?: AvatarUser[] }) {
  // Lock-aware: while Events are locked every usage renders the same inert "Coming soon" card.
  const locks = useLocks();
  const locked = locks.locked('events');
  const attendees = shown ?? event.attendeeIds.map(userById);
  const open = locks.guard('events', () => router.push({ pathname: '/event/[id]', params: { id: event.id } }));
  const a11y = locked ? `${event.title}, coming soon` : event.title;
  if (variant === 'hero') {
    return (
      <PressScale onPress={open} style={[{ width: 250 }, locked && styles.lockedCard]} scaleTo={0.98} accessibilityLabel={a11y}>
        <SceneImage kind={event.scene} seed={event.title.length} height={150} scrim="strong">
          <FeatureGate feature="events" fallback={<SoonPill onImage style={styles.heroLock} />}>
            {event.xp > 0 && (
              <View style={styles.heroBadge}>
                <Icon name={event.icon} size={13} color={colors.onImage} />
                <Text style={styles.heroBadgeText}>+{event.xp} XP</Text>
              </View>
            )}
          </FeatureGate>
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 10 }}>
            <Text style={styles.heroTitle} numberOfLines={1}>{event.title}</Text>
            <Text style={textStyles.overlaySub} numberOfLines={1}>{formatEventDate(event.startsAt)}</Text>
          </View>
        </SceneImage>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <AvatarStack users={attendees} extra={event.going + (going ? 1 : 0)} size={22} />
          <FeatureGate feature="events">
            <TogglePill on={going} onPress={onToggle} labelOff="Join" labelOn="Going" color={colors.primary} style={{ minWidth: 70, paddingVertical: 6 }} />
          </FeatureGate>
        </View>
      </PressScale>
    );
  }
  return (
    <PressScale onPress={open} style={[styles.row, locked && styles.lockedCard]} scaleTo={0.985} accessibilityLabel={a11y}>
      <SceneImage kind={event.scene} seed={event.title.length} height={112} style={{ width: 118, borderRadius: radius.md }} scrim="strong">
        <View style={{ position: 'absolute', left: 6, bottom: 6 }}>
          <AvatarStack users={attendees.slice(0, 3)} extra={event.going + (going ? 1 : 0)} size={20} />
        </View>
      </SceneImage>
      <View style={{ flex: 1, marginLeft: 12, alignSelf: 'stretch', justifyContent: 'space-between' }}>
        <View>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <View style={styles.metaRow}>
            <Icon name={event.online ? 'video-outline' : 'map-marker-outline'} size={13} color={colors.dim} />
            <Text style={styles.meta} numberOfLines={1}>{event.venue}</Text>
          </View>
          <View style={styles.metaRow}>
            <Icon name="clock-outline" size={13} color={colors.dim} />
            <Text style={styles.meta} numberOfLines={1}>{formatEventDate(event.startsAt)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.xpSmall}>{event.xp > 0 ? `+${event.xp} XP` : event.host}</Text>
          <FeatureGate feature="events">
            <TogglePill on={going} onPress={onToggle} labelOff="Join" labelOn="Going" color={colors.primary} style={{ paddingVertical: 7 }} />
          </FeatureGate>
        </View>
      </View>
    </PressScale>
  );
}

// ---------------------------------------------------------------------------
// Social
// ---------------------------------------------------------------------------

export function SocialPost({ post: raw, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const { toast } = useApp();
  const post = usePostView(raw);
  const author = post.author;
  const avatarUser = toAvatarUser(author, post.is_mine);
  const follow = useFollowToggle(author.id, { following: post.following_author, requested: post.requested_author }, author.username);
  const [heart] = useState(() => new Animated.Value(0));
  const lastTap = useRef<number>(0);
  const fail = (e: unknown) => toast(socialErrorText(e), 'alert-circle-outline', colors.coral);

  const like = () => {
    tap('impact');
    if (!post.liked_by_me) {
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, { toValue: 1, useNativeDriver: NATIVE, speed: 20, bounciness: 12 }),
        Animated.timing(heart, { toValue: 0, duration: 350, delay: 250, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
      ]).start();
    }
    toggleLike(post).catch(fail);
  };
  const save = () => {
    tap();
    toggleSave(post)
      .then((saved) => saved && toast('Saved to your collection', 'bookmark', '#FFD21F'))
      .catch(fail);
  };
  const remove = async () => {
    if (!(await confirmAction('Delete post?', 'This removes the post, its likes and comments.'))) return;
    deletePost(post.id)
      .then(() => {
        toast('Post deleted', 'delete-outline', colors.dim);
        onDeleted?.();
      })
      .catch(fail);
  };
  const act = post.activity ? describeActivity(post.activity) : null;
  const showFollow = !post.is_mine && !follow.following && !follow.requested;
  const overlay = (
    <>
      {act && (
        <View style={styles.actChip}>
          <Icon name={act.icon} size={14} color={colors.primary} />
          <Text style={styles.actText}>{act.text}</Text>
          {post.activity?.verified && <Icon name="check-decagram" size={13} color={colors.primary} accessibilityLabel="Verified activity" />}
        </View>
      )}
      {post.sticker && <StickerArt kind={post.sticker} size={78} style={{ position: 'absolute', right: 10, top: 10, transform: [{ rotate: '8deg' }] }} />}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
        <Icon name="heart" size={96} color={colors.primary} style={{ textShadowColor: colors.primary, textShadowRadius: 20 }} />
      </Animated.View>
    </>
  );

  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <Avatar user={avatarUser} size={40} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.author} numberOfLines={1}>{author.display_name}</Text>
            {author.verified && <Icon name="check-decagram" size={14} color={colors.secondary} />}
            <Text style={styles.lvl}>LV {author.level}</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {[timeAgo(post.created_at), post.area, post.crew_name].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {showFollow ? (
          <Pressable onPress={follow.onPress} hitSlop={8} style={styles.followBtn} accessibilityLabel={`Follow ${author.display_name}`}>
            <Text style={styles.followText}>Follow</Text>
          </Pressable>
        ) : post.is_mine ? (
          <Pressable onPress={remove} hitSlop={8} accessibilityLabel="Delete post">
            <Icon name="dots-horizontal" size={22} color={colors.dim} />
          </Pressable>
        ) : (
          <Icon name="dots-horizontal" size={22} color={colors.dim} />
        )}
      </View>

      <Pressable
        onPress={() => {
          const now = Date.now();
          if (now - lastTap.current < 300 && !post.liked_by_me) like();
          lastTap.current = now;
        }}>
        {post.media_url ? (
          <View style={{ aspectRatio: 1 / 1.2, backgroundColor: colors.cardHi }}>
            <Image source={{ uri: post.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
            {overlay}
          </View>
        ) : (
          <SceneImage kind={post.backdrop.scene} seed={post.backdrop.seed} aspect={1.2} style={{ borderRadius: 0 }} scrim={false}>
            {overlay}
          </SceneImage>
        )}
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={like} style={styles.action} hitSlop={6} accessibilityLabel={post.liked_by_me ? 'Unlike' : 'Like'}>
          <Icon name={post.liked_by_me ? 'heart' : 'heart-outline'} size={24} color={post.liked_by_me ? colors.primary : colors.text} />
          <Text style={styles.count}>{post.likes_count.toLocaleString('en-IN')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} style={styles.action} hitSlop={6} accessibilityLabel="Comments">
          <Icon name="comment-outline" size={22} color={colors.text} />
          <Text style={styles.count}>{post.comments_count.toLocaleString('en-IN')}</Text>
        </Pressable>
        <Pressable style={styles.action} hitSlop={6} onPress={() => tap()} accessibilityLabel="Share">
          <Icon name="send-outline" size={21} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={save} hitSlop={6} accessibilityLabel={post.saved_by_me ? 'Unsave' : 'Save'}>
          <Icon name={post.saved_by_me ? 'bookmark' : 'bookmark-outline'} size={24} color={post.saved_by_me ? colors.gold : colors.text} />
        </Pressable>
      </View>
      {!!post.caption && (
        <Text style={styles.caption}>
          <Text style={{ fontFamily: fonts.bold }}>{author.username} </Text>
          {post.caption}
        </Text>
      )}
    </View>
  );
}

/** Suggested person: avatar, name, first interest · area, Follow. */
export function UserChip({ user }: { user: Follower }) {
  return (
    <View style={styles.userChip}>
      <Avatar user={toAvatarUser(user, user.is_me)} size={60} level={user.level} />
      <Text style={[styles.title, { fontSize: 13, marginTop: 10 }]} numberOfLines={1}>{user.display_name}</Text>
      <Text style={[styles.meta, { fontSize: 11 }]} numberOfLines={1}>{[user.interests[0], user.area ?? `@${user.username}`].filter(Boolean).join(' · ')}</Text>
      <FollowPill userId={user.id} server={{ following: user.following, requested: user.requested }} username={user.username} style={{ marginTop: 8, minWidth: 0, alignSelf: 'stretch', paddingVertical: 6 }} />
    </View>
  );
}

export function StoryCircle({ label, scene, onPress, isNew, seen }: { label: string; scene?: SceneKind; onPress: () => void; isNew?: boolean; seen?: boolean }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={{ alignItems: 'center', width: 70 }} accessibilityLabel={label}>
      {isNew ? (
        <View style={[styles.story, { borderStyle: 'dashed', borderColor: colors.dim, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }]}>
          <Icon name="plus" size={28} color={colors.text} />
        </View>
      ) : (
        <LinearGradient colors={seen ? [colors.lineHi, colors.lineHi] : [colors.primary, colors.purple, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.storyRing}>
          <View style={styles.storyInner}>{scene && <Scene kind={scene} seed={label.length} aspect={1} style={StyleSheet.absoluteFill} />}</View>
        </LinearGradient>
      )}
      <Text style={styles.storyLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function MiniBars({ values, color, height = 44, highlightLast = true, barWidth = 7 }: { values: number[]; color: string; height?: number; highlightLast?: boolean; barWidth?: number }) {
  const max = Math.max(...values, 1);
  const spread = barWidth > 7;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height, justifyContent: spread ? 'space-between' : 'flex-start' }}>
      {values.map((v, i) => (
        <GrowBar key={i} w={barWidth} h={4 + (v / max) * (height - 4)} color={color} opacity={highlightLast && i === values.length - 1 ? 1 : 0.35 + (i / values.length) * 0.45} delay={i * 45} />
      ))}
    </View>
  );
}

function GrowBar({ w, h, color, opacity, delay }: { w: number; h: number; color: string; opacity: number; delay: number }) {
  const v = useAnimatedValue(0);
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: h, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [h, delay, v]);
  return <Animated.View style={{ width: w, height: v, borderRadius: Math.min(4, w / 2), backgroundColor: color, opacity }} />;
}

export function StatCard({ stat }: { stat: Stat }) {
  return (
    <Card style={styles.statCard}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={stat.icon} size={18} color={stat.color} />
          <Text style={styles.statLabel}>{stat.label}</Text>
          {stat.delta && <Text style={[styles.delta, { color: stat.color }]}>{stat.delta}</Text>}
        </View>
        <Text style={styles.statValue}>
          {stat.value}
          {stat.unit ? <Text style={styles.statUnit}> {stat.unit}</Text> : null}
        </Text>
        {stat.progress != null && <ProgressBar progress={stat.progress} color={stat.color} height={5} style={{ marginTop: 8, width: '88%' }} />}
      </View>
      <MiniBars values={stat.series.values.slice(-7)} color={stat.color} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shop & rewards
// ---------------------------------------------------------------------------

export function ItemArt({ item, size }: { item: ShopItem; size: number }) {
  if (item.art.type === 'product') return <ProductArt kind={item.art.kind} color={item.art.color} accent={item.art.accent} size={size} />;
  if (item.art.type === 'pet') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: size * 0.82, height: size * 0.82, borderRadius: size, backgroundColor: item.art.glow, opacity: 0.25 }} />
        <Mascot pose={item.art.pose} accessory={item.art.accessory} size={size * 0.86} />
      </View>
    );
  }
  return <StickerArt kind={item.art.kind} size={size} />;
}

export function ShopItemCard({ item, owned, locked, equipped, onPress, style }: { item: ShopItem; owned: boolean; locked: boolean; equipped?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const rc = rarityColor[item.rarity];
  return (
    <PressScale onPress={onPress} style={[styles.shopItem, owned && { borderColor: 'rgba(215,255,31,0.45)' }, style]} scaleTo={0.96}>
      <LinearGradient colors={[`${rc}22`, 'transparent']} style={StyleSheet.absoluteFill} />
      <View style={[styles.rarity, { backgroundColor: rc }]} />
      <View style={{ opacity: locked ? 0.45 : 1 }}>
        <ItemArt item={item} size={74} />
      </View>
      {locked && (
        <View style={styles.lock}>
          <Icon name="lock" size={12} color={colors.onImage} />
          <Text style={styles.lockText}>LV {item.levelRequired}</Text>
        </View>
      )}
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
      {owned ? (
        <Text style={styles.owned}>{equipped ? 'Equipped' : 'Owned'}</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <CoinIcon size={15} />
          <Text style={styles.price}>{item.price.toLocaleString('en-IN')}</Text>
        </View>
      )}
    </PressScale>
  );
}

export function RewardCard({ kind, title, subtitle, locked, style }: { kind: RewardArtKind; title: string; subtitle?: string; locked?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.reward, locked && { opacity: 0.55 }, style]}>
      <RewardArt kind={kind} size={64} />
      <Text style={styles.rewardTitle} numberOfLines={1}>{title}</Text>
      {subtitle && <Text style={styles.rewardSub} numberOfLines={2}>{subtitle}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  lockedCard: { opacity: 0.6 },
  heroLock: { position: 'absolute', top: 10, left: 10 },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, overflow: 'hidden' },
  mTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  mSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  xp: { color: colors.gold, fontFamily: fonts.black, fontSize: 12, marginTop: 4 },
  xpSmall: { color: colors.gold, fontFamily: fonts.black, fontSize: 12 },
  logBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.lineHi, alignItems: 'center', justifyContent: 'center' },
  doneDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10 },
  crewIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(11,15,26,0.08)' },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  heroBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,10,10,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  heroBadgeText: { color: colors.gold, fontFamily: fonts.bold, fontSize: 11 },
  heroTitle: { color: colors.onImage, fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.4 },
  post: { backgroundColor: colors.card, borderRadius: radius.xl, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: colors.line },
  postHead: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  author: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  lvl: { color: colors.violet, fontFamily: fonts.bold, fontSize: 10, marginLeft: 2, backgroundColor: 'rgba(215,255,31,0.1)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, overflow: 'hidden' },
  followBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 5 },
  followText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 12 },
  actChip: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,10,10,0.78)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(215,255,31,0.35)' },
  actText: { color: colors.onImage, fontFamily: fonts.semibold, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { color: colors.text, fontFamily: fonts.semibold, fontSize: 13 },
  caption: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, padding: 12, paddingTop: 8 },
  userChip: { width: 132, alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  story: { width: 64, height: 64, borderRadius: 32 },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 2.5 },
  storyInner: { flex: 1, borderRadius: 31, overflow: 'hidden', borderWidth: 2.5, borderColor: colors.bg, backgroundColor: colors.bg2 },
  storyLabel: { color: colors.text, fontFamily: fonts.medium, fontSize: 11, marginTop: 6 },
  statCard: { flexDirection: 'row', alignItems: 'center' },
  statLabel: { color: colors.sub, fontFamily: fonts.medium, fontSize: 13 },
  delta: { fontFamily: fonts.bold, fontSize: 11, marginLeft: 2 },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 28, marginTop: 4, letterSpacing: 0.4 },
  statUnit: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12 },
  shopItem: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 6, gap: 3, overflow: 'hidden' },
  rarity: { position: 'absolute', top: 0, left: 16, right: 16, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  lock: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(10,10,10,0.8)', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  lockText: { color: colors.onImage, fontFamily: fonts.bold, fontSize: 9 },
  itemName: { color: colors.sub, fontFamily: fonts.medium, fontSize: 11, marginTop: 2, maxWidth: '100%' },
  price: { color: colors.text, fontFamily: fonts.bold, fontSize: 13 },
  owned: { color: colors.green, fontFamily: fonts.bold, fontSize: 12 },
  reward: { flex: 1, alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, paddingHorizontal: 6 },
  rewardTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 12, marginTop: 6, textAlign: 'center' },
  rewardSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 10, textAlign: 'center', marginTop: 2 },
});
