import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button, Display, FadeIn, Header, Icon, Kicker, Screen, Segmented } from '@/components/ui';
import { formatArea, isMyEntry, leaderboardApi, shortUserId, type LeaderboardEntry, type LeaderboardPage, type LeaderboardWindow } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { territoryBoard } from '@/data/territory';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Daily', 'Weekly', 'All-time'] as const;
const WINDOW: Record<(typeof TABS)[number], LeaderboardWindow> = { Daily: 'daily', Weekly: 'weekly', 'All-time': 'alltime' };
const DEMO: Record<LeaderboardWindow, keyof typeof territoryBoard> = { daily: 'daily', weekly: 'weekly', alltime: 'all_time' };

type Row = { key: string; rank: number; name: string; areaText: string; userId?: string; me?: boolean; live?: boolean };

const demoRows = (w: LeaderboardWindow): Row[] =>
  territoryBoard[DEMO[w]].map((r, i) => ({ key: r.userId, rank: i + 1, name: r.name, areaText: `${r.km2.toFixed(1)} km²`, userId: r.userId, me: r.me }));

type Me = LeaderboardPage['me'];

const liveRow = (e: LeaderboardEntry, mine: boolean): Row => ({
  key: e.user_id,
  rank: e.rank,
  name: mine ? 'You' : shortUserId(e.user_id),
  areaText: formatArea(e.score),
  me: mine,
  live: true,
});

const pinnedMeRow = (me: NonNullable<Me>): Row => ({ key: 'me', rank: me.rank, name: 'You', areaText: formatArea(me.score), me: true, live: true });

/** City leaderboard ranked by territory area (GET /v1/leaderboard?scope=global&metric=area&window=…). */
export default function Leaderboard() {
  const { city, me } = useApp();
  const { mode, userId } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Weekly');
  // Live results are kept per window; anything else shows the sample rows for that window.
  type Live = { window: LeaderboardWindow; rows: Row[]; meRow: Row | null; cursor: string | null; pageMe: Me };
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<LeaderboardWindow | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const w = WINDOW[tab];
  const liveHere = live?.window === w ? live : null;
  const rows = liveHere ? liveHere.rows : demoRows(w);
  const meRow = liveHere?.meRow ?? null;
  const cursor = liveHere?.cursor ?? null;
  const source: 'demo' | 'live' | 'error' = mode !== 'live' ? 'demo' : liveHere ? 'live' : error === w ? 'error' : 'demo';
  const loading = mode === 'live' && !liveHere && error !== w;

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    leaderboardApi
      .get(w)
      .then((page) => {
        if (cancelled) return;
        const mine = page.entries.map((e) => isMyEntry(e, userId, page.me));
        setLive({
          window: w,
          rows: page.entries.map((e, i) => liveRow(e, mine[i])),
          meRow: page.me && !mine.some(Boolean) ? pinnedMeRow(page.me) : null,
          cursor: page.next_cursor,
          pageMe: page.me,
        });
      })
      .catch(() => !cancelled && setError(w));
    return () => {
      cancelled = true;
    };
  }, [w, mode, userId]);

  const loadMore = async () => {
    if (!liveHere?.cursor) return;
    setLoadingMore(true);
    try {
      const page = await leaderboardApi.get(w, liveHere.cursor);
      const mine = page.entries.map((e) => isMyEntry(e, userId, liveHere.pageMe));
      setLive((cur) =>
        cur && cur.window === w
          ? { ...cur, rows: [...cur.rows, ...page.entries.map((e, i) => liveRow(e, mine[i]))], meRow: mine.some(Boolean) ? null : cur.meRow, cursor: page.next_cursor }
          : cur,
      );
    } catch {
      setError(w);
    } finally {
      setLoadingMore(false);
    }
  };

  const renderRow = (r: Row, i: number) => {
    const u = r.me ? me : !r.live && r.userId ? userById(r.userId) : undefined;
    const top = r.rank === 1;
    return (
      <FadeIn key={`${tab}-${r.key}`} index={i}>
        <View style={[styles.row, r.me && styles.me, top && { borderColor: colors.primary }]}>
          <Text style={[styles.rank, top && { color: colors.primary }]}>{String(r.rank).padStart(2, '0')}</Text>
          {u ? (
            <Avatar user={u} size={38} ring={top ? colors.primary : colors.lineHi} />
          ) : (
            <View style={styles.anon}>
              <Icon name="run-fast" size={18} color={colors.dim} />
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>{r.me ? 'You' : r.name}</Text>
          <Text style={styles.area}>{r.areaText}</Text>
        </View>
      </FadeIn>
    );
  };

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <Kicker>{source === 'live' ? 'Global' : city.name} · ranked by territory</Kicker>
      <Display size={46} style={{ marginTop: 6 }}>Who owns <Text style={{ color: colors.primary }}>the city</Text></Display>
      <Segmented items={TABS} value={tab} onChange={setTab} />
      <Text style={styles.source}>
        {source === 'live' ? 'Live from the server' : source === 'error' ? 'Server unreachable · showing sample data' : 'Sample data · sign in for live rankings'}
      </Text>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginBottom: 10 }} /> : null}
      <View style={{ gap: 8 }}>{rows.map(renderRow)}</View>

      {meRow && (
        <>
          <Text style={styles.gap}>···</Text>
          {renderRow(meRow, rows.length)}
        </>
      )}

      {source === 'live' && cursor && (
        <Button label={loadingMore ? 'Loading…' : 'Load more'} variant="secondary" size="md" disabled={loadingMore} onPress={loadMore} style={{ marginTop: 14 }} />
      )}

      {source === 'live' && (
        <View style={styles.note}>
          <Icon name="information-outline" size={16} color={colors.dim} />
          <Text style={styles.noteText}>
            Names aren&apos;t shown yet: the run service stores no profiles. They&apos;ll appear once a profile service is connected.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  source: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginBottom: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  me: { backgroundColor: 'rgba(47,91,255,0.08)', borderColor: 'rgba(47,91,255,0.4)' },
  rank: { color: colors.dim, fontFamily: fonts.monoBold, fontSize: 14, width: 26 },
  anon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
  area: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 16 },
  gap: { color: colors.mute, textAlign: 'center', marginVertical: 6, fontFamily: fonts.bold, letterSpacing: 4 },
  note: { flexDirection: 'row', gap: 8, marginTop: 18, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: 12 },
  noteText: { flex: 1, color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
