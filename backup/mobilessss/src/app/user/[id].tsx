import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { fromServerProfile, ProfileView } from '@/components/ProfileView';
import { BlockSkeleton, SignInToSocial, SocialError } from '@/components/socialParts';
import { Header, Screen } from '@/components/ui';
import { usePublicProfile, usePullRefresh } from '@/hooks/useSocial';

/** Anyone's profile (GET /v1/users/:id/profile), with Follow. */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload, enabled } = usePublicProfile(id);
  const pull = usePullRefresh(loading, reload);

  if (!enabled) {
    return (
      <Screen tabBar={false}>
        <Header back title="Profile" />
        <SignInToSocial />
      </Screen>
    );
  }
  if (data?.is_me) return <Redirect href="/profile" />;
  if (!data) {
    return (
      <Screen tabBar={false}>
        <Header back title="Profile" />
        {error ? (
          <SocialError error={error} onRetry={reload} />
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            <BlockSkeleton height={160} />
            <BlockSkeleton height={60} />
            <BlockSkeleton height={120} />
          </View>
        )}
      </Screen>
    );
  }
  return <ProfileView vm={fromServerProfile(data)} isMe={false} onRefresh={pull.onRefresh} refreshing={pull.refreshing} onChanged={reload} />;
}
