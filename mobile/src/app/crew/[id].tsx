/**
 * CREW PROFILE — members, crew territories, upcoming events, join / leave. When the crew comes
 * from the Social service, members can vouch for each other (one vouch per member; members only).
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { campusApi, errorText, type CrewDetail } from '@/api/campus';
import { socialApi } from '@/api/social';
import { CrewJoinButton } from '@/components/campus/CrewJoin';
import { EventRow } from '@/components/campus/EventRow';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { ErrorState, LoadingRows } from '@/components/campus/States';
import { shortTime } from '@/components/campus/territoryUi';
import { Display, Icon, IconButton, PressScale, Scrim, SectionHeader, Tag } from '@/components/ui';
import { useCampus } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';
import { SoonPill } from '@/components/Locked';
import { isLocked } from '@/data/features';

export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const r = useCampus<CrewDetail>(`crew:${id}`, () => campusApi.crew(id));
  const crew = r.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/crews'));

  if (!crew) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 10, paddingHorizontal: 16 }}>
        <IconButton icon="chevron-left" size={26} onPress={back} label="Back" />
        <View style={{ marginTop: 16 }}>{r.error ? <ErrorState cause={r.cause} onRetry={r.reload} /> : <LoadingRows rows={4} height={80} />}</View>
      </View>
    );
  }
  const c = crew.color ?? colors.primary;
  // Social-service crews carry vouches per member and no territory.
  const vouching = !!crew.member_meta;
  const member = crew.my_membership != null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
      <View style={{ height: 230 + insets.top }}>
        <Scene kind="run" seed={crew.name.length} aspect={Math.min(width, MAX_WIDTH) / (230 + insets.top)} style={StyleSheet.absoluteFill} />
        <Scrim strong />
        <View style={[styles.top, { top: insets.top + 8 }]}>
          <IconButton icon="chevron-left" size={26} onPress={back} label="Back" />
          
        </View>
        <View style={styles.heroText}>
          <View style={[styles.badge, { backgroundColor: c }]}>
            <Icon name={(crew.icon as React.ComponentProps<typeof Icon>['name']) ?? 'account-group'} size={28} color={colors.onPrimary} />
          </View>
          <Display size={34} color={colors.onImage} style={{ marginTop: 10 }}>{crew.name}</Display>
          {!!crew.description && <Text style={styles.sub}>{crew.description}</Text>}
        </View>
      </View>
      <View style={styles.col}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tag label={`${crew.members_count} members`} icon="account-group" color={colors.secondary} />
          {!vouching && <Tag label={`${crew.territories_count} zones`} icon="flag-variant" />}
          {!!crew.meets && <Tag label={crew.meets} icon="calendar-clock" color={colors.green} />}
        </View>
        <View style={{ marginTop: 16 }}>
          <CrewJoinButton crew={crew} onChanged={() => r.reload()} />
        </View>

        <SectionHeader title="Members" />
        {vouching ? (
          <View style={{ gap: 8 }}>
            {crew.members.map((m) => (
              <MemberRow key={m.user_id} crewId={crew.id} person={m} meta={crew.member_meta![m.user_id]} canVouch={member} onChanged={() => r.reload()} />
            ))}
            {!crew.members.length && <Text style={styles.empty}>No members yet.</Text>}
            <Text style={styles.fine}>{member ? 'Vouch for crewmates you’ve actually met — it builds trust on campus.' : 'Join the crew to vouch for its members.'}</Text>
          </View>
        ) : crew.members.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {crew.members.map((m) => (
              <View key={m.user_id} style={{ alignItems: 'center', width: 64 }}>
                <PersonAvatar person={m} size={54} />
                <Text style={styles.member} numberOfLines={1}>{m.display_name.split(' ')[0]}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.empty}>No members yet.</Text>
        )}

        {!vouching && (
          <>
        <SectionHeader title="Crew territory" />
        {crew.territories.length ? (
          <View style={{ gap: 8 }}>
            {crew.territories.map((t) => (
              <PressScale key={t.zone_id} onPress={() => router.push({ pathname: '/zone/[id]', params: { id: t.zone_id } })} style={styles.row} scaleTo={0.98}>
                <View style={[styles.dot, { backgroundColor: c }]} />
                <Text style={styles.rowTitle}>{t.zone_name}</Text>
                <Text style={styles.meta}>since {shortTime(t.claimed_at)}</Text>
              </PressScale>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>The crew doesn’t hold any zones right now.</Text>
        )}
          </>
        )}

        <SectionHeader title="Upcoming" />
        {isLocked('events') ? (
          <SoonPill />
        ) : crew.upcoming_events.length ? (
          <View style={{ gap: 10 }}>
            {crew.upcoming_events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No upcoming events.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function MemberRow({ crewId, person, meta, canVouch, onChanged }: { crewId: string; person: CrewDetail['members'][number]; meta?: NonNullable<CrewDetail['member_meta']>[string]; canVouch: boolean; onChanged: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ vouches: number; mine: boolean } | null>(null);
  const vouches = state?.vouches ?? meta?.vouches ?? 0;
  const mine = state?.mine ?? meta?.vouched_by_me ?? false;
  const toggle = async () => {
    setBusy(true);
    try {
      const v = mine ? await socialApi.unvouch(crewId, person.user_id) : await socialApi.vouch(crewId, person.user_id);
      setState({ vouches: v.vouches, mine: v.vouched_by_me });
      if (v.vouched_by_me) toast(`You vouched for ${person.display_name.split(' ')[0]}`, 'shield-check', colors.primary);
      onChanged();
    } catch (e) {
      toast(errorText(e), 'alert-circle-outline', colors.coral);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.row}>
      <PersonAvatar person={person} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{meta?.is_me ? 'You' : person.display_name}</Text>
        <Text style={styles.meta}>{[meta?.role && meta.role !== 'member' ? meta.role : null, `${vouches} vouch${vouches === 1 ? '' : 'es'}`].filter(Boolean).join(' · ')}</Text>
      </View>
      {canVouch && !meta?.is_me && (
        <PressScale onPress={toggle} disabled={busy} style={[styles.vouch, mine && { backgroundColor: colors.primary, borderColor: colors.primary }]} scaleTo={0.95} accessibilityRole="button" accessibilityState={{ selected: mine, busy }} accessibilityLabel={mine ? `Remove your vouch for ${person.display_name}` : `Vouch for ${person.display_name}`}>
          <Icon name={mine ? 'shield-check' : 'shield-plus-outline'} size={15} color={mine ? colors.onPrimary : colors.primary} />
          <Text style={[styles.vouchText, mine && { color: colors.onPrimary }]}>{mine ? 'Vouched' : 'Vouch'}</Text>
        </PressScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vouch: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  vouchText: { color: colors.primary, fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  fine: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', marginTop: 14 },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  badge: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  sub: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 14 },
  member: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  empty: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13 },
});
