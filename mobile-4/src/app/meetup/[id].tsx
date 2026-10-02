/**
 * MEETUP CHECK-IN. View the meetup, see who's coming / checked in, check in, and optionally ask
 * the backend to notify your safety contact. We only say a notification was sent when the API
 * returns status "sent".
 *
 * With campus-service configured (CAMPUS_MAP_ON_SERVICE) the meetup comes from campus-service (host +
 * invitees), which doesn't serve check-in yet: check-in is gated ('meetupCheckIn') and shown as not
 * live, and nobody is shown as checked in. On a dedicated campus backend it's live.
 */
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { campusApi, CAMPUS_MAP_ON_SERVICE, errorText, isEndpointAvailable, type CheckInResult, type Meetup } from '@/api/campus';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { PhotoUpload } from '@/components/media/PhotoUpload';
import { MeetupRating } from '@/components/meetup/MeetupRating';
import { ErrorState, LoadingRows, SourceBadge } from '@/components/campus/States';
import { Button, Card, Display, Header, Icon, Kicker, Screen, SectionHeader, tap } from '@/components/ui';
import { formatEventDate } from '@/logic/format';
import { invalidateCampus, useAction, useCampus, useConfig, useMe } from '@/hooks/useCampus';
import { colors, fonts, radius } from '@/theme';
import { checkInOpen } from '@/logic/meetups';

const SAFETY_TEXT: Record<CheckInResult['safety_notification']['status'], string> = {
  sent: 'Your safety contact was notified.',
  failed: 'We couldn’t notify your safety contact. Let them know yourself.',
  not_configured: 'No safety contact is set up, so nobody was notified.',
  skipped: 'You chose not to notify anyone.',
};

