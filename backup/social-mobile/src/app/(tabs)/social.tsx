import { FEED_KIND, FEEDS, type Feed, type Post } from '@/data/posts';
import { FeatureGate, useLocks } from '@/components/Locked';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { SceneImage, SocialPost, UserChip } from '@/components/cards';
import { EmptyFeed, FeedSkeleton, SignInToSocial, SocialError, toAvatarUser } from '@/components/socialParts';
import { Display, FadeIn, Icon, IconButton, OverlayKicker, OverlaySub, PressScale, RowSub, RowTitle, Screen, SectionHeader, Segmented, TAB_BAR_SPACE, tap } from '@/components/ui';
import { profileApi, type Follower } from '@/api/social';
import { useRemote } from '@/api/useRemote';
import { useFeed, useMyProfile, useSocialEnabled } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const EMPTY_BODY: Record<Feed, (city: string) => string> = {
  'For You': () => 'Your feed is waiting for chaos. Post a run, a workout or a vibe.',
  Following: () => 'Follow people to fill this feed. Your own posts show here too.',
  Nearby: (city) => `Nothing from ${city} yet. Be the first to post a run.`,
};

/** SOCIAL — feed, stories, people and crews. Every post, like and follow comes from the Social service. */
export default function Social() {
  const enabled = useSocialEnabled();
  const [feed, setFeed] = useState<Feed>('For You');
  const { city, crews, joinedCrews } = useApp();
  const locks = useLocks();
  const huntLocked = locks.locked('partnerHunt');
  const insets = useSafeAreaInsets();

  const posts = useFeed(FEED_KIND[feed], city.id);
  const me = useMyProfile();
  const suggested = useRemote<{ items: Follower[] }>(enabled ? 'social:suggestions' : null, () => profileApi.suggestions(10));
  const people = suggested.data?.items ?? [];
  const toFollow = people.filter((u) => !u.following && !u.requested).slice(0, 5);
  const myCrews = crews.filter((c) => joinedCrews.has(c.id));

  // Crew teaser sits after the 3rd post, as before.
  const renderPost = useCallback(
    ({ item, index }: { item: Post; index: number }) => (
      <>
        <FadeIn index={Math.min(index, 6)}>
          <SocialPost post={item} />
        </FadeIn>
        {index === 2 && (
          <PressScale onPress={() => router.push('/crews')} style={{ marginBottom: 16 }} scaleTo={0.98}>
            <SceneImage kind="crew" seed={21} height={140} scrim="strong">
              <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <OverlayKicker>{myCrews.length ? `${myCrews.length} crew${myCrews.length > 1 ? 's' : ''} joined` : 'Better together'}</OverlayKicker>
                  <Display size={26} color={colors.onImage}>Find your crew</Display>
                  <OverlaySub>{crews.length} crews in {city.name} & online</OverlaySub>
                </View>
                <View style={styles.arrow}>
                  <Icon name="arrow-right" size={22} color={colors.onPrimary} />
                </View>
              </View>
            </SceneImage>
          </PressScale>
        )}
      </>
    ),
    [myCrews.length, crews.length, city.name],
  );

  const myAvatar = me.data ? toAvatarUser(me.data.user, true) : undefined;

  const header = (
    <>
      <View style={styles.head}>
        <Display size={34}>Social</Display>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="account-search-outline" onPress={() => router.push('/crews')} label="Find crews" />
          <IconButton icon="bell-outline" onPress={() => router.push('/notifications')} label="Notifications" />
        </View>
      </View>

      {/* Stories: you + people to discover (story viewer is locked until launch) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 10 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        <Pressable onPress={() => { tap(); router.push('/compose'); }} style={{ alignItems: 'center', width: 66 }} accessibilityLabel="New post">
          <View>
            {myAvatar ? <Avatar user={myAvatar} size={62} ring={colors.lineHi} link={false} /> : <View style={styles.storyBlank} />}
            <View style={styles.addStory}>
              <Icon name="plus" size={14} color={colors.onPrimary} />
            </View>
          </View>
          <Text style={styles.storyName}>Your story</Text>
        </Pressable>
        {people.slice(0, 8).map((u, i) => (
          <Pressable
            key={u.id}
            onPress={() => {
              tap();
              if (locks.locked('stories')) locks.notify('stories');
              router.push({ pathname: '/user/[id]', params: { id: u.id } });
            }}
            style={{ alignItems: 'center', width: 66 }}
            accessibilityLabel={`${u.display_name}'s story, coming soon. Opens profile`}>
            <Avatar user={toAvatarUser(u)} size={62} ring={i < 5 ? colors.primary : colors.lineHi} link={false} />
            <Text style={styles.storyName} numberOfLines={1}>{u.display_name.split(' ')[0]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Segmented items={FEEDS} value={feed} onChange={setFeed} style={{ marginTop: 16 }} />

      {/* Partner Hunt: locked until launch; opens the Coming soon screen */}
      <PressScale onPress={() => router.push('/partner-hunt')} style={styles.hunt} scaleTo={0.98} accessibilityLabel={huntLocked ? 'Partner Hunt, find your workout buddy, coming soon' : 'Partner Hunt'}>
        <View style={styles.huntIcon}>
          <Icon name="account-heart-outline" size={24} color={colors.primary} />
          {huntLocked && (
            <View style={styles.huntLock}>
              <Icon name="lock" size={10} color={colors.onPrimary} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <RowTitle>Partner Hunt</RowTitle>
          <RowSub>Find your workout buddy</RowSub>
        </View>
        <FeatureGate feature="partnerHunt">
          <Icon name="chevron-right" size={22} color={colors.dim} />
        </FeatureGate>
      </PressScale>

      {feed === 'Nearby' && (
        <Text style={styles.nearbyNote}>
          <Icon name="map-marker" size={13} color={colors.secondary} /> Posts from {city.name} · switch city from Home or Explore
        </Text>
      )}

      {feed === 'For You' && toFollow.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <SectionHeader title="Suggested for you" action="See all" onAction={() => router.push('/crews')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {toFollow.map((u) => (
              <UserChip key={u.id} user={u} />
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );

  if (!enabled) {
    return (
      <Screen>
        <Display size={34}>Social</Display>
        <SignInToSocial body="Sign in to see real posts from runners near you, follow friends and share your runs." />
      </Screen>
    );
  }

  const empty = posts.loading ? (
    <FeedSkeleton />
  ) : posts.error ? (
    <SocialError error={posts.error} onRetry={posts.retry} />
  ) : (
    <EmptyFeed body={EMPTY_BODY[feed](city.name)} onCreate={() => router.push('/compose')} />
  );

  // The feed is virtualised and paged from the server; the header scrolls with it.
  return (
    <Screen scroll={false}>
      <FlatList
        data={posts.items}
        keyExtractor={(p) => p.id}
        renderItem={renderPost}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          posts.items.length > 0 ? (
            posts.error ? (
              <SocialError compact error={posts.error} onRetry={posts.retry} />
            ) : posts.loadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} />
            ) : !posts.hasMore ? (
              <Text style={styles.end}>You’re all caught up</Text>
            ) : null
          ) : null
        }
        onEndReached={posts.loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={posts.refreshing} onRefresh={() => { posts.refresh(); suggested.reload(); }} tintColor={colors.primary} colors={[colors.primary]} />}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        windowSize={7}
        style={{ marginHorizontal: -16, paddingHorizontal: 16 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hunt: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineHi, padding: 12 },
  huntIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(215,255,31,0.1)', borderWidth: 1, borderColor: 'rgba(215,255,31,0.35)' },
  huntLock: { position: 'absolute', right: -5, top: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addStory: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  storyBlank: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.cardHi, borderWidth: 2, borderColor: colors.lineHi },
  storyName: { color: colors.sub, fontFamily: fonts.medium, fontSize: 11, marginTop: 6 },
  nearbyNote: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginBottom: 12 },
  arrow: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  end: { color: colors.mute, fontFamily: fonts.mono, fontSize: 11, textAlign: 'center', marginVertical: 18, textTransform: 'uppercase' },
});
