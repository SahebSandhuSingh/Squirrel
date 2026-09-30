import { router } from 'expo-router';
import { NewCrewForm } from '@/community/CrewsLive';
import { EmptyState, Header, Screen } from '@/components/ui';
import { useSocialEnabled } from '@/hooks/useSocial';

/** Start a crew (Social service). */
export default function NewCrewRoute() {
  if (useSocialEnabled()) return <NewCrewForm />;
  return (
    <Screen tabBar={false}>
      <Header back title="Start a crew" />
      <EmptyState title="Sign in to start a crew" body="Crews live on your account, so sign in first." action="Sign in" onAction={() => router.push('/sign-in')} />
    </Screen>
  );
}
