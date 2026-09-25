import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { BadgeArt } from '@/art/Badge';
import { Mascot } from '@/art/Mascot';
import { Avatar } from '@/components/Avatar';
import { ItemArt, SceneImage, StoryCircle } from '@/components/cards';
import { Button, Card, Display, EmptyState, FadeIn, Icon, IconButton, LevelBadge, Scrim, Tag, TAB_BAR_SPACE, XPBar, tap } from '@/components/ui';
import { highlights } from '@/data/highlights';
import { achievements, levelRewards } from '@/data/rewards';
import { recentActivities } from '@/data/stats';
import { shopItemById } from '@/data/shop';
import type { User } from '@/data/users';
import { useApp, XP_PER_LEVEL } from '@/state/AppState';
import { useAuth } from '@/auth/AuthProvider';
import type { SceneKind } from '@/types';
import { colors, fonts, MAX_WIDTH as MAXW, radius } from '@/theme';

const GRID_TABS = [
  { id: 'posts', icon: 'view-grid' },
  { id: 'activity', icon: 'chart-timeline-variant' },
  { id: 'saved', icon: 'bookmark-outline' },
] as const;
type GridTab = (typeof GRID_TABS)[number]['id'];

const TAG_ICONS: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  Runner: 'run',
  Yoga: 'yoga',
  'No Sugar Club': 'food-apple',
  Gym: 'dumbbell',
  HIIT: 'lightning-bolt',
  Cycling: 'bike',
  Coach: 'whistle',
};

const EXTRA_SCENES: SceneKind[] = ['city-sunset', 'run', 'rooftop', 'lake', 'yoga', 'gym', 'cafe', 'city-night', 'stadium'];

