import { useLocalSearchParams } from 'expo-router';
import { ProfileView } from '@/components/ProfileView';
import { EmptyState, Header, Screen } from '@/components/ui';
import { users } from '@/data/users';
import { useApp } from '@/state/AppState';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useApp();
  // No fallback to the first user: that is the signed-in user, and an unknown id would
  // open *your* profile with its edit controls.
  const user = id === me.id ? me : users.find((u) => u.id === id);
  if (!user) return <Screen tabBar={false}><Header back title="Profile" /><EmptyState title="User not found" body="This profile may have been removed." /></Screen>;
  return <ProfileView user={user} isMe={user.id === me.id} />;
}
