import { SoonScreen } from '@/components/Locked';
import { router } from 'expo-router';

/** Partner Hunt · Connect. Not built yet; the layout shows the locked screen while LOCKED.partnerHunt is on. */
export default function Connect() {
  return <SoonScreen title="Connect" body="Say hi and plan your first session." onBack={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />;
}
