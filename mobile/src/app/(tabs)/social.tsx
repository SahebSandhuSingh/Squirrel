import { selectFeed, type Feed, type Post } from '@/data/posts';
import { FeatureGate, useLocks } from '@/components/Locked';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CAMPUS_SOURCE } from '@/api/campus';
import { Mascot } from '@/art/Mascot';
import { Avatar } from '@/components/Avatar';
import { SceneImage, SocialPost, UserChip } from '@/components/cards';
import { Display, EmptyState, FadeIn, Icon, IconButton, OverlayKicker, OverlaySub, PressScale, RowSub, RowTitle, Screen, SectionHeader, Segmented, TAB_BAR_SPACE, tap } from '@/components/ui';
import { users } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const FEEDS: readonly Feed[] = ['For You', 'Following', 'Nearby'];

/** SOCIAL — feed, stories, people and crews. */
export default function Social() {
  const [feed, setFeed] = useState<Feed>('For You');
  const { posts, following, toggleFollow, me, city, crews, joinedCrews } = useApp();
  const locks = useLocks();
  const huntLocked = locks.locked('partnerHunt');

  const list = useMemo(() => selectFeed(posts, feed, { following, meId: me.id, cityId: city.id }), [posts, feed, following, me.id, city.id]);

  const storyUsers = users.filter((u) => u.id !== me.id).slice(0, 8);
  const suggested = users.filter((u) => u.id !== me.id && !following.has(u.id)).slice(0, 5);
  const myCrews = crews.filter((c) => joinedCrews.has(c.id));

  const insets = useSafeAreaInsets();

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

  const header = (
    <>
      <View style={styles.head}>
        <Display size={34}>Social</Display>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="account-search-outline" onPress={() => router.push('/crews')} label="Find crews" />
          <IconButton icon="bell-outline" badge={3} onPress={() => router.push('/notifications')} label="Notifications" />
        </View>
      </View>

      {/* Stories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 10 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        <Pressable onPress={() => { tap(); router.push('/compose'); }} style={{ alignItems: 'center', width: 66 }} accessibilityLabel="Add story">
          <View>
            <Avatar user={me} size={62} ring={colors.lineHi} link={false} />
            <View style={styles.addStory}>
              <Icon name="plus" size={14} color={colors.onPrimary} />
            </View>
          </View>
          <Text style={styles.storyName}>Your story</Text>
        </Pressable>
        {storyUsers.map((u, i) => (
          <Pressable
            key={u.id}
            onPress={() => {
              tap();
              // No story viewer yet: say so, then open the profile (what the avatar always did).
              if (locks.locked('stories')) locks.notify('stories');
              router.push({ pathname: '/user/[id]', params: { id: u.id } });
            }}
            style={{ alignItems: 'center', width: 66 }}
            accessibilityLabel={`${u.name}'s story, coming soon. Opens profile`}>
            <Avatar user={u} size={62} ring={i < 5 ? colors.primary : colors.lineHi} link={false} />
            <Text style={styles.storyName} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
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

      {/* Friend Mode + Active Now: activity-based discovery from the campus backend */}
      {CAMPUS_SOURCE !== 'off' && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <PressScale onPress={() => router.push('/friends')} style={[styles.hunt, { flex: 1, marginBottom: 0 }]} scaleTo={0.98} accessibilityLabel="Friend Mode">
            <Icon name="account-heart" size={22} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <RowTitle>Friend Mode</RowTitle>
              <RowSub>Same routes, new people</RowSub>
            </View>
          </PressScale>
          <PressScale onPress={() => router.push('/active')} style={[styles.hunt, { flex: 1, marginBottom: 0 }]} scaleTo={0.98} accessibilityLabel="Active now">
            <Icon name="radar" size={22} color={colors.green} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <RowTitle>Active now</RowTitle>
              <RowSub>Near you</RowSub>
            </View>
          </PressScale>
        </View>
      )}

      {feed === 'Nearby' && (
        <Text style={styles.nearbyNote}>
          <Icon name="map-marker" size={13} color={colors.secondary} /> Posts from {city.name} · switch city from Home or Explore
        </Text>
      )}

      {/* Suggested users section (only for For You feed) */}
      {feed === 'For You' && suggested.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <SectionHeader title="Suggested for you" action="See all" onAction={() => router.push('/crews')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {suggested.map((u) => (
              <UserChip key={u.id} user={u} following={following.has(u.id)} onFollow={() => toggleFollow(u.id)} />
            ))}
          </ScrollView>
        </View>
      )}

    </>
  );

  // The feed is virtualised: it grows with real posts, the header scrolls with it.
  return (
    <Screen scroll={false}>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        renderItem={renderPost}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            art={<Mascot pose="sleep" size={140} />}
            title="Quiet around here"
            body={feed === 'Nearby' ? `No posts in ${city.name} yet. Be the first to post a run!` : feed === 'Following' ? 'Follow people to fill your feed.' : 'No posts yet. Be the first to share!'}
            action="Create a post"
            onAction={() => router.push('/compose')}
          />
        }
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
  storyName: { color: colors.sub, fontFamily: fonts.medium, fontSize: 11, marginTop: 6 },
  nearbyNote: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginBottom: 12 },
  arrow: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
