/**
 * LEADERBOARDS — Top 10 squirrels (XP, zones held, distance) and Hostel vs Hostel
 * (score, territories, active members, distance). All from the campus backend.
 */
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { campusApi, type HostelBoard, type LeaderboardPeriod, type SquirrelBoard, type SquirrelRow } from '@/api/campus';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { EmptyNote, ErrorState, LoadingRows, SourceBadge } from '@/components/campus/States';
import { km, shortTime } from '@/components/campus/territoryUi';
import { Chips, Display, Header, Icon, Kicker, Screen, Segmented } from '@/components/ui';
import { useCampus, useConfig, useRealtime, useRefreshOnFocus } from '@/hooks/useCampus';
import { alpha, colors, fonts, radius } from '@/theme';

const BOARDS = ['Squirrels', 'Hostel vs Hostel'] as const;
const PERIODS = ['Daily', 'Weekly', 'All-time'] as const;
const PERIOD: Record<(typeof PERIODS)[number], LeaderboardPeriod> = { Daily: 'daily', Weekly: 'weekly', 'All-time': 'alltime' };
const MEDAL = [colors.gold, '#C9CED6', '#D08A4E'];

export default function Leaderboard() {
  const config = useConfig();
  const [board, setBoard] = useState<(typeof BOARDS)[number]>('Squirrels');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('Daily');
  const p = PERIOD[period];
  const squirrels = useCampus<SquirrelBoard>(`board:squirrels:${p}`, () => campusApi.squirrelBoard(p, 10), { enabled: board === 'Squirrels' });
  const hostels = useCampus<HostelBoard>(`board:hostels:${p}`, () => campusApi.hostelBoard(p), { enabled: board !== 'Squirrels' });
  const active = board === 'Squirrels' ? squirrels : hostels;
  useRefreshOnFocus(active.reload);
  // Ownership changes move territory counts: refresh on pushes, at most every 20 s.
  const lastPush = useRef(0);
  useRealtime((m) => {
    if (m.type !== 'territory.updated' || Date.now() - lastPush.current < 20_000) return;
    lastPush.current = Date.now();
    active.reload();
  });

  return (
    <Screen tabBar={false}>
      <Header back title="" right={<SourceBadge />} />
      <Kicker>Leaderboards · {config.data?.campus.short_name ?? 'Campus'}</Kicker>
      <Display size={40} style={{ marginTop: 4 }}>Who runs <Text style={{ color: colors.primary }}>campus</Text></Display>
      <Segmented items={BOARDS} value={board} onChange={setBoard} style={{ marginTop: 10 }} />
      <Chips items={PERIODS} value={period} onChange={setPeriod} />

      {active.signedOut ? (
        <EmptyNote icon="account-lock-outline" title="Sign in to see leaderboards" action="Sign in" onAction={() => router.push('/sign-in')} />
      ) : active.error && !active.data ? (
        <ErrorState cause={active.cause} onRetry={active.reload} />
      ) : !active.data ? (
        <LoadingRows rows={6} height={58} />
      ) : board === 'Squirrels' && squirrels.data ? (
        <Squirrels data={squirrels.data} />
      ) : hostels.data ? (
        <Hostels data={hostels.data} />
      ) : null}
    </Screen>
  );
}

function Squirrels({ data }: { data: SquirrelBoard }) {
  if (!data.entries.length) return <EmptyNote icon="trophy-outline" title="No one on the board yet" body="Move today to take the top spot." />;
  const meIn = data.me && data.entries.some((e) => e.user_id === data.me!.user_id);
  return (
    <View>
      <View style={styles.headRow}>
        <Text style={[styles.head, { flex: 1 }]}>Top 10</Text>
        <Text style={[styles.head, styles.colN]}>XP</Text>
        <Text style={[styles.head, styles.colN]}>Zones</Text>
        <Text style={[styles.head, styles.colN]}>Dist.</Text>
      </View>
      <FlatList scrollEnabled={false} data={data.entries} keyExtractor={(e) => e.user_id} contentContainerStyle={{ gap: 6 }} renderItem={({ item }) => <SquirrelLine r={item} me={item.user_id === data.me?.user_id} />} />
      {data.me && !meIn && (
        <>
          <Text style={styles.gap}>···</Text>
          <SquirrelLine r={data.me} me />
        </>
      )}
      <Text style={styles.fine}>Updated {shortTime(data.updated_at)}</Text>
    </View>
  );
}

