import { CAMPUS_SOURCE } from '@/api/campus';
import { CampusProfileView } from '@/components/campus/CampusProfile';
import { ProfileView } from '@/components/ProfileView';
import { useApp } from '@/state/AppState';

/** Your profile: the campus profile from the backend; the offline demo profile when campus isn't live. */
export default function Profile() {
  const { me } = useApp();
  if (CAMPUS_SOURCE === 'off') return <ProfileView user={me} isMe />;
  return <CampusProfileView isMe />;
}
