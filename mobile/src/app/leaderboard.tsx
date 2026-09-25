import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Display, FadeIn, Header, Kicker, Screen, Segmented } from '@/components/ui';
import { leaderboardApi, type LeaderboardPeriod } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { territoryBoard } from '@/data/territory';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Daily', 'Weekly', 'All-time'] as const;
const PERIOD: Record<(typeof TABS)[number], LeaderboardPeriod> = { Daily: 'daily', Weekly: 'weekly', 'All-time': 'all_time' };

type Row = { name: string; userId?: string; km2: number; me?: boolean };

/** City leaderboard ranked by territory area, like the backend's leaderboard endpoint. */
export default function Leaderboard() {
  const { city, me } = useApp();
  const { mode } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Weekly');
  const [rows, setRows] = useState<Row[]>(territoryBoard.weekly);
  const [source, setSource] = useState<'demo' | 'live' | 'error'>('demo');

  useEffect(() => {
    const period = PERIOD[tab];
    setRows(territoryBoard[period]);
    if (mode !== 'live') return setSource('demo');
    let cancelled = false;
    leaderboardApi
      .get(period)
      .then((r) => {
        if (cancelled) return;
        setRows(r.entries.map((e) => ({ name: e.display_name, userId: e.user_id, km2: e.area_m2 / 1e6, me: e.is_me })));
        setSource('live');
      })
      .catch(() => !cancelled && setSource('error'));
    return () => {
      cancelled = true;
    };
  }, [tab, mode]);

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <Kicker>{city.name} · ranked by territory</Kicker>
      <Display size={46} style={{ marginTop: 6 }}>Who owns <Text style={{ color: colors.primary }}>the city</Text></Display>
      <Segmented items={TABS} value={tab} onChange={setTab} />
      <Text style={styles.source}>{source === 'live' ? 'Live from the server' : source === 'error' ? 'Server unreachable · showing sample data' : 'Sample data · sign in for live rankings'}</Text>
      <View style={{ gap: 8 }}>
        {rows.map((r, i) => {
          const u = r.me ? me : r.userId ? userById(r.userId) : undefined;
          return (
            <FadeIn key={`${tab}-${r.name}`} index={i}>
              <View style={[styles.row, r.me && styles.me, i === 0 && { borderColor: colors.primary }]}>
                <Text style={[styles.rank, i === 0 && { color: colors.primary }]}>{String(i + 1).padStart(2, '0')}</Text>
                {u && <Avatar user={u} size={38} ring={i === 0 ? colors.primary : colors.lineHi} />}
                <Text style={styles.name}>{r.me ? 'You' : r.name}</Text>
                <Text style={styles.area}>{r.km2.toFixed(1)} km²</Text>
              </View>
            </FadeIn>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  source: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginBottom: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  me: { backgroundColor: 'rgba(255,107,0,0.08)', borderColor: 'rgba(255,107,0,0.4)' },
  rank: { color: colors.dim, fontFamily: fonts.monoBold, fontSize: 14, width: 26 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
  area: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 16 },
});
