import { Stack } from 'expo-router';
import { PartnerHuntLocked } from '@/components/PartnerHuntLocked';
import { LOCKED } from '@/data/features';
import { colors } from '@/theme';

/**
 * Partner Hunt: Find your buddy → Preferences → Matching → Buddy profiles → Connect.
 * While LOCKED.partnerHunt is on, every route in this folder (including deep links)
 * renders the locked screen instead of its content.
 */
export default function PartnerHuntLayout() {
  if (LOCKED.partnerHunt) return <PartnerHuntLocked />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />;
}
