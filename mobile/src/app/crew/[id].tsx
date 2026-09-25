import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { Avatar } from '@/components/Avatar';
import { EventCard, SocialPost } from '@/components/cards';
import { Button, Display, EmptyState, Icon, IconButton, Scrim, SectionHeader, Tag } from '@/components/ui';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

export default function CrewDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { crews, joinedCrews, toggleCrew, events, joinedEvents, toggleEvent, posts } = useApp();
  const crew = crews.find((c) => c.id === id);
  if (!crew) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 40 }}>
        <EmptyState title="Crew not found" body="It may belong to another city. Switch city and try again." action="Back" onAction={() => router.back()} />
      </View>
    );
  }
  const joined = joinedCrews.has(crew.id);
  const crewEvents = events.filter((e) => e.scene === crew.scene || e.host.includes(crew.name.split(' ')[0])).slice(0, 3);
  const crewPosts = posts.filter((p) => p.crewName === crew.name || p.scene === crew.scene).slice(0, 2);
  const members = crew.memberIds.map(userById);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
      <View style={{ height: 260 + insets.top }}>
        <Scene kind={crew.scene} seed={crew.name.length} aspect={Math.min(width, MAX_WIDTH) / (260 + insets.top)} style={StyleSheet.absoluteFill} />
        <Scrim strong />
        <IconButton icon="chevron-left" size={26} onPress={() => router.back()} style={{ position: 'absolute', left: 16, top: insets.top + 8 }} label="Back" />
        <View style={styles.heroText}>
          <View style={[styles.badge, { backgroundColor: crew.color }]}>
            <Icon name={crew.icon} size={28} color={colors.onSecondary} />
          </View>
          <Display size={36} style={{ marginTop: 10 }}>{crew.name}</Display>
          <Text style={styles.sub}>{crew.tagline}</Text>
        </View>
      </View>
      <View style={styles.col}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tag label={`${crew.members.toLocaleString('en-IN')} members`} icon="account-group" color={colors.secondary} />
          <Tag label={crew.meets} icon="calendar-clock" />
          <Tag label={crew.scope} icon="map-marker-radius" color={colors.green} />
        </View>
        <Button label={joined ? 'Joined · Leave crew' : 'Join crew'} variant={joined ? 'secondary' : 'primary'} iconLeft={joined ? 'check' : 'account-plus'} onPress={() => toggleCrew(crew.id)} style={{ marginTop: 16 }} />

        <SectionHeader title="Members" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          {members.map((u) => (
            <View key={u.id} style={{ alignItems: 'center', width: 64 }}>
              <Avatar user={u} size={56} level={u.level} />
              <Text style={styles.member} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
            </View>
          ))}
        </ScrollView>

        {crewEvents.length > 0 && <SectionHeader title="Upcoming" />}
        <View style={{ gap: 10 }}>
          {crewEvents.map((e) => (
            <EventCard key={e.id} event={e} going={joinedEvents.has(e.id)} onToggle={() => toggleEvent(e.id)} />
          ))}
        </View>

        {crewPosts.length > 0 && <SectionHeader title="From the crew" />}
        {crewPosts.map((p) => (
          <SocialPost key={p.id} post={p} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', marginTop: 14 },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 14, maxWidth: MAX_WIDTH, alignSelf: 'center' },
  badge: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  sub: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14 },
  member: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 },
});
