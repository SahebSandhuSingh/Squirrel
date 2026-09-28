import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { BadgeArt } from '@/art/Badge';
import { Mascot } from '@/art/Mascot';
import { Avatar, type AvatarUser } from '@/components/Avatar';
import { ItemArt, SceneImage, StoryCircle } from '@/components/cards';
import { SignInToSocial, SocialError, toAvatarUser, useFollowToggle } from '@/components/socialParts';
import { Button, Card, Display, EmptyState, FadeIn, Icon, IconButton, LevelBadge, Scrim, Tag, TAB_BAR_SPACE, XPBar, tap } from '@/components/ui';
import type { Activity, FollowStatus, Post, PublicProfile } from '@/api/social';
import { cityById } from '@/data/cities';
import { highlights } from '@/data/highlights';
import type { IconName } from '@/data/icons';
import { describeActivity, timeAgo } from '@/data/posts';
import { achievements, levelRewards } from '@/data/rewards';
import { shopItemById } from '@/data/shop';
import { useSavedPosts, useUserPosts } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { useAuth } from '@/auth/AuthProvider';
import type { BadgeKind, SceneKind } from '@/types';
import { colors, fonts, MAX_WIDTH as MAXW, radius } from '@/theme';

const GRID_TABS = [
  { id: 'posts', icon: 'view-grid' },
  { id: 'activity', icon: 'chart-timeline-variant' },
  { id: 'saved', icon: 'bookmark-outline' },
] as const;
type GridTab = (typeof GRID_TABS)[number]['id'];

const TAG_ICONS: Record<string, IconName> = {
  Runner: 'run',
  Yoga: 'yoga',
  'No Sugar Club': 'food-apple',
  Strength: 'arm-flex',
  HIIT: 'lightning-bolt',
  Cycling: 'bike',
  Coach: 'whistle',
};

const BADGE_KINDS: BadgeKind[] = ['city', 'streak', 'early-bird', 'steps-10k', 'crew', 'first-run', 'hydration', 'yoga', 'lifter', 'explorer', 'social', 'half-marathon'];
const ACTIVITY_SCENE: Record<Activity['type'], SceneKind> = { run: 'run', ride: 'cycling', workout: 'hiit', yoga: 'yoga', meal: 'brunch' };

/**
 * What the profile screen renders. Built from the server profile when signed in
 * (fromServerProfile) or from the local demo identity (fromLocalIdentity), which has no social
 * data at all — no counts, posts or followers are invented.
 */
export type ProfileVM = {
  id: string;
  name: string;
  username: string;
  avatar: AvatarUser;
  verified: boolean;
  bio: string | null;
  area: string | null;
  college: string | null;
  interests: string[];
  level: number;
  levelXp: number;
  xpPerLevel: number;
  streak: number | null;
  counts: { posts: number; followers: number; following: number } | null;
  badges: { id: string; kind: BadgeKind; title: string }[];
  recentPosts: Post[];
  recentActivities: Activity[];
  restricted: boolean;
  relationship: FollowStatus | null;
  isPrivate: boolean;
  live: boolean;
};

export function fromServerProfile(p: PublicProfile): ProfileVM {
  const u = p.user;
  return {
    id: u.id,
    name: u.display_name,
    username: u.username,
    avatar: toAvatarUser(u, p.is_me),
    verified: u.verified,
    bio: u.bio,
    area: u.area ?? (u.city_id ? cityById(u.city_id).name : null),
    college: u.college,
    interests: u.interests,
    level: p.stats.level,
    levelXp: p.stats.level_xp,
    xpPerLevel: p.stats.xp_per_level,
    streak: p.restricted ? null : p.stats.streak_days,
    counts: { posts: p.stats.posts, followers: p.stats.followers, following: p.stats.following },
    badges: p.badges.map((b) => ({ id: b.id, kind: BADGE_KINDS.includes(b.kind as BadgeKind) ? (b.kind as BadgeKind) : 'social', title: b.title })),
    recentPosts: p.recent_posts,
    recentActivities: p.recent_activities,
    restricted: p.restricted,
    relationship: p.relationship,
    isPrivate: u.visibility === 'private',
    live: true,
  };
}

const compact = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

