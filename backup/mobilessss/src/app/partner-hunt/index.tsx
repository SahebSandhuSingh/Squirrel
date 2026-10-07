import { SoonScreen } from '@/components/Locked';
import { router } from 'expo-router';

/** Partner Hunt · Find your buddy. Not built yet; the layout shows the locked screen while LOCKED.partnerHunt is on. */
export default function FindYourBuddy() {
  return <SoonScreen title="Find your buddy" body="Start here: tell us you're up for a training partner." onBack={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />;
}
