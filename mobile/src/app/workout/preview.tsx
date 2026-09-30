/**
 * DESIGN PREVIEW (dev builds only) — every shared-workout state rendered from static props, so
 * the screens can be reviewed before the backend exists. Nothing here is a session: no users,
 * no network, no sync. Production builds redirect away.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { CAMPUS_SOURCE } from '@/api/campus';
import type { PersonLite } from '@/api/campus/types';
import { ActiveShared, Countdown, ExerciseHeader, InvitePanel, Participants, ReadyButton, SharedComplete, SharedEnded, SharedTag, WaitingForPartner } from '@/components/workout/SharedWorkout';
import { Header, Screen } from '@/components/ui';
import { alpha, colors, fonts, radius } from '@/theme';

const YOU: PersonLite = { user_id: 'preview-you', display_name: 'You', avatar_url: null, hostel: null };
const PARTNER: PersonLite = { user_id: 'preview-partner', display_name: 'Workout partner', avatar_url: null, hostel: null };
const seat = (person: PersonLite | null, label: string, o: Partial<{ ready: boolean; connected: boolean; left: boolean }> = {}) => ({ person, label, ready: !!o.ready, connected: o.connected ?? true, left: !!o.left, joined: !!person });
const STATES = ['Waiting', 'Lobby', 'Countdown', 'Active', 'Reconnecting', 'Complete', 'Partner left', 'Expired', 'Connection lost', 'Not live'] as const;
type State = (typeof STATES)[number];
const noop = () => {};

export default function SharedWorkoutPreview() {
  const [state, setState] = useState<State>('Waiting');
  if (CAMPUS_SOURCE !== 'mock') return <Redirect href="/home" />;
  const home = () => router.back();
  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Design preview · static states, not a live session</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 10 }}>
        {STATES.map((s) => (
          <Text key={s} onPress={() => setState(s)} accessibilityRole="button" style={[styles.chip, s === state && styles.chipOn]}>{s}</Text>
        ))}
      </ScrollView>

      {state === 'Waiting' && (
        <View style={{ gap: 16 }}>
          <SharedTag status="waiting" />
          <ExerciseHeader name="Squat" icon="human-handsdown" plan="12 reps · together" blurb="Depth, knee tracking and torso lean, scored every rep." />
          <Participants you={seat(YOU, 'You')} partner={seat(null, 'Partner')} />
          <WaitingForPartner />
          <InvitePanel url="https://squirrelsocial.in/w/PREVIEW" code="PREVIEW" exerciseName="Squat" />
        </View>
      )}
      {state === 'Lobby' && (
        <View style={{ gap: 16 }}>
          <SharedTag status="lobby" />
          <ExerciseHeader name="Squat" icon="human-handsdown" plan="12 reps · together" />
          <Participants you={seat(YOU, 'You', { ready: true })} partner={seat(PARTNER, 'Partner')} />
          <ReadyButton ready busy={false} onToggle={noop} />
        </View>
      )}
      {state === 'Countdown' && (
        <View style={{ gap: 14 }}>
          <SharedTag status="starting" />
          <Participants you={seat(YOU, 'You', { ready: true })} partner={seat(PARTNER, 'Partner', { ready: true })} />
          <Countdown seconds={3} />
        </View>
      )}
      {(state === 'Active' || state === 'Reconnecting') && (
        <ActiveShared exercise="Squats" target={20} myReps={14} partnerReps={13} partnerName="Partner" conn={state === 'Active' ? 'live' : 'reconnecting'} paused={false} onRep={noop} onUndo={noop} onPause={noop} onFinish={noop} onExit={noop} />
      )}
      {state === 'Complete' && <SharedComplete myReps={20} partnerReps={18} partnerName="Partner" partnerStillGoing={false} xp={null} onHome={home} onProgress={home} />}
      {state === 'Partner left' && <SharedEnded kind="partner_left_during" primary="Save my reps" onPrimary={home} secondary="Back to Home" onSecondary={home} />}
      {state === 'Expired' && <SharedEnded kind="expired" primary="New shared session" onPrimary={home} secondary="Back to Home" onSecondary={home} />}
      {state === 'Connection lost' && <SharedEnded kind="connection_lost" primary="Try to reconnect" onPrimary={home} secondary="Leave" onSecondary={home} />}
      {state === 'Not live' && <SharedEnded kind="unavailable" primary="Train solo instead" onPrimary={home} secondary="Back" onSecondary={home} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.violet, borderRadius: radius.md, padding: 8, backgroundColor: alpha(colors.violet, 0.08) },
  bannerText: { color: colors.violet, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  chip: { color: colors.sub, fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  chipOn: { color: colors.primary, borderColor: colors.primary },
});
