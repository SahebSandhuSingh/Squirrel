/**
 * MEETUP CHECK-IN. View the meetup, see who's coming / checked in, check in, and optionally ask
 * the backend to notify your safety contact. We only say a notification was sent when the API
 * returns status "sent". With the Social service, check-in instead tells up to five friends (people
 * who follow you or share a crew) that you've arrived — "meetup check-in notifies a friend".
 */
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { campusApi, errorText, type CheckInResult, type Meetup } from '@/api/campus';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { SOCIAL_API_CONFIGURED, socialApi } from '@/api/social';

import { PhotoUpload } from '@/components/media/PhotoUpload';
import { MeetupRating } from '@/components/meetup/MeetupRating';
import { ErrorState, LoadingRows } from '@/components/campus/States';
import { Button, Card, Display, Header, Icon, Kicker, PressScale, Screen, SectionHeader, tap } from '@/components/ui';
import { formatEventDate } from '@/logic/format';
import { invalidateCampus, useAction, useCampus, useConfig, useMe } from '@/hooks/useCampus';
import { colors, fonts, radius } from '@/theme';
import { checkInOpen } from '@/logic/meetups';

type NotifyCandidate = { id: string; display_name: string; avatar_url: string | null };

async function loadNotifyCandidates(): Promise<NotifyCandidate[]> {
  const meId = (await socialApi.myProfile()).user.id;
  const [following, crews] = await Promise.all([socialApi.following(meId, 50), socialApi.crews(true)]);
  const details = await Promise.all(crews.items.slice(0, 5).map((c) => socialApi.crew(c.id).catch(() => null)));
  const seen = new Map<string, NotifyCandidate>();
  for (const u of following.items) if (!u.is_me) seen.set(u.id, { id: u.id, display_name: u.display_name, avatar_url: u.avatar_url });
  for (const d of details) for (const m of d?.members ?? []) if (!m.is_me && !seen.has(m.user.id)) seen.set(m.user.id, { id: m.user.id, display_name: m.user.display_name, avatar_url: m.user.avatar_url });
  return [...seen.values()];
}

const SAFETY_TEXT: Record<CheckInResult['safety_notification']['status'], string> = {
  sent: 'Your safety contact was notified.',
  failed: 'We couldn’t notify your safety contact. Let them know yourself.',
  not_configured: 'No safety contact is set up, so nobody was notified.',
  skipped: 'You chose not to notify anyone.',
};
const FRIEND_TEXT: Record<CheckInResult['safety_notification']['status'], string> = {
  sent: 'Your friends were told you’ve arrived.',
  failed: 'None of the people you picked could be notified (only followers and crewmates can be).',
  not_configured: 'Nobody was notified.',
  skipped: 'You didn’t notify anyone.',
};
const MAX_NOTIFY = 5;

export default function MeetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useCampus<Meetup>(`meetup:${id}`, () => campusApi.meetup(id));
  const me = useMe();
  const config = useConfig();
  const [notify, setNotify] = useState(true);
  const [openedAt] = useState(() => Date.now());
  const [picked, setPicked] = useState<string[]>([]);
  const check = useAction((n: boolean) => campusApi.checkIn(id, n, picked));
  // Who can be told: people you follow and your crewmates (the Social service skips anyone else).
  const friends = useCampus<NotifyCandidate[]>('social:notify-candidates', loadNotifyCandidates, { enabled: SOCIAL_API_CONFIGURED });
  const togglePick = (uid: string) => setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : p.length >= MAX_NOTIFY ? p : [...p, uid]));
  const m = r.data;
  const safetyOn = !!config.data?.features.meetup_safety_notifications;

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
    const res = await check.run(SOCIAL_API_CONFIGURED ? picked.length > 0 : safetyOn && notify && !!me.data?.safety_contact_configured);
    if (res) {
      tap('success');
      invalidateCampus('meetup');
      r.reload();
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title="Meetup" />
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
                {(SOCIAL_API_CONFIGURED ? FRIEND_TEXT : SAFETY_TEXT)[check.data.safety_notification.status]}
                {check.data.safety_notification.status === 'sent' && check.data.safety_notification.contact_label ? ` Sent to ${check.data.safety_notification.contact_label}.` : ''}
              </Text>
            </View>
          )}
        </Card>
      ) : (
        <Card style={{ marginTop: 14, gap: 12 }}>
          {SOCIAL_API_CONFIGURED && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="account-multiple-check" size={22} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Tell friends you’re here</Text>
                  <Text style={styles.small}>Pick up to {MAX_NOTIFY}. They get the meetup name when you check in.</Text>
                </View>
              </View>
              {friends.error && !friends.data ? (
                <ErrorState cause={friends.cause} onRetry={friends.reload} compact />
              ) : !friends.data ? (
                <LoadingRows rows={1} height={40} />
              ) : friends.data.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {friends.data.map((u) => {
                    const on = picked.includes(u.id);
                    return (
                      <PressScale key={u.id} onPress={() => { tap(); togglePick(u.id); }} style={[styles.pick, on && { borderColor: colors.green, backgroundColor: colors.card }]} scaleTo={0.95} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Notify ${u.display_name}`}>
                        <PersonAvatar person={{ user_id: u.id, display_name: u.display_name, avatar_url: u.avatar_url }} size={24} link={false} />
                        <Text style={[styles.pickText, on && { color: colors.green }]} numberOfLines={1}>{u.display_name.split(' ')[0]}</Text>
                        {on && <Icon name="check" size={14} color={colors.green} />}
                      </PressScale>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.small}>Follow people (or join a crew) to be able to notify them.</Text>
              )}
            </View>
          )}
          {safetyOn && !SOCIAL_API_CONFIGURED && (
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
            label={check.status === 'loading' ? 'Checking in…' : open ? 'Check in' : `Check-in opens ${formatEventDate(m.check_in_opens_at)}`}
            iconLeft="map-marker-check"
            disabled={!open || check.status === 'loading'}
            onPress={doCheckIn}
          />
          {check.status === 'error' && <Text style={styles.err}>{errorText(check.error)}</Text>}
          {done === undefined && !open && <Text style={styles.small}>Check-in closes {formatEventDate(m.check_in_closes_at)}.</Text>}
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
            <Text style={[styles.status, { color: a.checked_in ? colors.green : colors.dim }]}>{a.checked_in ? 'Checked in' : 'Not yet'}</Text>
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
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, maxWidth: 160 },
  pickText: { color: colors.sub, fontFamily: fonts.medium, fontSize: 13, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  status: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
});
