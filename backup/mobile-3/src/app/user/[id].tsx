import { useLocalSearchParams } from 'expo-router';
import { ProfileView } from '@/components/ProfileView';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useApp();
  const user = id === me.id ? me : userById(id);
  return <ProfileView user={user} isMe={user.id === me.id} />;
}
