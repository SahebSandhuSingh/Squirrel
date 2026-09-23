import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CityBackdrop, RunnersArt } from '@/components/art';
import { AvatarCircle, Display, Icon, IconButton, Mascot, OutlineButton, TAB_BAR_SPACE, tap } from '@/components/ui';
import { avatars, highlights, user } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const GRID_TABS = ['view-grid', 'play-box-outline', 'account-box-outline'] as const;

/** Profile. */
export default function Profile() {
  const insets = useSafeAreaInsets();
  const { avatar, level } = useApp();
  const [grid, setGrid] = useState<(typeof GRID_TABS)[number]>('view-grid');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }} showsVerticalScrollIndicator={false}>
      <View style={{ height: 150 + insets.top }}>
        <CityBackdrop height={150 + insets.top} seed={42} />
        <View style={[styles.topBar, { top: insets.top + 6 }]}>
          <View style={styles.levelChip}>
            <Icon name="crown" size={14} color={colors.gold} />
            <Text style={styles.levelText}>Level {level}</Text>
          </View>
          <IconButton icon="cog-outline" onPress={() => router.push('/avatar')} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: -54 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <AvatarCircle emoji={avatars[avatar]} size={108} ring={colors.pink} style={{ borderWidth: 3 }} />
          {[
            [String(user.posts), 'Posts'],
            [user.followers, 'Followers'],
            [String(user.following), 'Following'],
          ].map(([v, l]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', paddingBottom: 8 }}>
              <Text style={styles.statV}>{v}</Text>
              <Text style={styles.statL}>{l}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Display size={28}>{user.name}</Display>
          <Icon name="check-decagram" size={20} color={colors.blue} style={{ marginLeft: 6 }} />
        </View>
        <Text style={styles.handle}>{user.handle}</Text>
        <Text style={styles.bio}>{user.bio}</Text>

        <View style={styles.tags}>
          {user.tags.map((t) => (
            <View key={t.label} style={styles.tag}>
              <Icon name={t.icon} size={14} color={colors.pink} />
              <Text style={styles.tagText}>{t.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <OutlineButton label="Edit Profile" onPress={() => router.push('/avatar')} style={{ flex: 1 }} />
          <OutlineButton icon="account-plus-outline" onPress={() => router.push('/crew')} style={{ flex: 1 }} />
        </View>

        <View style={styles.highlights}>
          {highlights.map((h) => (
            <Pressable key={h.label} onPress={() => { tap(); router.push(h.route as Href); }} style={{ alignItems: 'center' }}>
              <View style={styles.hlCircle}>
                <Icon name={h.icon} size={26} color={colors.pink} />
              </View>
              <Text style={styles.hlText}>{h.label}</Text>
            </Pressable>
          ))}
          <Pressable style={{ alignItems: 'center' }} onPress={() => router.push('/run')}>
            <View style={[styles.hlCircle, { borderStyle: 'dashed', borderColor: colors.dim }]}>
              <Icon name="plus" size={26} color={colors.text} />
            </View>
            <Text style={styles.hlText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.gridTabs}>
          {GRID_TABS.map((g) => (
            <Pressable key={g} onPress={() => { tap(); setGrid(g); }} style={[styles.gridTab, grid === g && { borderBottomColor: colors.pink }]}>
              <Icon name={g} size={22} color={grid === g ? colors.text : colors.dim} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.tile}>
            {i % 3 === 2 ? (
              <View style={{ flex: 1, backgroundColor: '#2A0F3A', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Mascot size={90} />
              </View>
            ) : (
              <RunnersArt height={140} seed={50 + i} />
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,6,16,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  levelText: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
  statV: { color: colors.text, fontFamily: fonts.black, fontSize: 18 },
  statL: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  handle: { color: colors.dim, fontFamily: fonts.medium },
  bio: { color: colors.text, fontFamily: fonts.regular, marginTop: 6, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { color: colors.text, fontSize: 12, fontFamily: fonts.medium },
  highlights: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  hlCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.pink, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  hlText: { color: colors.text, fontSize: 11, fontFamily: fonts.medium },
  gridTabs: { flexDirection: 'row', marginTop: 18, borderBottomWidth: 1, borderBottomColor: colors.line },
  gridTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '33.333%', aspectRatio: 0.8, borderWidth: 1, borderColor: colors.bg, overflow: 'hidden' },
});
