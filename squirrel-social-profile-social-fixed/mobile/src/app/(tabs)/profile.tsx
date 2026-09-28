import { useEffect } from 'react';
import { View } from 'react-native';
import { fromServerProfile, ProfileView, type ProfileVM } from '@/components/ProfileView';
import { BlockSkeleton, SocialError } from '@/components/socialParts';
import { Screen } from '@/components/ui';
import { useMyProfile, usePullRefresh } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';

/** Your profile. Signed in: the server profile (GET /v1/users/me/profile). Demo mode: local identity only. */
export default function Profile() {
  const app = useApp();
  const { data, error, loading, reload, enabled } = useMyProfile();
  const { syncServerXp, setLook } = app;
  const pull = usePullRefresh(loading, reload);

  // The server profile is the source of truth for XP (synced from the Run Module) and your look.
  useEffect(() => {
    if (!data) return;
    if (data.stats.xp_synced_at) syncServerXp(data.stats.xp);
    if (data.user.avatar_look) setLook(data.user.avatar_look);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!enabled) {
    const vm: ProfileVM = {
      id: app.me.id,
      name: app.me.name,
      username: app.me.handle,
      avatar: { id: app.me.id, name: app.me.name, look: app.look, isMe: true },
      verified: false,
      bio: null,
      area: app.city.name,
      college: null,
      interests: [],
      level: app.level,
      levelXp: app.levelXp,
      xpPerLevel: 2000,
      streak: null,
      counts: null,
      badges: [],
      recentPosts: [],
      recentActivities: [],
      restricted: false,
      relationship: null,
      isPrivate: false,
      live: false,
    };
    return <ProfileView vm={vm} isMe />;
  }
  if (!data) {
    return (
      <Screen>
        {error ? (
          <SocialError error={error} onRetry={reload} />
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            <BlockSkeleton height={190} />
            <BlockSkeleton height={60} />
            <BlockSkeleton height={120} />
          </View>
        )}
      </Screen>
    );
  }
  const vm = fromServerProfile(data);
  // No saved look on the server yet: show the one you're designing locally.
  return <ProfileView vm={{ ...vm, avatar: { ...vm.avatar, look: data.user.avatar_look ?? app.look } }} isMe onRefresh={pull.onRefresh} refreshing={pull.refreshing} />;
}
