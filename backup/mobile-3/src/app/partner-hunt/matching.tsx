import { SoonScreen } from '@/components/Locked';
import { router } from 'expo-router';

/** Partner Hunt · Matching. Not built yet; the layout shows the locked screen while LOCKED.partnerHunt is on. */
export default function Matching() {
  return <SoonScreen title="Matching" body="People on your campus who train like you do." onBack={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />;
}
