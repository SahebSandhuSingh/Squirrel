import { ThemeIconButton } from '@/components/ThemeToggle';
import { FeatureGate, useLocks } from '@/components/Locked';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CAMPUS_SOURCE } from '@/api/campus';
import { useUnread } from '@/state/socialStore';
import { NearbySquirrels } from '@/components/social/NearbySquirrels';
import { SquirrelDatesSection } from '@/components/social/SquirrelDates';
import { SceneImage } from '@/components/cards';
import { NotLiveYet } from '@/components/campus/States';
import { Display, Icon, IconButton, OverlayKicker, OverlaySub, PressScale, RowSub, RowTitle, Screen, SectionHeader } from '@/components/ui';
import { alpha, colors, fonts, radius } from '@/theme';

/**
 * SOCIAL — people, crews and discovery from the campus backend. The posts feed and stories have
 * no backend on this build, so they say "Not live yet" (no sample posts or people).
 */
export default function Social() {
  const locks = useLocks();
  const unread = useUnread();
  const huntLocked = locks.locked('partnerHunt');
  const campusLive = CAMPUS_SOURCE !== 'off';

  return (
    <Screen>
      <View style={styles.head}>
        <Display size={34}>Social</Display>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ThemeIconButton />
          <IconButton icon="account-search-outline" onPress={() => router.push('/crews')} label="Find crews" />
          <IconButton icon="bell-outline" badge={unread ?? undefined} onPress={() => router.push('/notifications')} label="Notifications" />
        </View>
      </View>

      {/* Partner Hunt: locked until launch; opens the Coming soon screen */}
      <PressScale onPress={() => router.push('/partner-hunt')} style={styles.hunt} scaleTo={0.98} accessibilityLabel={huntLocked ? 'Partner Hunt, find your workout buddy, coming soon' : 'Partner Hunt'}>
        <View style={styles.huntIcon}>
          <Icon name="account-heart-outline" size={24} color={colors.primary} />
          {huntLocked && (
            <View style={styles.huntLock}>
              <Icon name="lock" size={10} color={colors.onPrimary} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <RowTitle>Partner Hunt</RowTitle>
          <RowSub>Find your workout buddy</RowSub>
        </View>
        <FeatureGate feature="partnerHunt">
          <Icon name="chevron-right" size={22} color={colors.dim} />
        </FeatureGate>
      </PressScale>

      {/* Friend Mode + Active Now: activity-based discovery from the campus backend */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <PressScale onPress={() => router.push('/friends')} style={[styles.hunt, { flex: 1, marginBottom: 0 }]} scaleTo={0.98} accessibilityLabel="Friend Mode">
          <Icon name="account-heart" size={22} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <RowTitle>Friend Mode</RowTitle>
            <RowSub>Same routes, new people</RowSub>
          </View>
        </PressScale>
        <PressScale onPress={() => router.push('/active')} style={[styles.hunt, { flex: 1, marginBottom: 0 }]} scaleTo={0.98} accessibilityLabel="Active now">
          <Icon name="radar" size={22} color={colors.green} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <RowTitle>Active now</RowTitle>
            <RowSub>Near you</RowSub>
          </View>
        </PressScale>
      </View>

      {campusLive ? (
        <>
          <NearbySquirrels />
          <SquirrelDatesSection />
        </>
      ) : (
        <NotLiveYet name="People on campus" compact body="Nearby squirrels, friends and Squirrel Dates come from the campus backend, which isn’t connected to this build yet." />
      )}

      {/* Crews (campus backend) */}
      <PressScale onPress={() => router.push('/crews')} style={{ marginTop: 14 }} scaleTo={0.98}>
        <SceneImage kind="crew" seed={21} height={140} scrim="strong">
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <OverlayKicker>Better together</OverlayKicker>
              <Display size={26} color={colors.onImage}>Find your crew</Display>
              <OverlaySub>Crews on your campus</OverlaySub>
            </View>
            <View style={styles.arrow}>
              <Icon name="arrow-right" size={22} color={colors.onPrimary} />
            </View>
          </View>
        </SceneImage>
      </PressScale>

      {/* Feed: no posts backend on this build */}
      <SectionHeader title="Feed" />
      <NotLiveYet name="Posts & stories" compact body="The feed switches on once the posts backend is connected. Nothing here is sample content." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hunt: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineHi, padding: 12 },
  huntIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.1), borderWidth: 1, borderColor: alpha(colors.primary, 0.35) },
  huntLock: { position: 'absolute', right: -5, top: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addStory: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  storyName: { color: colors.sub, fontFamily: fonts.medium, fontSize: 11, marginTop: 6 },
  nearbyNote: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginBottom: 12 },
  arrow: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
