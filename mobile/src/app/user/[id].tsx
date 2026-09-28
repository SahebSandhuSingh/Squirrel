import { useLocalSearchParams } from 'expo-router';
import { CAMPUS_SOURCE } from '@/api/campus';
import { CampusProfileView } from '@/components/campus/CampusProfile';
import { ProfileView } from '@/components/ProfileView';
import { userById } from '@/data/users';
import { useMe } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useApp();
  const campusMe = useMe();
  if (CAMPUS_SOURCE === 'off') {
    const user = id === me.id ? me : userById(id);
    return <ProfileView user={user} isMe={user.id === me.id} />;
  }
  return <CampusProfileView userId={id} isMe={id === campusMe.data?.user_id} />;
}
