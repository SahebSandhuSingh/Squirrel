import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlockSkeleton, PersonRow, SignInToSocial, SocialError } from '@/components/socialParts';
import { Button, EmptyState, Header, Screen } from '@/components/ui';
import { Mascot } from '@/art/Mascot';
import { followApi, socialErrorText, type Follower } from '@/api/social';
import { invalidateRemote } from '@/api/useRemote';
import { useFollowList, useSocialEnabled } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { useState } from 'react';
import { colors, fonts } from '@/theme';

type Kind = 'followers' | 'following' | 'requests';
const TITLES: Record<Kind, string> = { followers: 'Followers', following: 'Following', requests: 'Follow requests' };

/** Followers / following of any user, or your pending follow requests (kind=requests). Paged 20 at a time. */
export default function Follows() {
  const { id, kind = 'followers', name } = useLocalSearchParams<{ id?: string; kind?: Kind; name?: string }>();
  const enabled = useSocialEnabled();
  const list = useFollowList(id, kind);
  const insets = useSafeAreaInsets();
  const { toast } = useApp();
  const [handled, setHandled] = useState<Record<string, 'accepted' | 'declined'>>({});

  const title = name && kind !== 'requests' ? `${name.split(' ')[0]} · ${TITLES[kind]}` : TITLES[kind];
  if (!enabled) {
    return (
      <Screen tabBar={false}>
        <Header back title={TITLES[kind]} />
        <SignInToSocial />
      </Screen>
    );
  }

  const answer = async (u: Follower, accept: boolean) => {
    setHandled((h) => ({ ...h, [u.id]: accept ? 'accepted' : 'declined' }));
    try {
      await (accept ? followApi.accept(u.id) : followApi.decline(u.id));
      invalidateRemote('social:me');
    } catch (e) {
      setHandled((h) => {
        const next = { ...h };
        delete next[u.id];
        return next;
      });
      toast(socialErrorText(e), 'alert-circle-outline', colors.coral);
    }
  };

  const requestActions = (u: Follower) =>
    handled[u.id] ? (
      <Text style={styles.done}>{handled[u.id] === 'accepted' ? 'Accepted' : 'Declined'}</Text>
    ) : (
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Button label="Accept" size="sm" onPress={() => answer(u, true)} />
        <Button label="Decline" size="sm" variant="secondary" onPress={() => answer(u, false)} />
      </View>
    );

  return (
    <Screen tabBar={false} scroll={false}>
      <Header back title={title} />
      <FlatList
        data={list.items}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => <PersonRow user={item} right={kind === 'requests' ? requestActions(item) : undefined} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 30 }}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: 8 }}>
              <BlockSkeleton height={66} />
              <BlockSkeleton height={66} />
              <BlockSkeleton height={66} />
            </View>
          ) : list.error ? (
            <SocialError error={list.error} onRetry={list.retry} />
          ) : (
            <EmptyState art={<Mascot pose="sit" size={110} />} title={kind === 'requests' ? 'No requests' : 'Nobody here yet'} body={kind === 'requests' ? 'New follow requests show up here.' : kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'} />
          )
        }
        ListFooterComponent={
          list.items.length ? (list.error ? <SocialError compact error={list.error} onRetry={list.retry} /> : list.loadingMore ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : null) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textTransform: 'uppercase' },
});
