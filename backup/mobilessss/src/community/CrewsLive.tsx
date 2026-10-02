/**
 * Crews on the Social service: find and join, a crew's members (member since, vouches) and its
 * upcoming events, and starting a crew. The demo screens in app/crews.tsx and app/crew/[id].tsx
 * render instead when there is no signed-in Social session.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mascot } from '@/art/Mascot';
import { Scene } from '@/art/Scene';
import { crewsApi, type CrewDetail, type CrewMember, type Interest } from '@/api/community';
import { socialErrorText } from '@/api/social';
import { invalidateRemote, useRemote } from '@/api/useRemote';
import { Avatar } from '@/components/Avatar';
import { CrewCard, EventCard } from '@/components/cards';
import { BlockSkeleton, SocialError, toAvatarUser } from '@/components/socialParts';
import { Button, Chips, Display, EmptyState, FadeIn, Header, Icon, IconButton, PressScale, Scrim, Screen, SearchBar, SectionHeader, Segmented, Tag } from '@/components/ui';
import { crewCard, eventCard, INTEREST_ICONS, INTEREST_LOOK, INTERESTS, memberSince } from '@/community/look';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

const TABS = ['All crews', 'My crews'] as const;

export function LiveCrews() {
  const { toast } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>('All crews');
  const [q, setQ] = useState('');
  const mine = tab === 'My crews';
  const term = q.trim();
  const list = useRemote(`crews:${mine}:${term}`, () => crewsApi.list({ mine, q: term || undefined }));

  const toggle = async (crewId: string, joined: boolean) => {
    try {
      if (joined) await crewsApi.leave(crewId);
      else await crewsApi.join(crewId);
      invalidateRemote('crew');
      list.reload();
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle', colors.secondary);
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title="Find Your Crew" right={<IconButton icon="plus" onPress={() => router.push('/crew/new')} label="Start a crew" />} />
      <View style={{ marginTop: 10 }}>
        <SearchBar placeholder="Search crews (running, yoga, cycling...)" value={q} onChangeText={setQ} />
      </View>
      <Segmented items={TABS} value={tab} onChange={setTab} />
      {list.error && !list.data ? <SocialError error={new Error(list.error)} onRetry={list.reload} /> : null}
      {!list.data && list.loading ? <BlockSkeleton height={220} /> : null}
      <View style={{ gap: 10 }}>
        {(list.data?.items ?? []).map((c, i) => {
          const { crew, members } = crewCard(c);
          return (
            <FadeIn key={c.id} index={i}>
              <CrewCard crew={crew} members={members} joined={c.is_member} onToggle={() => toggle(c.id, c.is_member)} />
            </FadeIn>
          );
        })}
      </View>
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          art={<Mascot pose="sit" size={120} />}
          title={mine ? "You're not in a crew yet" : term ? 'No crews found' : 'No crews yet'}
          body={mine ? 'Join one, or start your own and bring your people.' : term ? `Nothing matches “${term}”.` : 'Be the first: start a crew for your hostel, your pace, your sport.'}
          action="Start a crew"
          onAction={() => router.push('/crew/new')}
        />
      )}
    </Screen>
  );
}

export function LiveCrewDetail({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { toast } = useApp();
  const crew = useRemote(`crew:${id}`, () => crewsApi.get(id));
  const [busy, setBusy] = useState(false);

  if (!crew.data) {
    return (
      <Screen tabBar={false}>
        <Header back title="Crew" />
        {crew.error ? <SocialError error={new Error(crew.error)} onRetry={crew.reload} /> : <BlockSkeleton height={300} />}
      </Screen>
    );
  }
  const c: CrewDetail = crew.data;
  const look = INTEREST_LOOK[c.interest] ?? INTEREST_LOOK.other;

  const joinOrLeave = async () => {
    setBusy(true);
    try {
      if (c.is_member) {
        await crewsApi.leave(c.id);
        toast(`You left ${c.name}`, 'exit-run', colors.dim);
      } else {
        await crewsApi.join(c.id);
        toast(`Welcome to ${c.name}!`, 'account-group', colors.primary);
      }
      invalidateRemote('crew');
      crew.reload();
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle', colors.secondary);
    } finally {
      setBusy(false);
    }
  };

  const vouch = async (m: CrewMember) => {
    try {
      if (m.vouched_by_me) await crewsApi.unvouch(c.id, m.user.id);
      else await crewsApi.vouch(c.id, m.user.id);
      crew.reload();
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle', colors.secondary);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
      <View style={{ height: 250 + insets.top }}>
        <Scene kind={look.scene} seed={c.name.length} aspect={Math.min(width, MAX_WIDTH) / (250 + insets.top)} style={StyleSheet.absoluteFill} />
        <Scrim strong />
        <IconButton icon="chevron-left" size={26} onPress={() => router.back()} style={{ position: 'absolute', left: 16, top: insets.top + 8 }} label="Back" />
        <View style={styles.heroText}>
          <View style={[styles.badge, { backgroundColor: look.color }]}>
            <Icon name={look.icon} size={28} color={colors.onSecondary} />
          </View>
          <Display size={34} color={colors.onImage} style={{ marginTop: 10 }}>{c.name}</Display>
          {!!c.tagline && <Text style={styles.sub}>{c.tagline}</Text>}
        </View>
      </View>
      <View style={styles.col}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tag label={`${c.members_count} member${c.members_count === 1 ? '' : 's'}`} icon="account-group" color={colors.secondary} />
          {!!c.meets && <Tag label={c.meets} icon="calendar-clock" />}
          <Tag label={c.hostel ?? (c.scope === 'online' ? 'Online' : 'Campus')} icon="map-marker-radius" color={colors.green} />
        </View>
        {c.member_since && <Text style={styles.since}>{memberSince(c.member_since)}{c.my_role === 'owner' ? ' · you run this crew' : ''}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button label={c.is_member ? 'Leave crew' : 'Join crew'} variant={c.is_member ? 'secondary' : 'primary'} iconLeft={c.is_member ? 'exit-run' : 'account-plus'} onPress={joinOrLeave} disabled={busy} style={{ flex: 1 }} />
          {c.is_member && (
            <Button label="Plan a meetup" variant="secondary" iconLeft="calendar-plus" onPress={() => router.push({ pathname: '/event/new', params: { crew: c.id } })} style={{ flex: 1 }} />
          )}
        </View>

        {c.upcoming_events.length > 0 && <SectionHeader title="Upcoming" />}
        <View style={{ gap: 10 }}>
          {c.upcoming_events.map((e) => {
            const card = eventCard(e);
            return <EventCard key={e.id} event={card.event} attendees={card.attendees} going={e.my_rsvp === 'going'} onToggle={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })} />;
          })}
        </View>

        <SectionHeader title="Members" />
        <Text style={styles.hint}>Vouch for people you&apos;ve trained with: it shows on their profile.</Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {c.members.map((m) => (
            <View key={m.user.id} style={styles.member}>
              <Avatar user={toAvatarUser(m.user, m.is_me)} size={42} level={m.user.level} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{m.is_me ? 'You' : m.user.display_name}{m.role === 'owner' ? ' · owner' : ''}</Text>
                <Text style={styles.meta}>{memberSince(m.member_since)}{m.vouches ? ` · vouched by ${m.vouches}` : ''}</Text>
              </View>
              {c.is_member && !m.is_me && (
                <PressScale onPress={() => vouch(m)} style={[styles.vouch, m.vouched_by_me && styles.vouched]} accessibilityLabel={m.vouched_by_me ? 'Take back your vouch' : `Vouch for ${m.user.display_name}`}>
                  <Icon name={m.vouched_by_me ? 'shield-check' : 'shield-outline'} size={16} color={m.vouched_by_me ? colors.onPrimary : colors.primary} />
                  <Text style={[styles.vouchText, m.vouched_by_me && { color: colors.onPrimary }]}>{m.vouched_by_me ? 'Vouched' : 'Vouch'}</Text>
                </PressScale>
              )}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

export function NewCrewForm() {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [meets, setMeets] = useState('');
  const [interest, setInterest] = useState<Interest>('running');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (name.trim().length < 3) {
      toast('Give the crew a name (3+ characters).', 'alert-circle', colors.secondary);
      return;
    }
    setBusy(true);
    try {
      const crew = await crewsApi.create({ name: name.trim(), tagline: tagline.trim(), meets: meets.trim(), interest });
      invalidateRemote('crew');
      toast(`${crew.name} is live!`, 'account-group', colors.primary);
      router.replace({ pathname: '/crew/[id]', params: { id: crew.id } });
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle', colors.secondary);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title="Start a crew" />
      <View style={{ gap: 12, marginTop: 12 }}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Crew name (e.g. Hostel 3 Night Runners)" placeholderTextColor={colors.mute} maxLength={40} />
        <TextInput style={styles.input} value={tagline} onChangeText={setTagline} placeholder="One line about it (optional)" placeholderTextColor={colors.mute} maxLength={120} />
        <TextInput style={styles.input} value={meets} onChangeText={setMeets} placeholder="When you meet (e.g. Mon & Thu · 6 AM)" placeholderTextColor={colors.mute} maxLength={60} />
        <Text style={styles.label}>What you do</Text>
        <Chips items={INTERESTS} value={interest} onChange={setInterest} icons={INTEREST_ICONS} />
        <Button label={busy ? 'Starting…' : 'Start crew'} icon="arrow-right" onPress={create} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', marginTop: 14 },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  badge: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  sub: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 14 },
  since: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, marginTop: 10 },
  hint: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  vouch: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6 },
  vouched: { backgroundColor: colors.primary },
  vouchText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 12 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  label: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, marginTop: 4 },
});
