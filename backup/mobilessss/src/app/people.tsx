import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { BlockSkeleton, PersonRow, SignInToSocial, SocialError } from '@/components/socialParts';
import { EmptyState, Header, Label, Screen, SearchBar } from '@/components/ui';
import { profileApi, type Follower, type Page } from '@/api/social';
import { useRemote } from '@/api/useRemote';
import { useSocialEnabled } from '@/hooks/useSocial';
import { colors, fonts } from '@/theme';

/** Find people: search by @username or name (GET /v1/users/search) and suggestions. */
export default function People() {
  const enabled = useSocialEnabled();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const searching = term.length >= 2;
  const results = useRemote<Page<Follower>>(enabled && searching ? `social:search:${term.toLowerCase()}` : null, () => profileApi.search(term));
  const suggested = useRemote<Page<Follower>>(enabled ? 'social:suggestions' : null, () => profileApi.suggestions(20));

  if (!enabled) {
    return (
      <Screen tabBar={false}>
        <Header back title="Find People" />
        <SignInToSocial />
      </Screen>
    );
  }
  const r = searching ? results : suggested;
  return (
    <Screen tabBar={false} scroll={false}>
      <Header back title="Find People" />
      <SearchBar placeholder="Search @username or name" value={q} onChangeText={setQ} />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Label style={{ marginBottom: 8 }}>{searching ? 'Results' : 'Suggested for you'}</Label>
        {r.error && !r.data ? (
          <SocialError error={r.error} onRetry={r.reload} />
        ) : !r.data ? (
          <View style={{ gap: 8 }}>
            <BlockSkeleton height={66} />
            <BlockSkeleton height={66} />
          </View>
        ) : r.data.items.length === 0 ? (
          <EmptyState title={searching ? 'No one found' : 'No suggestions yet'} body={searching ? `Nobody matches “${term}”.` : 'As more people join, they show up here.'} />
        ) : (
          r.data.items.map((u) => <PersonRow key={u.id} user={u} />)
        )}
        {r.loading && !!r.data && <ActivityIndicator color={colors.primary} />}
        {q.trim().length === 1 && <Text style={{ color: colors.dim, fontFamily: fonts.regular, fontSize: 12 }}>Type at least 2 characters.</Text>}
      </ScrollView>
    </Screen>
  );
}
