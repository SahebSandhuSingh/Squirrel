/**
 * Home's community strip: what the campus did today (Social service daily stats, verified numbers
 * only), what you did, how many people are out running or in a workout right now, and your place
 * in the waitlist with the invite link.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { communityApi, liveCounts } from '@/api/community';
import { useRemote } from '@/api/useRemote';
import { Card, Icon, PressScale, Pulse } from '@/components/ui';
import { colors, fonts, radius } from '@/theme';

const LIVE_EVERY_MS = 60_000;

/** People running / working out right now, refreshed every minute. Nulls when unknown; the line
 *  leaves out a zero ("0 running now" says nothing useful). */
export function useLiveCounts(enabled: boolean) {
  const [counts, setCounts] = useState<{ running: number | null; workingOut: number | null }>({ running: null, workingOut: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => liveCounts().then((c) => !cancelled && setCounts(c));
    load();
    const t = setInterval(load, LIVE_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);
  return counts;
}

export const liveLine = (c: { running: number | null; workingOut: number | null }) => {
  const parts = [
    c.running ? `${c.running} running now` : null,
    c.workingOut ? `${c.workingOut} working out` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

/** `live`: the running / working-out line (from useLiveCounts, shared with the run button). */
export function CampusToday({ live: line }: { live: string | null }) {
  const stats = useRemote('stats:daily', () => communityApi.dailyStats(7));
  const t = stats.data?.today;
  const me = stats.data?.me_today;
  return (
    <Card style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.kicker}>CAMPUS TODAY</Text>
        {line && (
          <View style={styles.live}>
            <View style={styles.dotWrap}>
              <Pulse size={14} color={colors.green} />
              <View style={styles.dot} />
            </View>
            <Text style={styles.liveText}>{line}</Text>
          </View>
        )}
      </View>
      {t ? (
        <>
          <View style={styles.grid}>
            <Stat value={String(t.active_members)} label="moving" />
            <Stat value={`${t.km.toFixed(1)}`} label="km run" />
            <Stat value={String(t.runs)} label="runs" />
            <Stat value={String(t.workouts)} label="workouts" />
          </View>
          <Text style={styles.me}>
            You today: {me && (me.runs || me.workouts) ? `${me.km.toFixed(1)} km · ${me.runs} run${me.runs === 1 ? '' : 's'} · ${me.workouts} workout${me.workouts === 1 ? '' : 's'}` : 'nothing yet. A run or a workout counts.'}
          </Text>
          <Week days={stats.data?.days ?? []} />
        </>
      ) : (
        <Text style={styles.me}>{stats.error ? "Can't load today's numbers right now." : 'Loading today…'}</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Link icon="podium" text="Leaderboard" to="/leaderboard" />
        <Link icon="account-multiple-plus" text="Invite friends" to="/invite" />
      </View>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

/** The last 7 days' active members, as small bars (today last). */
function Week({ days }: { days: { day: string; active_members: number }[] }) {
  const shown = [...days].reverse();
  const max = Math.max(1, ...shown.map((d) => d.active_members));
  return (
    <View style={styles.week} accessibilityLabel="Active members over the last 7 days">
      {shown.map((d) => (
        <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={[styles.bar, { height: 4 + 30 * (d.active_members / max) }]} />
          <Text style={styles.barLabel}>{new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}</Text>
        </View>
      ))}
    </View>
  );
}

function Link({ icon, text, to }: { icon: React.ComponentProps<typeof Icon>['name']; text: string; to: '/leaderboard' | '/invite' }) {
  return (
    <PressScale onPress={() => router.push(to)} style={styles.link}>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text style={styles.linkText}>{text}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.primary, fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.2 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { color: colors.green, fontFamily: fonts.bold, fontSize: 11 },
  dotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  grid: { flexDirection: 'row', marginTop: 12 },
  value: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 22 },
  label: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11 },
  me: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12, marginTop: 10 },
  week: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 12, height: 50 },
  bar: { width: '70%', borderRadius: 3, backgroundColor: colors.primary, opacity: 0.8 },
  barLabel: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingVertical: 8 },
  linkText: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
});
