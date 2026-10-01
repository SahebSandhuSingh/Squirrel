import { router } from 'expo-router';
import { MeetupCheckIn } from '@/community/EventsLive';
import { EmptyState, Header, Screen } from '@/components/ui';
import { useSocialEnabled } from '@/hooks/useSocial';

/** "I'm here" at any meetup spot, telling chosen friends. */
export default function CheckInRoute() {
  if (useSocialEnabled()) return <MeetupCheckIn />;
  return (
    <Screen tabBar={false}>
      <Header back title="Check in" />
      <EmptyState title="Sign in to check in" body="Check-ins tell your friends, so sign in first." action="Sign in" onAction={() => router.push('/sign-in')} />
    </Screen>
  );
}
