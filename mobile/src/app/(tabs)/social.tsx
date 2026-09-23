import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { RunnersArt } from '@/components/art';
import { AvatarCircle, Icon, IconButton, Screen, Segmented, Tagline, tap } from '@/components/ui';
import { posts } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const FEEDS = ['For You', 'Following', 'Nearby'] as const;
type Feed = (typeof FEEDS)[number];

/** Social feed. */
export default function Social() {
  const [feed, setFeed] = useState<Feed>('For You');
  const { liked, toggleLike, saved, toggleSave } = useApp();

  return (
    <Screen>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Segmented items={FEEDS} value={feed} onChange={setFeed} />
        </View>
        <IconButton icon="account-multiple-plus" onPress={() => router.push('/crew')} style={{ marginLeft: 12 }} />
      </View>

      {posts
        .filter((p) => p.feed.includes(feed))
        .map((p, i) => {
          const isLiked = liked.has(p.id);
          return (
            <View key={p.id} style={styles.post}>
              <View style={styles.postHead}>
                <AvatarCircle emoji={p.avatar} size={40} ring={colors.pink} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.author}>{p.author}</Text>
                  <Text style={styles.meta}>{p.meta}</Text>
                </View>
                <Icon name="dots-horizontal" size={22} color="#555" />
              </View>

              {p.art === 'run' && (
                <View>
                  <RunnersArt height={220} seed={30 + i} />
                  <Tagline size={22} style={{ position: 'absolute', right: 14, top: 20, textAlign: 'right' }}>
                    GOOD{'\n'}PEOPLE{'\n'}BETTER{'\n'}HABITS.
                  </Tagline>
                </View>
              )}

              <Text style={styles.caption}>{p.caption}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => { tap(); toggleLike(p.id); }} style={styles.action} hitSlop={6}>
                  <Icon name={isLiked ? 'heart' : 'heart-outline'} size={24} color={isLiked ? colors.pink : '#222'} />
                  <Text style={styles.count}>{p.likes + (isLiked ? 1 : 0)}</Text>
                </Pressable>
                <View style={styles.action}>
                  <Icon name="comment-outline" size={22} color="#222" />
                  <Text style={styles.count}>{p.comments}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => { tap(); toggleSave(p.id); }} hitSlop={6}>
                  <Icon name={saved.has(p.id) ? 'bookmark' : 'bookmark-outline'} size={24} color="#222" />
                </Pressable>
              </View>
            </View>
          );
        })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  post: { backgroundColor: '#FFF7FB', borderRadius: radius.lg, overflow: 'hidden', marginBottom: 14 },
  postHead: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  author: { color: '#111', fontFamily: fonts.bold, fontSize: 15 },
  meta: { color: '#777', fontFamily: fonts.regular, fontSize: 12 },
  caption: { color: '#111', fontFamily: fonts.medium, fontSize: 14, paddingHorizontal: 12, paddingTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 18 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { color: '#111', fontFamily: fonts.semibold },
});
