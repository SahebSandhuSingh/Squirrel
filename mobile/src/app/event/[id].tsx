import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { CityMap } from '@/art/CityMap';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { Button, Card, Display, EmptyState, Icon, IconButton, Scrim, SectionHeader } from '@/components/ui';
import { eventsForCity, formatEventDate } from '@/data/community';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { events, joinedEvents, toggleEvent, city, toast } = useApp();
  // Online events are shared across cities; fall back to looking them up by id.
  const event = events.find((e) => e.id === id) ?? eventsForCity(city.id).find((e) => e.id === id);
  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 40 }}>
        <EmptyState title="Event not found" body="It may be in another city. Switch city and try again." action="Back" onAction={() => router.back()} />
      </View>
    );
  }
  const going = joinedEvents.has(event.id);
  const attendees = event.attendeeIds.map(userById);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={{ height: 300 + insets.top }}>
          <Scene kind={event.scene} seed={event.title.length} aspect={Math.min(width, MAX_WIDTH) / (300 + insets.top)} style={StyleSheet.absoluteFill} />
          <Scrim strong />
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <IconButton icon="chevron-left" size={26} onPress={() => router.back()} label="Back" />
            <IconButton icon="share-variant-outline" onPress={() => toast('Event link copied', 'link-variant', colors.secondary)} label="Share" />
          </View>
          <View style={styles.heroText}>
            <View style={styles.xp}>
              <Icon name="star-four-points" size={13} color={colors.gold} />
              <Text style={styles.xpText}>+{event.xp} XP on check-in</Text>
            </View>
            <Display size={40} color={colors.onImage}>{event.title}</Display>
            <Text style={styles.host}>Hosted by {event.host}</Text>
          </View>
        </View>

        <View style={styles.col}>
          <Card>
            <Row icon="calendar-clock" title={formatEventDate(event.startsAt)} sub="Add to calendar" />
            <View style={styles.divider} />
            <Row icon={event.online ? 'video-outline' : 'map-marker-outline'} title={event.venue} sub={event.online ? 'Link unlocks 15 min before' : `${city.name} · 2.4 km away`} />
          </Card>

          <SectionHeader title="About" />
          <Text style={styles.body}>{event.description}</Text>

          <SectionHeader title={`Going · ${event.going + (going ? 1 : 0)}`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {attendees.map((u) => (
                <Avatar key={u.id} user={u} size={48} />
              ))}
            </View>
            <AvatarStack users={attendees.slice(0, 2)} extra={event.going - attendees.length + (going ? 1 : 0)} size={24} />
          </View>

          {!event.online && (
            <>
              <SectionHeader title="Meeting point" />
              <View style={styles.map}>
                <CityMap seed={event.title.length} route style={StyleSheet.absoluteFill} />
                <View style={styles.pin}>
                  <Icon name={event.icon} size={18} color={colors.onPrimary} />
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={going ? "You're going ✓" : 'Join event'} variant={going ? 'secondary' : 'primary'} onPress={() => toggleEvent(event.id)} style={{ width: '100%', maxWidth: MAX_WIDTH - 32, alignSelf: 'center' }} />
      </View>
    </View>
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
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  xp: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(10,10,10,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, marginBottom: 6 },
  xpText: { color: colors.gold, fontFamily: fonts.bold, fontSize: 12 },
  host: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 14 },
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', marginTop: 16 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(47,91,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  rowSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  body: { color: colors.sub, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  map: { height: 180, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  pin: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: colors.line },
});
