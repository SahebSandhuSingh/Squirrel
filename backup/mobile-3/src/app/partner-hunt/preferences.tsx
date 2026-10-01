import { SoonScreen } from '@/components/Locked';
import { router } from 'expo-router';

/** Partner Hunt · Preferences. Not built yet; the layout shows the locked screen while LOCKED.partnerHunt is on. */
export default function PartnerPreferencesScreen() {
  return <SoonScreen title="Preferences" body="Campus, interests, activities, availability and goals." onBack={() => (router.canGoBack() ? router.back() : router.replace('/social'))} />;
}
