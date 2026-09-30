/**
 * Events on the Social service: upcoming and mine, an event's page (RSVP, check in and tell
 * friends, cancel when hosting) and planning one (open to all, or for a crew). Also the meetup
 * check-in anywhere ("I'm here"). The demo screens render instead without a Social session.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/art/Mascot';
import { Scene } from '@/art/Scene';
import { crewsApi, eventsApi, type EventOut, type Interest, type UserSummary } from '@/api/community';
import { followApi, socialErrorText } from '@/api/social';
import { invalidateRemote, useRemote } from '@/api/useRemote';
import { Avatar } from '@/components/Avatar';
import { EventCard } from '@/components/cards';
import { BlockSkeleton, confirmAction, SocialError, toAvatarUser } from '@/components/socialParts';
import { Button, Card, Chips, Display, EmptyState, FadeIn, Header, Icon, IconButton, PressScale, Scrim, Screen, SectionHeader, Segmented } from '@/components/ui';
import { eventCard, INTEREST_ICONS, INTEREST_LOOK, INTERESTS } from '@/community/look';
import { formatEventDate } from '@/data/community';
import { useMyProfile } from '@/hooks/useSocial';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

const TABS = ['Upcoming', 'My events'] as const;

export function LiveEvents() {
  const { toast } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Upcoming');
  const scope = tab === 'Upcoming' ? 'upcoming' : 'mine';
  const list = useRemote(`events:${scope}`, () => eventsApi.list(scope));

  const toggle = async (e: EventOut) => {
    try {
      if (e.my_rsvp === 'going') await eventsApi.unrsvp(e.id);
      else await eventsApi.rsvp(e.id, 'going');
      invalidateRemote('event');
      list.reload();
    } catch (err) {
      toast(socialErrorText(err), 'alert-circle', colors.secondary);
    }
  };

  return (
    <Screen tabBar={false}>
      <Header
        back
        title="Events"
        right={
          <>
            <IconButton icon="map-marker-check" onPress={() => router.push('/checkin')} label="Check in at a meetup" />
            <IconButton icon="plus" onPress={() => router.push('/event/new')} label="Plan an event" />
          </>
        }
      />
      <Segmented items={TABS} value={tab} onChange={setTab} />
      {list.error && !list.data ? <SocialError error={new Error(list.error)} onRetry={list.reload} /> : null}
      {!list.data && list.loading ? <BlockSkeleton height={240} /> : null}
      <View style={{ gap: 10 }}>
        {(list.data?.items ?? []).map((e, i) => {
          const card = eventCard(e);
          return (
            <FadeIn key={e.id} index={i}>
              <EventCard event={card.event} attendees={card.attendees} going={e.my_rsvp === 'going'} onToggle={() => toggle(e)} />
            </FadeIn>
          );
        })}
      </View>
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          art={<Mascot pose="sleep" size={150} />}
          title={tab === 'Upcoming' ? 'Nothing planned yet' : 'No plans yet'}
          body={tab === 'Upcoming' ? 'Plan the first run, walk or workout and everyone can join.' : "Join an event and it shows up here, with a reminder an hour before."}
          action="Plan an event"
          onAction={() => router.push('/event/new')}
        />
      )}
    </Screen>
  );
}

export function LiveEventDetail({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { toast } = useApp();
  const event = useRemote(`event:${id}`, () => eventsApi.get(id));
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const myId = useMyProfileId();
  // When the page opened: check-in opens an hour before the start (the server checks it too).
  const [now] = useState(() => Date.now());

  if (!event.data) {
    return (
      <Screen tabBar={false}>
        <Header back title="Event" />
        {event.error ? <SocialError error={new Error(event.error)} onRetry={event.reload} /> : <BlockSkeleton height={300} />}
      </Screen>
    );
  }
  const e = event.data;
  const look = INTEREST_LOOK[e.kind] ?? INTEREST_LOOK.other;
  const going = e.my_rsvp === 'going';
  const starts = new Date(e.starts_at).getTime();
  const checkInOpen = !e.cancelled && now >= starts - 3600_000 && now <= (e.ends_at ? new Date(e.ends_at).getTime() : starts) + 6 * 3600_000;
  const iHost = e.host.id === myId;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done, 'check-circle', colors.primary);
      invalidateRemote('event');
      event.reload();
    } catch (err) {
      toast(socialErrorText(err), 'alert-circle', colors.secondary);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={{ height: 280 + insets.top }}>
          <Scene kind={look.scene} seed={e.title.length} aspect={Math.min(width, MAX_WIDTH) / (280 + insets.top)} style={StyleSheet.absoluteFill} />
          <Scrim strong />
          <IconButton icon="chevron-left" size={26} onPress={() => router.back()} style={{ position: 'absolute', left: 16, top: insets.top + 8 }} label="Back" />
          <View style={styles.heroText}>
            {e.cancelled && <Text style={styles.cancelled}>CANCELLED</Text>}
            <Display size={36} color={colors.onImage}>{e.title}</Display>
            <Text style={styles.host}>{e.crew ? `${e.crew.name} · ` : ''}Hosted by {e.host.display_name}</Text>
          </View>
        </View>

        <View style={styles.col}>
          <Card>
            <Row icon="calendar-clock" title={formatEventDate(e.starts_at)} sub={e.ends_at ? `Until ${formatEventDate(e.ends_at)}` : 'Reminder an hour before'} />
            <View style={styles.divider} />
            <Row icon={e.online ? 'video-outline' : 'map-marker-outline'} title={e.online ? 'Online' : e.venue || 'Place to be announced'} sub={e.capacity ? `${e.going_count} of ${e.capacity} places taken` : `${e.going_count} going`} />
          </Card>

          {!!e.description && (
            <>
              <SectionHeader title="About" />
              <Text style={styles.body}>{e.description}</Text>
            </>
          )}

          <SectionHeader title={`Going · ${e.going_count}`} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {e.attendees.map((u) => (
              <Avatar key={u.id} user={toAvatarUser(u)} size={44} level={u.level} />
            ))}
          </View>

          {going && checkInOpen && !e.checked_in && (
            <Card style={{ marginTop: 18 }}>
              <Text style={styles.rowTitle}>You made it?</Text>
              <Text style={styles.rowSub}>Check in, and tell a friend you&apos;re there.</Text>
              <Button label="Check in" iconLeft="map-marker-check" onPress={() => setPicking(true)} style={{ marginTop: 12 }} disabled={busy} />
            </Card>
          )}
          {e.checked_in && <Text style={[styles.rowSub, { marginTop: 16 }]}>✓ You checked in.</Text>}
          {iHost && !e.cancelled && (
            <Button
              label="Cancel event"
              variant="secondary"
              iconLeft="calendar-remove"
              style={{ marginTop: 18 }}
              disabled={busy}
              onPress={async () => {
                if (await confirmAction('Cancel this event?', 'Everyone going will be told.', 'Cancel event')) run(() => eventsApi.cancel(e.id), 'Event cancelled');
              }}
            />
          )}
        </View>
      </ScrollView>

      {!e.cancelled && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button
            label={going ? "You're going ✓ · tap to drop out" : 'Join event'}
            variant={going ? 'secondary' : 'primary'}
            disabled={busy || iHost}
            onPress={() => run(() => (going ? eventsApi.unrsvp(e.id) : eventsApi.rsvp(e.id, 'going')), going ? undefined : "You're going! We'll remind you.")}
            style={{ width: '100%', maxWidth: MAX_WIDTH - 32, alignSelf: 'center' }}
          />
        </View>
      )}
      {picking && (
        <FriendPicker
          title="Tell friends you're here"
          onCancel={() => setPicking(false)}
          onDone={(ids) => {
            setPicking(false);
            run(async () => {
              const c = await eventsApi.checkIn(e.id, ids);
              toast(c.notified ? `Checked in · told ${c.notified} friend${c.notified === 1 ? '' : 's'}` : 'Checked in', 'map-marker-check', colors.primary);
            });
          }}
        />
      )}
    </View>
  );
}

function useMyProfileId(): string | undefined {
  return useMyProfile().data?.user.id;
}

/** Who may be told about my check-in: my followers and my crewmates (the server checks it too). */
async function friendsOf(me: string): Promise<UserSummary[]> {
  const [followers, crews] = await Promise.all([followApi.followers(me), crewsApi.list({ mine: true })]);
  const details = await Promise.all(crews.items.slice(0, 5).map((c) => crewsApi.get(c.id).catch(() => null)));
  const all = new Map<string, UserSummary>();
  for (const f of followers.items) all.set(f.id, f);
  for (const d of details) for (const m of d?.members ?? []) if (!m.is_me) all.set(m.user.id, m.user);
  return [...all.values()];
}