/** Rich profile used for "me" (tab) and other users (/user/[id]). */
export function ProfileView({ user, isMe }: { user: User; isMe: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { level, levelXp, posts, following, toggleFollow, saved, equipped, toast } = useApp();
  const [tab, setTab] = useState<GridTab>('posts');
  const isFollowing = following.has(user.id);
  const lvl = isMe ? level : user.level;
  const colW = Math.min(width, MAXW);
  const tile = (colW - 4) / 3;

  const userPosts = useMemo(() => posts.filter((p) => p.authorId === user.id), [posts, user.id]);
  const gridScenes: { scene: SceneKind; seed: number; id: string }[] = useMemo(
    () => [...userPosts.map((p) => ({ scene: p.scene, seed: p.seed, id: p.id })), ...EXTRA_SCENES.map((s, i) => ({ scene: s, seed: i * 11 + user.id.length, id: `x${i}` }))].slice(0, 9),
    [userPosts, user.id],
  );
  const savedPosts = posts.filter((p) => saved.has(p.id));
  const nextReward = levelRewards.find((r) => r.level > lvl && r.kind === 'trail') ?? levelRewards.find((r) => r.level > lvl);
  const badges = achievements.filter((a) => a.progress >= 1);
  const equippedItems = [...equipped].map((id) => shopItemById(id)).filter((it): it is NonNullable<ReturnType<typeof shopItemById>> => Boolean(it));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: (isMe ? TAB_BAR_SPACE : 30) + insets.bottom }} showsVerticalScrollIndicator={false}>
      {/* Cover */}
      <View style={{ height: 190 + insets.top }}>
        <Scene kind={isMe ? 'city-sunset' : 'city-night'} seed={user.id.length * 3} aspect={colW / (190 + insets.top)} style={StyleSheet.absoluteFill} />
        <Scrim />
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          {isMe ? (
            <View style={styles.cityPill}>
              <Icon name="map-marker" size={13} color={colors.secondary} />
              <Text style={styles.cityPillText}>{user.area}</Text>
            </View>
          ) : (
            <IconButton icon="chevron-left" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/social'))} label="Back" />
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isMe && <IconButton icon="trophy-outline" onPress={() => router.push('/rewards')} label="Rewards" />}
            <IconButton icon={isMe ? 'cog-outline' : 'dots-horizontal'} onPress={() => (isMe ? router.push({ pathname: '/avatar', params: { from: 'profile' } }) : tap())} label={isMe ? 'Settings' : 'More'} />
          </View>
        </View>
      </View>

      <View style={styles.col}>
        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: -58 }}>
          <View>
            <Avatar user={user} size={112} ring={colors.primary} link={false} />
            <View style={{ position: 'absolute', right: -4, bottom: 2 }}>
              <LevelBadge level={lvl} size="md" />
            </View>
          </View>
          <View style={styles.stats}>
            {[
              [String(isMe ? Math.max(user.posts, userPosts.length) : user.posts), 'Posts'],
              [user.followers >= 1000 ? `${(user.followers / 1000).toFixed(1)}K` : String(user.followers + (isFollowing && !isMe ? 1 : 0)), 'Followers'],
              [String(isMe ? following.size + 24 : user.following), 'Following'],
            ].map(([v, l]) => (
              <View key={l} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.statV}>{v}</Text>
                <Text style={styles.statL}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
          <Display size={30}>{user.name}</Display>
          {user.verified && <Icon name="check-decagram" size={20} color={colors.secondary} />}
        </View>
        <Text style={styles.handle}>@{user.handle}</Text>
        <Text style={styles.bio}>{user.bio}</Text>
        <View style={styles.tags}>
          {user.tags.map((t) => (
            <Tag key={t} label={t} icon={TAG_ICONS[t] ?? 'star-four-points'} />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {isMe ? (
            <>
              <Button label="Edit Profile" variant="secondary" size="md" iconLeft="pencil-outline" onPress={() => router.push({ pathname: '/avatar', params: { from: 'profile' } })} style={{ flex: 1 }} />
              <Button label="Add Friend" variant="secondary" size="md" iconLeft="account-plus-outline" onPress={() => toast('Invite link copied · +50 XP when they join', 'link-variant', colors.secondary)} style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <Button label={isFollowing ? 'Following' : 'Follow'} variant={isFollowing ? 'secondary' : 'primary'} size="md" iconLeft={isFollowing ? 'account-check' : 'account-plus'} onPress={() => toggleFollow(user.id)} style={{ flex: 1 }} />
              <Button label="Message" variant="secondary" size="md" iconLeft="message-outline" onPress={() => toast(`Messages with ${user.name.split(' ')[0]} are coming soon`, 'message-outline', colors.secondary)} style={{ flex: 1 }} />
            </>
          )}
        </View>

        {/* Level */}
        <FadeIn>
          <Card style={{ marginTop: 18 }} glow={colors.purple}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LevelBadge level={lvl} size="lg" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.levelTitle}>Level {lvl} · {lvl >= 20 ? 'City Legend' : lvl >= 13 ? 'Neon Runner' : 'Rising Squirrel'}</Text>
                <XPBar value={isMe ? levelXp : 1200} max={XP_PER_LEVEL} style={{ marginTop: 6 }} />
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

        {/* Highlights */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 18 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
          {highlights.map((h) => (
            <StoryCircle key={h.id} label={h.label} scene={h.scene} onPress={() => router.push({ pathname: '/highlight/[id]', params: { id: h.id } })} />
          ))}
          {isMe && <StoryCircle label="New" isNew onPress={() => router.push('/compose')} />}
        </ScrollView>

        {/* Account (backend connection) */}
        {isMe && <AccountRow />}

        {/* Badges */}
        <Pressable onPress={() => router.push('/rewards')} style={styles.badgeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Badges · {badges.length}/{achievements.length}</Text>
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 4 }}>
              {badges.slice(0, 5).map((b) => (
                <BadgeArt key={b.id} kind={b.kind} size={46} />
              ))}
            </View>
          </View>
          <Icon name="chevron-right" size={22} color={colors.dim} />
        </Pressable>

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
        <View style={styles.gridTabs}>
          {GRID_TABS.map((g) => (
            <Pressable key={g.id} onPress={() => { tap(); setTab(g.id); }} style={[styles.gridTab, tab === g.id && { borderBottomColor: colors.primary }]} accessibilityLabel={g.id}>
              <Icon name={g.icon} size={22} color={tab === g.id ? colors.text : colors.dim} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ width: colW, alignSelf: 'center' }}>
        {tab === 'posts' && (
          <View style={styles.grid}>
            {gridScenes.map((g, i) => (
              <Pressable key={g.id} onPress={() => (g.id.startsWith('x') ? tap() : router.push({ pathname: '/post/[id]', params: { id: g.id } }))} style={{ width: tile, height: tile * 1.2, margin: 0.66 }}>
                <SceneImage kind={g.scene} seed={g.seed} height={tile * 1.2} style={{ borderRadius: 2 }} scrim={false} />
                {i % 4 === 1 && <Icon name="play" size={16} color="#fff" style={{ position: 'absolute', right: 6, top: 6 }} />}
              </Pressable>
            ))}
          </View>
        )}
        {tab === 'activity' && (
          <View style={{ paddingHorizontal: 16, gap: 10, paddingTop: 12 }}>
            {recentActivities.map((a) => (
              <View key={a.id} style={styles.activity}>
                <SceneImage kind={a.scene} seed={a.id.length} height={58} style={{ width: 58, borderRadius: radius.sm }} scrim={false} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.actTitle} numberOfLines={1}>{a.title}</Text>
                  <Text style={styles.actMeta}>{a.when}</Text>
                  <Text style={styles.actStats}>
                    {a.km ? `${a.km} km · ` : ''}
                    {a.minutes} min · {a.kcal} kcal
                  </Text>
                </View>
                <Icon name={a.icon} size={22} color={colors.primary} />
              </View>
            ))}
          </View>
        )}
        {tab === 'saved' &&
          (savedPosts.length ? (
            <View style={styles.grid}>
              {savedPosts.map((p) => (
                <Pressable key={p.id} onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} style={{ width: tile, height: tile * 1.2, margin: 0.66 }}>
                  <SceneImage kind={p.scene} seed={p.seed} height={tile * 1.2} style={{ borderRadius: 2 }} scrim={false} />
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState art={<Mascot pose="sit" size={120} />} title="Nothing saved yet" body="Tap the bookmark on any post to keep it here." />
          ))}
      </View>
    </ScrollView>
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
      style={[styles.badgeRow, { marginTop: 16, borderColor: live ? 'rgba(255,107,0,0.4)' : colors.line }]}
      accessibilityLabel={live ? 'Sign out' : 'Sign in to sync'}>
      <Icon name={live ? 'cloud-check-outline' : 'cloud-off-outline'} size={22} color={live ? colors.primary : colors.dim} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.sectionLabel}>{live ? 'Synced with server' : 'Demo mode'}</Text>
        <Text style={styles.nextText}>{live ? email ?? 'Signed in with token' : 'Sign in to save runs, XP and territory'}</Text>
      </View>
      <Text style={{ color: colors.primary, fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>{live ? 'Sign out' : 'Sign in'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAXW, alignSelf: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cityPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,10,10,0.6)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  cityPillText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 12 },
  stats: { flex: 1, flexDirection: 'row', paddingBottom: 10, marginLeft: 6 },
  statV: { color: colors.text, fontFamily: fonts.display, fontSize: 22 },
  statL: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12 },
  handle: { color: colors.dim, fontFamily: fonts.medium, marginTop: 2 },
  bio: { color: colors.sub, fontFamily: fonts.regular, marginTop: 8, lineHeight: 20, fontSize: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  levelTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
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
