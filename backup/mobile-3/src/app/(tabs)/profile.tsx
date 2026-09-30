import { ProfileView } from '@/components/ProfileView';
import { useApp } from '@/state/AppState';

export default function Profile() {
  const { me } = useApp();
  return <ProfileView user={me} isMe />;
}
