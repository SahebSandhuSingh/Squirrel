import { SoonScreen } from '@/components/Locked';
import { router } from 'expo-router';

/** Partner Hunt · Buddy profile. Not built yet; the layout shows the locked screen while LOCKED.partnerHunt is on. */
export default function BuddyProfileScreen() {
  return <SoonScreen title="Buddy profile" body="Level, streak and favourite workouts." onBack={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />;
}
