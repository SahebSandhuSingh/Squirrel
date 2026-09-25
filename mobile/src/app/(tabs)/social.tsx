import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { Avatar } from '@/components/Avatar';
import { SceneImage, SocialPost, UserChip } from '@/components/cards';
import { Display, EmptyState, FadeIn, Icon, IconButton, PressScale, Screen, Segmented, SectionHeader, tap } from '@/components/ui';
import { users } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const FEEDS = ['For You', 'Following', 'Nearby'] as const;
type Feed = (typeof FEEDS)[number];

/** SOCIAL — feed, stories, people and crews. */
export default function Social() {
  const [feed, setFeed] = useState<Feed>('For You');
  const { posts, following, toggleFollow, me, city, crews, joinedCrews } = useApp();

  const list = useMemo(() => {
    const sorted = [...posts].sort((a, b) => a.minutesAgo - b.minutesAgo);
    if (feed === 'Following') return sorted.filter((p) => following.has(p.authorId) || p.authorId === me.id);
    if (feed === 'Nearby') return sorted.filter((p) => p.cityId === city.id);
    return sorted;
  }, [posts, feed, following, me.id, city.id]);

  const storyUsers = users.filter((u) => u.id !== me.id).slice(0, 8);
  const suggested = users.filter((u) => u.id !== me.id && !following.has(u.id)).slice(0, 5);
  const myCrews = crews.filter((c) => joinedCrews.has(c.id));

  return (
    <Screen>
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
              <Icon name="plus" size={14} color={colors.onPink} />
            </View>
          </View>
          <Text style={styles.storyName}>Your story</Text>
        </Pressable>
        {storyUsers.map((u, i) => (
          <View key={u.id} style={{ alignItems: 'center', width: 66 }}>
            <Avatar user={u} size={62} ring={i < 5 ? colors.pink : colors.lineHi} />
            <Text style={styles.storyName} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
          </View>
        ))}
      </ScrollView>

      <Segmented items={FEEDS} value={feed} onChange={setFeed} style={{ marginTop: 16 }} />

      {feed === 'Nearby' && (
        <Text style={styles.nearbyNote}>
          <Icon name="map-marker" size={13} color={colors.cyan} /> Posts from {city.name} · switch city from Home or Explore
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

      {list.length === 0 ? (
        <EmptyState
          art={<Mascot pose="sleep" size={140} />}
          title="Quiet around here"
          body={feed === 'Nearby' ? `No posts in ${city.name} yet. Be the first to post a run!` : feed === 'Following' ? 'Follow people to fill your feed.' : 'No posts yet. Be the first to share!'}
          action="Create a post"
          onAction={() => router.push('/compose')}
        />
      ) : (
        <>
          {list.map((p, i) => (
            <React.Fragment key={p.id}>
              <FadeIn index={i}>
                <SocialPost post={p} />
              </FadeIn>

              {i === 2 && (
                <PressScale onPress={() => router.push('/crews')} style={{ marginBottom: 16 }} scaleTo={0.98}>
                  <SceneImage kind="crew" seed={21} height={140} scrim="strong">
                    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.kicker}>{myCrews.length ? `${myCrews.length} crew${myCrews.length > 1 ? 's' : ''} joined` : 'Better together'}</Text>
                        <Display size={26}>Find your crew</Display>
                        <Text style={styles.sub}>{crews.length} crews in {city.name} & online</Text>
                      </View>
                      <View style={styles.arrow}>
                        <Icon name="arrow-right" size={22} color={colors.onPink} />
                      </View>
                    </View>
                  </SceneImage>
                </PressScale>
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addStory: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  storyName: { color: colors.sub, fontFamily: fonts.medium, fontSize: 11, marginTop: 6 },
  nearbyNote: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginBottom: 12 },
  kicker: { color: colors.cyan, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  sub: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12 },
  arrow: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
});