/** Rich profile used for "me" (tab) and other users (/user/[id]). */
export function ProfileView({ vm, isMe, onRefresh, refreshing = false, onChanged }: { vm: ProfileVM; isMe: boolean; onRefresh?: () => void; refreshing?: boolean; onChanged?: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { equipped, toast } = useApp();
  const [tab, setTab] = useState<GridTab>('posts');
  const colW = Math.min(width, MAXW);
  const tile = (colW - 4) / 3;
  const lvl = vm.level;
  const nextReward = levelRewards.find((r) => r.level > lvl && r.kind === 'trail') ?? levelRewards.find((r) => r.level > lvl);
  // Demo identity: the local achievements screen's badges. Signed in: badges the server awarded.
  const badges = vm.live ? vm.badges : achievements.filter((a) => a.progress >= 1).map((a) => ({ id: a.id, kind: a.kind, title: a.name }));
  const equippedItems = [...equipped].map((id) => shopItemById(id)).filter((it): it is NonNullable<ReturnType<typeof shopItemById>> => Boolean(it));
  const tabs = GRID_TABS.filter((g) => g.id !== 'saved' || isMe);
  // Follow state lives in the shared store: the button and the follower count move together,
  // then the profile refetches for the server's numbers.
  const rel = vm.relationship ?? { following: false, followed_by: false, requested: false };
  const follow = useFollowToggle(vm.id, { following: rel.following, requested: rel.requested }, vm.username, onChanged);
  const followerDelta = isMe ? 0 : Number(follow.following) - Number(rel.following);
  const openList = (kind: 'followers' | 'following') =>
    vm.live && !vm.restricted ? router.push({ pathname: '/follows', params: { id: vm.id, kind, name: vm.name } }) : undefined;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: (isMe ? TAB_BAR_SPACE : 30) + insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}>
      {/* Cover */}
      <View style={{ height: 190 + insets.top }}>
        <Scene kind={isMe ? 'city-sunset' : 'city-night'} seed={vm.id.length * 3} aspect={colW / (190 + insets.top)} style={StyleSheet.absoluteFill} />
        <Scrim />
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          {isMe ? (
            vm.area ? (
              <View style={styles.cityPill}>
                <Icon name="map-marker" size={13} color={colors.primarySoft} />
                <Text style={styles.cityPillText}>{vm.area}</Text>
              </View>
            ) : (
              <View />
            )
          ) : (
            <IconButton icon="chevron-left" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/social'))} label="Back" />
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isMe && <IconButton icon="trophy-outline" onPress={() => router.push('/rewards')} label="Rewards" />}
            {isMe ? (
              <IconButton icon="cog-outline" onPress={() => router.push(vm.live ? '/profile-edit' : { pathname: '/avatar', params: { from: 'profile' } })} label="Settings" />
            ) : (
              <IconButton icon="dots-horizontal" onPress={() => tap()} label="More" />
            )}
          </View>
        </View>
      </View>

      <View style={styles.col}>
        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: -58 }}>
          <View>
            <Avatar user={vm.avatar} size={112} ring={colors.primary} link={false} />
            <View style={{ position: 'absolute', right: -4, bottom: 2 }}>
              <LevelBadge level={lvl} size="md" />
            </View>
          </View>
          <View style={styles.stats}>
            {(
              [
                ['Posts', vm.counts?.posts, undefined],
                ['Followers', vm.counts ? vm.counts.followers + followerDelta : undefined, () => openList('followers')],
                ['Following', vm.counts?.following, () => openList('following')],
              ] as const
            ).map(([label, value, onPress]) => (
              <Pressable key={label} onPress={onPress} disabled={!onPress || !vm.live} style={{ alignItems: 'center', flex: 1 }} accessibilityLabel={`${value ?? 'no'} ${label}`}>
                <Text style={styles.statV}>{value == null ? '—' : compact(value)}</Text>
                <Text style={styles.statL}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
          <Display size={30} numberOfLines={1}>{vm.name}</Display>
          {vm.verified && <Icon name="check-decagram" size={20} color={colors.secondary} />}
          {vm.isPrivate && <Icon name="lock-outline" size={18} color={colors.dim} accessibilityLabel="Private account" />}
        </View>
        <Text style={styles.handle}>@{vm.username}</Text>
        {!!vm.bio && <Text style={styles.bio}>{vm.bio}</Text>}
        {!!vm.college && (
          <Text style={styles.meta}>
            <Icon name="school-outline" size={13} color={colors.dim} /> {vm.college}
          </Text>
        )}
        {vm.interests.length > 0 && (
          <View style={styles.tags}>
            {vm.interests.map((t) => (
              <Tag key={t} label={t} icon={TAG_ICONS[t] ?? 'star-four-points'} />
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {isMe ? (
            <>
              <Button label="Edit Profile" variant="secondary" size="md" iconLeft="pencil-outline" onPress={() => router.push(vm.live ? '/profile-edit' : { pathname: '/avatar', params: { from: 'profile' } })} style={{ flex: 1 }} />
              <Button label="Find People" variant="secondary" size="md" iconLeft="account-search-outline" onPress={() => router.push(vm.live ? '/people' : '/sign-in')} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              {vm.relationship && (
                <Button
                  label={follow.label}
                  variant={follow.following || follow.requested ? 'secondary' : 'primary'}
                  size="md"
                  iconLeft={follow.following ? 'account-check' : follow.requested ? 'account-clock' : 'account-plus'}
                  onPress={follow.onPress}
                  style={{ flex: 1 }}
                  accessibilityLabel={follow.label}
                />
              )}
              <Button label="Message" variant="secondary" size="md" iconLeft="message-outline" onPress={() => toast(`Messages with ${vm.name.split(' ')[0]} are coming soon`, 'message-outline', colors.secondary)} style={{ flex: 1 }} />
            </>
          )}
        </View>
        {!isMe && vm.relationship?.followed_by && <Text style={styles.followsYou}>Follows you</Text>}

        {/* Level */}
        <FadeIn>
          <Card style={{ marginTop: 18 }} glow={colors.purple}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LevelBadge level={lvl} size="lg" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.levelTitle}>Level {lvl} · {lvl >= 20 ? 'City Legend' : lvl >= 13 ? 'Neon Runner' : 'Rising Squirrel'}</Text>
                <XPBar value={vm.levelXp} max={vm.xpPerLevel} style={{ marginTop: 6 }} />
                {vm.streak != null && vm.streak > 0 && (
                  <Text style={styles.streak}>
                    <Icon name="fire" size={13} color={colors.orange} /> {vm.streak}-day streak
                  </Text>
                )}
              </View>
              {isMe && <Mascot pose="cheer" size={64} />}
            </View>
            {isMe && nextReward && (
              <Pressable onPress={() => router.push('/rewards')} style={styles.next}>
                <Icon name="lock-clock" size={16} color={colors.violet} />
                <Text style={styles.nextText}>
                  Next unlock: <Text style={{ color: colors.text, fontFamily: fonts.bold }}>{nextReward.title}</Text> at Level {nextReward.level}
                </Text>
                <Icon name="chevron-right" size={18} color={colors.dim} />
              </Pressable>
            )}
          </Card>
        </FadeIn>

        {/* Highlights (your own; the story viewer is part of the locked Stories feature) */}
        {isMe && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 18 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
            {highlights.map((h) => (
              <StoryCircle key={h.id} label={h.label} scene={h.scene} onPress={() => router.push({ pathname: '/highlight/[id]', params: { id: h.id } })} />
            ))}
            <StoryCircle label="New" isNew onPress={() => router.push('/compose')} />
          </ScrollView>
        )}

        {/* Account (backend connection) */}
        {isMe && <AccountRow />}

        {/* Badges */}
        {!vm.restricted && (
          <Pressable onPress={() => router.push('/rewards')} style={styles.badgeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>Badges · {badges.length}</Text>
              {badges.length ? (
                <View style={{ flexDirection: 'row', marginTop: 8, gap: 4 }}>
                  {badges.slice(0, 5).map((b) => (
                    <BadgeArt key={b.id} kind={b.kind} size={46} />
                  ))}
                </View>
              ) : (
                <Text style={[styles.nextText, { marginTop: 4 }]}>{isMe ? 'Share your first run to earn one.' : 'No badges yet.'}</Text>
              )}
            </View>
            <Icon name="chevron-right" size={22} color={colors.dim} />
          </Pressable>
        )}

        {/* Equipped cosmetics */}
        {isMe && (
          <Pressable onPress={() => router.push('/shop')} style={[styles.badgeRow, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>Equipped</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6 }}>
                {equippedItems.map((it) => (
                  <View key={it.id} style={styles.equip}>
                    <ItemArt item={it} size={40} />
                  </View>
                ))}
                <View style={[styles.equip, { borderStyle: 'dashed' }]}>
                  <Icon name="plus" size={20} color={colors.dim} />
                </View>
              </ScrollView>
            </View>
            <Icon name="chevron-right" size={22} color={colors.dim} />
          </Pressable>
        )}

        {/* Grid tabs */}
        {vm.live && !vm.restricted && (
          <View style={styles.gridTabs}>
            {tabs.map((g) => (
              <Pressable key={g.id} onPress={() => { tap(); setTab(g.id); }} style={[styles.gridTab, tab === g.id && { borderBottomColor: colors.primary }]} accessibilityLabel={g.id}>
                <Icon name={g.icon} size={22} color={tab === g.id ? colors.text : colors.dim} />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={{ width: colW, alignSelf: 'center' }}>
        {!vm.live ? (
          <SignInToSocial title="Your posts live here" body="Sign in to post, follow friends and keep your runs, followers and badges in sync." />
        ) : vm.restricted ? (
          <EmptyState art={<Mascot pose="sit" size={120} />} title="This account is private" body={vm.relationship?.requested ? 'Request sent. You’ll see their posts once they accept.' : 'Follow to see their posts and activity.'} />
        ) : tab === 'posts' ? (
          <PostsGrid vm={vm} tile={tile} isMe={isMe} />
        ) : tab === 'activity' ? (
          <ActivityList activities={vm.recentActivities} isMe={isMe} />
        ) : (
          <SavedGrid tile={tile} />
        )}
      </View>
    </ScrollView>
  );
}

function PostTile({ post, tile }: { post: Post; tile: number }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} style={{ width: tile, height: tile * 1.2, margin: 0.66 }} accessibilityLabel={post.caption || 'Post'}>
      {post.media_url ? (
        <Image source={{ uri: post.media_url }} style={{ width: '100%', height: '100%', borderRadius: 2 }} accessibilityIgnoresInvertColors />
      ) : (
        <SceneImage kind={post.backdrop.scene} seed={post.backdrop.seed} height={tile * 1.2} style={{ borderRadius: 2 }} scrim={false} />
      )}
      {post.activity && <Icon name={describeActivity(post.activity).icon} size={16} color="#fff" style={{ position: 'absolute', right: 6, top: 6 }} />}
    </Pressable>
  );
}

/** First 9 posts come with the profile (one request); older ones page in from /users/:id/posts. */
function PostsGrid({ vm, tile, isMe }: { vm: ProfileVM; tile: number; isMe: boolean }) {
  const [more, setMore] = useState(false);
  const paged = useUserPosts(vm.id, more);
  const posts = more && paged.items.length ? paged.items : vm.recentPosts;
  const total = vm.counts?.posts ?? 0;
  if (!posts.length) {
    return (
      <EmptyState
        art={<Mascot pose="sit" size={120} />}
        title="No posts yet"
        body={isMe ? 'Share a run or a workout and it lands here.' : `${vm.name.split(' ')[0]} hasn't posted yet.`}
        action={isMe ? 'Create a post' : undefined}
        onAction={isMe ? () => router.push('/compose') : undefined}
      />
    );
  }
  return (
    <>
      <View style={styles.grid}>
        {posts.map((p) => (
          <PostTile key={p.id} post={p} tile={tile} />
        ))}
      </View>
      {more && paged.error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <SocialError compact error={paged.error} onRetry={paged.retry} />
        </View>
      ) : more && (paged.loading || paged.loadingMore) ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : (!more && total > posts.length) || (more && paged.hasMore) ? (
        <Button label="Load more" variant="secondary" size="sm" onPress={() => (more ? paged.loadMore() : setMore(true))} style={{ margin: 16 }} />
      ) : null}
    </>
  );
}

function ActivityList({ activities, isMe }: { activities: Activity[]; isMe: boolean }) {
  if (!activities.length) {
    return <EmptyState art={<Mascot pose="run" size={120} />} title="No activity yet" body={isMe ? 'Finish a run or a workout and it shows up here.' : 'Nothing logged yet.'} />;
  }
  return (
    <View style={{ paddingHorizontal: 16, gap: 10, paddingTop: 12 }}>
      {activities.map((a) => {
        const d = describeActivity(a);
        return (
          <View key={a.id} style={styles.activity}>
            <SceneImage kind={ACTIVITY_SCENE[a.type]} seed={a.id.length} height={58} style={{ width: 58, borderRadius: radius.sm }} scrim={false} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.actTitle} numberOfLines={1}>{a.name ?? a.type[0].toUpperCase() + a.type.slice(1)}</Text>
              <Text style={styles.actMeta}>{timeAgo(a.started_at)}{a.verified ? ' · verified' : a.source === 'manual' ? ' · self-reported' : ''}</Text>
              <Text style={styles.actStats}>{d.text}</Text>
            </View>
            <Icon name={d.icon} size={22} color={colors.primary} />
          </View>
        );
      })}
    </View>
  );
}

function SavedGrid({ tile }: { tile: number }) {
  const saved = useSavedPosts();
  if (saved.loading) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />;
  if (saved.error && !saved.items.length) return <SocialError error={saved.error} onRetry={saved.retry} />;
  if (!saved.items.length) return <EmptyState art={<Mascot pose="sit" size={120} />} title="Nothing saved yet" body="Tap the bookmark on any post to keep it here." />;
  return (
    <>
      <View style={styles.grid}>
        {saved.items.map((p) => (
          <PostTile key={p.id} post={p} tile={tile} />
        ))}
      </View>
      {saved.hasMore && <Button label={saved.loadingMore ? 'Loading…' : 'Load more'} variant="secondary" size="sm" onPress={saved.loadMore} style={{ margin: 16 }} />}
    </>
  );
}

function AccountRow() {
  const { mode, email, signOut } = useAuth();
  const live = mode === 'live';
  return (
    <Pressable
      onPress={async () => {
        if (live) await signOut();
        router.push('/sign-in');
      }}
      style={[styles.badgeRow, { marginTop: 16, borderColor: live ? 'rgba(215,255,31,0.4)' : colors.line }]}
      accessibilityLabel={live ? 'Sign out' : 'Sign in to sync'}>
      <Icon name={live ? 'cloud-check-outline' : 'cloud-off-outline'} size={22} color={live ? colors.primary : colors.dim} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.sectionLabel}>{live ? 'Synced with server' : 'Demo mode'}</Text>
        <Text style={styles.nextText}>{live ? email ?? 'Signed in with token' : 'Sign in to save runs, XP, posts and followers'}</Text>
      </View>
      <Text style={{ color: colors.primary, fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>{live ? 'Sign out' : 'Sign in'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAXW, alignSelf: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cityPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,10,10,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  cityPillText: { color: colors.onImage, fontFamily: fonts.semibold, fontSize: 12 },
  stats: { flex: 1, flexDirection: 'row', paddingBottom: 10, marginLeft: 6 },
  statV: { color: colors.text, fontFamily: fonts.display, fontSize: 22 },
  statL: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12 },
  handle: { color: colors.dim, fontFamily: fonts.medium, marginTop: 2 },
  bio: { color: colors.sub, fontFamily: fonts.regular, marginTop: 8, lineHeight: 20, fontSize: 14 },
  meta: { color: colors.dim, fontFamily: fonts.regular, marginTop: 6, fontSize: 13 },
  followsYou: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, marginTop: 8, textTransform: 'uppercase' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  levelTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  streak: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 12, marginTop: 6 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  nextText: { flex: 1, color: colors.sub, fontFamily: fonts.regular, fontSize: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  sectionLabel: { color: colors.sub, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  equip: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  gridTabs: { flexDirection: 'row', marginTop: 18, borderBottomWidth: 1, borderBottomColor: colors.line },
  gridTab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 2 },
  activity: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10 },
  actTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  actMeta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  actStats: { color: colors.sub, fontFamily: fonts.semibold, fontSize: 12, marginTop: 2 },
});
