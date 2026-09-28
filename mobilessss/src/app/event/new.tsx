import { router, useLocalSearchParams } from 'expo-router';
import { NewEventForm } from '@/community/EventsLive';
import { EmptyState, Header, Screen } from '@/components/ui';
import { useSocialEnabled } from '@/hooks/useSocial';

/** Plan an event, open to all or (`?crew=<id>`) for a crew. */
export default function NewEventRoute() {
  const { crew } = useLocalSearchParams<{ crew?: string }>();
  if (useSocialEnabled()) return <NewEventForm crewId={crew} />;
  return (
    <Screen tabBar={false}>
      <Header back title="Plan an event" />
      <EmptyState title="Sign in to plan an event" body="Events live on your account, so sign in first." action="Sign in" onAction={() => router.push('/sign-in')} />
    </Screen>
  );
}