/** Pick up to 5 friends (followers or crewmates) to tell about your check-in. */
export function FriendPicker({ title, onDone, onCancel }: { title: string; onDone: (ids: string[]) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const me = useMyProfileId();
  const friends = useRemote(me ? `friends:${me}` : null, () => friendsOf(me as string));
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (f: UserSummary) =>
    setChosen((c) => (c.includes(f.id) ? c.filter((x) => x !== f.id) : c.length >= 5 ? c : [...c, f.id]));
  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowSub}>Your followers and crewmates. Up to 5.</Text>
      <ScrollView style={{ maxHeight: 280, marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
        {(friends.data ?? []).map((f) => (
          <PressScale key={f.id} onPress={() => toggle(f)} style={[styles.pick, chosen.includes(f.id) && styles.picked]}>
            <Avatar user={toAvatarUser(f)} size={34} link={false} />
            <Text style={[styles.rowTitle, { flex: 1, fontSize: 14 }]} numberOfLines={1}>{f.display_name}</Text>
            <Icon name={chosen.includes(f.id) ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={22} color={colors.primary} />
          </PressScale>
        ))}
        {friends.data && friends.data.length === 0 && <Text style={styles.rowSub}>No followers or crewmates yet: you can still check in.</Text>}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Button label="Cancel" variant="secondary" size="md" onPress={onCancel} style={{ flex: 1 }} />
        <Button label={chosen.length ? `Check in · tell ${chosen.length}` : 'Check in'} size="md" onPress={() => onDone(chosen)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** "I'm here" at any meetup spot, telling chosen friends. */
export function MeetupCheckIn() {
  const { toast } = useApp();
  const [place, setPlace] = useState('');
  const [picking, setPicking] = useState(false);
  return (
    <Screen tabBar={false}>
      <Header back title="Check in" />
      <Text style={[styles.body, { marginTop: 10 }]}>Meeting someone for a run or a workout? Check in when you get there and your friends will know you&apos;ve arrived.</Text>
      <TextInput style={[styles.input, { marginTop: 14 }]} value={place} onChangeText={setPlace} placeholder="Where are you? (e.g. Main gate, Lake path)" placeholderTextColor={colors.mute} maxLength={80} />
      <Button label="Choose who to tell" icon="arrow-right" disabled={place.trim().length < 2} onPress={() => setPicking(true)} style={{ marginTop: 14 }} />
      {picking && (
        <FriendPicker
          title={`At ${place.trim()}`}
          onCancel={() => setPicking(false)}
          onDone={async (ids) => {
            setPicking(false);
            try {
              const c = await eventsApi.meetupCheckIn(place.trim(), ids);
              toast(c.notified ? `Checked in · told ${c.notified} friend${c.notified === 1 ? '' : 's'}` : 'Checked in', 'map-marker-check', colors.primary);
              router.back();
            } catch (e) {
              toast(socialErrorText(e), 'alert-circle', colors.secondary);
            }
          }}
        />
      )}
    </Screen>
  );
}

const DAYS = ['Today', 'Tomorrow', 'In 2 days', 'In 3 days', 'In 4 days', 'In 5 days', 'In 6 days'] as const;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function NewEventForm({ crewId }: { crewId?: string }) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Interest>('running');
  const [day, setDay] = useState<(typeof DAYS)[number]>('Tomorrow');
  const [time, setTime] = useState('06:00');
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const m = TIME_RE.exec(time.trim());
    if (title.trim().length < 3) return toast('Give it a title (3+ characters).', 'alert-circle', colors.secondary);
    if (!m) return toast('Time as HH:MM, e.g. 06:30.', 'alert-circle', colors.secondary);
    const start = new Date();
    start.setDate(start.getDate() + DAYS.indexOf(day));
    start.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (start.getTime() < Date.now()) return toast('That time has passed: pick a later one.', 'alert-circle', colors.secondary);
    const cap = capacity.trim() ? Number(capacity) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap < 2)) return toast('Places: a whole number, 2 or more.', 'alert-circle', colors.secondary);
    setBusy(true);
    try {
      const e = await eventsApi.create({
        title: title.trim(), kind, venue: venue.trim(), description: description.trim(),
        starts_at: start.toISOString(), capacity: cap, crew_id: crewId ?? null,
      });
      invalidateRemote('event');
      invalidateRemote('crew');
      toast('Event planned!', 'calendar-check', colors.primary);
      router.replace({ pathname: '/event/[id]', params: { id: e.id } });
    } catch (err) {
      toast(socialErrorText(err), 'alert-circle', colors.secondary);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title={crewId ? 'Plan a crew meetup' : 'Plan an event'} />
      <View style={{ gap: 12, marginTop: 12 }}>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What's happening? (e.g. Sunday 5K)" placeholderTextColor={colors.mute} maxLength={80} />
        <TextInput style={styles.input} value={venue} onChangeText={setVenue} placeholder="Where to meet (e.g. Main gate)" placeholderTextColor={colors.mute} maxLength={80} />
        <Text style={styles.label}>When</Text>
        <Chips items={DAYS} value={day} onChange={setDay} />
        <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="06:00" placeholderTextColor={colors.mute} maxLength={5} keyboardType="numbers-and-punctuation" accessibilityLabel="Start time, HH:MM" />
        <Text style={styles.label}>What kind</Text>
        <Chips items={INTERESTS} value={kind} onChange={setKind} icons={INTEREST_ICONS} />
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} placeholder="Details: pace, distance, what to bring (optional)" placeholderTextColor={colors.mute} maxLength={500} multiline />
        <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} placeholder="Max people (optional)" placeholderTextColor={colors.mute} keyboardType="number-pad" maxLength={4} />
        <Button label={busy ? 'Planning…' : 'Plan it'} icon="arrow-right" onPress={create} disabled={busy} />
      </View>
    </Screen>
  );
}

function Row({ icon, title, sub }: { icon: React.ComponentProps<typeof Icon>['name']; title: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  cancelled: { color: colors.secondary, fontFamily: fonts.black, fontSize: 12, letterSpacing: 1.5, marginBottom: 4 },
  host: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 14 },
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', marginTop: 16 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(215,255,31,0.12)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  rowSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  body: { color: colors.sub, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(17,17,19,0.97)', borderTopWidth: 1, borderTopColor: colors.line },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  picked: { borderColor: colors.primary, backgroundColor: 'rgba(215,255,31,0.08)' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  label: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, marginTop: 4 },
});
