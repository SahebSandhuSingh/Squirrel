import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { EventCard } from '@/components/cards';
import { CityChip } from '@/components/TopBar';
import { EmptyState, FadeIn, Header, IconButton, Screen, Segmented } from '@/components/ui';
import { allEvents } from '@/data/community';
import { useApp } from '@/state/AppState';
import { colors, fonts } from '@/theme';

const TABS = ['Nearby', 'Online', 'My Events'] as const;
type Tab = (typeof TABS)[number];

/** EVENTS — nearby, online and joined. */
export default function Events() {
  const { events, joinedEvents, toggleEvent, city, toast } = useApp();
  const [tab, setTab] = useState<Tab>('Nearby');
  // Joined events stay listed after switching city, so they can still be opened or left.
  const everywhere = useMemo(() => (tab === 'My Events' ? allEvents() : []), [tab]);
  const list = (tab === 'My Events' ? everywhere : events)
    .filter((e) => (tab === 'My Events' ? joinedEvents.has(e.id) : tab === 'Online' ? e.online : !e.online))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <Screen tabBar={false}>
      <Header
        back
        title="Events"
        right={
          <>
            <CityChip />
            <IconButton icon="plus" onPress={() => { toast('Hosting opens at Level 15 · keep moving!', 'lock-clock', colors.violet); }} label="Host event" />
          </>
        }
      />
      <Segmented items={TABS} value={tab} onChange={setTab} />
      {tab !== 'My Events' && (
        <Text style={styles.count}>
          {list.length} {tab === 'Online' ? 'online sessions' : `events in ${city.name}`} this week
        </Text>
      )}

      <View style={{ gap: 10 }}>
        {list.map((e, i) => (
          <FadeIn key={e.id} index={i}>
            <EventCard event={e} going={joinedEvents.has(e.id)} onToggle={() => toggleEvent(e.id)} />
          </FadeIn>
        ))}
      </View>

      {list.length === 0 && (
        <EmptyState
          art={<Mascot pose="sleep" size={150} />}
          title="No plans yet"
          body="Join an event and it will show up here, with a reminder before it starts."
          action="Browse nearby"
          onAction={() => setTab('Nearby')}
        />
      )}
      {tab === 'My Events' && list.length > 0 && (
        <Text style={[styles.count, { textAlign: 'center', marginTop: 14 }]} onPress={() => router.push('/explore')}>
          Find more on the Explore map →
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, marginBottom: 10 },
});