export default function MeetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useCampus<Meetup>(`meetup:${id}`, () => campusApi.meetup(id));
  const me = useMe();
  const config = useConfig();
  const [notify, setNotify] = useState(true);
  const [openedAt] = useState(() => Date.now());
  const check = useAction((n: boolean) => campusApi.checkIn(id, n));
  const m = r.data;
  const safetyOn = !!config.data?.features.meetup_safety_notifications;
  const checkInLive = !CAMPUS_MAP_ON_SERVICE || isEndpointAvailable('meetupCheckIn');

  if (!m) {
    return (
      <Screen tabBar={false}>
        <Header back title="Meetup" />
        {r.error ? <ErrorState cause={r.cause} onRetry={r.reload} /> : <LoadingRows rows={3} height={90} />}
      </Screen>
    );
  }
  const open = checkInOpen(m);
  const done = check.data ?? (m.my_check_in_at ? null : undefined);
  const checkedIn = !!check.data || !!m.my_check_in_at;
  const doCheckIn = async () => {
    tap('impact');
    const res = await check.run(safetyOn && notify && !!me.data?.safety_contact_configured);
    if (res) {
      tap('success');
      invalidateCampus('meetup');
      r.reload();
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title="Meetup" right={<SourceBadge />} />
      <Kicker>{formatEventDate(m.starts_at)}</Kicker>
      <Display size={34} style={{ marginTop: 4 }}>{m.title}</Display>
      <Text
        style={[styles.meta, m.location.zone_id && { textDecorationLine: 'underline' }]}
        onPress={m.location.zone_id ? () => router.push({ pathname: '/zone/[id]', params: { id: m.location.zone_id! } }) : undefined}>
        <Icon name="map-marker" size={13} color={colors.primary} /> {m.location.name}
      </Text>

      {checkedIn ? (
        <Card style={styles.done}>
          <Mascot pose="celebrate" size={96} animated />
          <Text style={styles.doneTitle}>{openedAt > Date.parse(m.check_in_closes_at) ? 'You checked in' : 'You’re checked in'}</Text>
          <Text style={styles.body}>{new Date(check.data?.checked_in_at ?? m.my_check_in_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · have fun, move safe.</Text>
          {check.data && (
            <View style={[styles.safety, { borderColor: check.data.safety_notification.status === 'sent' ? colors.green : check.data.safety_notification.status === 'failed' ? colors.coral : colors.line }]}>
              <Icon
                name={check.data.safety_notification.status === 'sent' ? 'shield-check' : check.data.safety_notification.status === 'failed' ? 'shield-alert' : 'shield-outline'}
                size={18}
                color={check.data.safety_notification.status === 'sent' ? colors.green : check.data.safety_notification.status === 'failed' ? colors.coral : colors.dim}
              />
              <Text style={styles.safetyText}>
                {SAFETY_TEXT[check.data.safety_notification.status]}
                {check.data.safety_notification.status === 'sent' && check.data.safety_notification.contact_label ? ` Sent to ${check.data.safety_notification.contact_label}.` : ''}
              </Text>
            </View>
          )}
        </Card>
      ) : (
        <Card style={{ marginTop: 14, gap: 12 }}>
          {safetyOn && checkInLive && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="shield-account" size={22} color={colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Notify my safety contact</Text>
                <Text style={styles.small}>
                  {me.data?.safety_contact_configured ? 'They get the meetup name, place and time when you check in.' : 'No safety contact set up yet — add one from your profile.'}
                </Text>
              </View>
              <Switch value={notify && !!me.data?.safety_contact_configured} disabled={!me.data?.safety_contact_configured} onValueChange={setNotify} trackColor={{ false: colors.lineHi, true: colors.primaryDeep }} thumbColor={notify ? colors.primary : colors.dim} accessibilityLabel="Notify my safety contact" />
            </View>
          )}
          <Button
            label={!checkInLive ? 'Check-in isn’t live yet' : check.status === 'loading' ? 'Checking in…' : open ? 'Check in' : `Check-in opens ${formatEventDate(m.check_in_opens_at)}`}
            iconLeft="map-marker-check"
            disabled={!checkInLive || !open || check.status === 'loading'}
            onPress={doCheckIn}
          />
          {check.status === 'error' && <Text style={styles.err}>{errorText(check.error)}</Text>}
          {!checkInLive && <Text style={styles.small}>Checking in to this meetup switches on once the campus service supports it.</Text>}
          {checkInLive && done === undefined && !open && <Text style={styles.small}>Check-in closes {formatEventDate(m.check_in_closes_at)}.</Text>}
        </Card>
      )}

      {/* After it's over: rate the people you met (the backend decides when that's possible) */}
      <MeetupRating meetupId={m.id} meId={me.data?.user_id ?? null} />

      {checkedIn && (
        <>
          <SectionHeader title="Meetup photo" />
          <PhotoUpload purpose="meetup" context={{ meetup_id: m.id }} label="Share a photo" />
        </>
      )}

      <SectionHeader title={`Who’s coming · ${m.attendees.length}`} />
      <View style={{ gap: 8 }}>
        {m.attendees.map((a) => (
          <View key={a.user_id} style={styles.row}>
            <PersonAvatar person={a} size={36} />
            <Text style={styles.name}>{a.user_id === me.data?.user_id ? 'You' : a.display_name}</Text>
            {checkInLive && <Text style={[styles.status, { color: a.checked_in ? colors.green : colors.dim }]}>{a.checked_in ? 'Checked in' : 'Not yet'}</Text>}
          </View>
        ))}
        {!m.attendees.length && <Text style={styles.small}>No one else yet.</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14, marginTop: 6 },
  done: { marginTop: 14, alignItems: 'center', gap: 6, borderColor: colors.green },
  doneTitle: { color: colors.green, fontFamily: fonts.labelBold, fontSize: 22, letterSpacing: 1, textTransform: 'uppercase' },
  body: { color: colors.sub, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', borderWidth: 1.5, borderRadius: radius.md, padding: 10, marginTop: 6 },
  safetyText: { flex: 1, color: colors.sub, fontFamily: fonts.medium, fontSize: 13 },
  label: { color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
  small: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  status: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
});