function SquirrelLine({ r, me }: { r: SquirrelRow; me: boolean }) {
  return (
    <View style={[styles.row, me && styles.meRow]} accessibilityLabel={`Rank ${r.rank}, ${me ? 'you' : r.display_name}, ${r.xp} XP`}>
      <Text style={[styles.rank, r.rank <= 3 && { color: MEDAL[r.rank - 1] }]}>{String(r.rank).padStart(2, '0')}</Text>
      <PersonAvatar person={r} size={34} ring={r.rank === 1 ? colors.gold : undefined} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{me ? 'You' : r.display_name}</Text>
        {!!r.hostel && <Text style={styles.meta}>{r.hostel}</Text>}
      </View>
      <Text style={[styles.num, styles.colN, { color: colors.gold }]}>{r.xp.toLocaleString('en-IN')}</Text>
      <Text style={[styles.num, styles.colN]}>{r.zones_claimed}</Text>
      <Text style={[styles.num, styles.colN, { color: colors.dim }]}>{r.distance_m == null ? '—' : km(r.distance_m)}</Text>
    </View>
  );
}

function Hostels({ data }: { data: HostelBoard }) {
  if (!data.entries.length) return <EmptyNote icon="home-city-outline" title="No hostel scores yet" />;
  const top = Math.max(1, ...data.entries.map((e) => e.score));
  return (
    <View style={{ gap: 10 }}>
      {data.entries.map((h) => {
        const mine = h.hostel_id === data.my_hostel_id;
        return (
          <View key={h.hostel_id} style={[styles.hostel, mine && styles.meRow, h.rank === 1 && { borderColor: colors.gold }]} accessibilityLabel={`${h.name}, rank ${h.rank}, ${h.score} points`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={[styles.rank, h.rank <= 3 && { color: MEDAL[h.rank - 1] }]}>{String(h.rank).padStart(2, '0')}</Text>
              <Icon name="home-city" size={22} color={h.rank === 1 ? colors.gold : colors.text} />
              <Text style={styles.hostelName}>{h.name}</Text>
              {mine && <Text style={styles.yours}>Your hostel</Text>}
              <View style={{ flex: 1 }} />
              <Text style={styles.score}>{h.score.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.bar}>
              <View style={{ width: `${(h.score / top) * 100}%`, height: '100%', backgroundColor: h.rank === 1 ? colors.gold : mine ? colors.primary : colors.lineHi, borderRadius: 4 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Stat icon="flag-variant" v={`${h.territories}`} l="territories" />
              <Stat icon="run-fast" v={`${h.active_members}`} l="active" />
              <Stat icon="map-marker-distance" v={h.distance_m == null ? '—' : km(h.distance_m, 0)} l="moved" />
            </View>
          </View>
        );
      })}
      <Text style={styles.fine}>Score = the backend’s hostel formula (territory, activity, distance) · updated {shortTime(data.updated_at)}</Text>
    </View>
  );
}

function Stat({ icon, v, l }: { icon: React.ComponentProps<typeof Icon>['name']; v: string; l: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={13} color={colors.dim} />
      <Text style={styles.statV}>{v}</Text>
      <Text style={styles.meta}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 6 },
  head: { color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  colN: { width: 56, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 10 },
  meRow: { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.06) },
  rank: { color: colors.dim, fontFamily: fonts.display, fontSize: 18, width: 28 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10 },
  num: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 15 },
  gap: { color: colors.dim, textAlign: 'center', marginVertical: 4 },
  fine: { color: colors.mute, fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', marginTop: 12 },
  hostel: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: 14, gap: 10 },
  hostelName: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 20, letterSpacing: 0.8, textTransform: 'uppercase' },
  yours: { color: colors.primary, fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  score: { color: colors.text, fontFamily: fonts.display, fontSize: 24 },
  bar: { height: 8, backgroundColor: colors.bg2, borderRadius: 4, overflow: 'hidden' },
  statV: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 14 },
});
