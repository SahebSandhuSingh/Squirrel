/**
 * Head-to-head challenges on the Social service (most verified km, or most workouts, in 1–30
 * days) and the notification list. The demo screens render instead without a Social session.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { challengesApi, notificationsApi, type AppNotification, type Challenge } from '@/api/community';
import { profileApi, socialErrorText, type Follower } from '@/api/social';
import { invalidateRemote, useRemote } from '@/api/useRemote';
import { Avatar } from '@/components/Avatar';
import { BlockSkeleton, SocialError, toAvatarUser } from '@/components/socialParts';
import { Button, Card, Chips, EmptyState, FadeIn, Header, Icon, IconButton, PressScale, ProgressBar, Screen, SearchBar, SectionHeader } from '@/components/ui';
import { timeAgo } from '@/community/look';
import type { IconName } from '@/data/icons';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const fmt = (c: Challenge, v: number) => (c.metric === 'km' ? `${v.toFixed(1)} km` : `${Math.round(v)} workout${Math.round(v) === 1 ? '' : 's'}`);
const left = (iso: string) => {
  const min = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  return min < 60 ? `${min}m left` : min < 1440 ? `${Math.floor(min / 60)}h left` : `${Math.floor(min / 1440)}d left`;
};

export function LiveChallenges() {
  const { toast } = useApp();
  const list = useRemote('challenges', () => challengesApi.list());
  const [creating, setCreating] = useState(false);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done, 'sword-cross', colors.primary);
      list.reload();
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle', colors.secondary);
    }
  };

  const items = list.data?.items ?? [];
  const incoming = items.filter((c) => c.status === 'pending' && !c.i_challenged);
  const running = items.filter((c) => c.status === 'accepted' || (c.status === 'pending' && c.i_challenged));
  const done = items.filter((c) => ['finished', 'declined', 'cancelled'].includes(c.status));

  if (creating) return <NewChallenge onClose={() => { setCreating(false); list.reload(); }} />;

  return (
    <Screen tabBar={false}>
      <Header back title="Challenges" right={<IconButton icon="plus" onPress={() => setCreating(true)} label="Challenge someone" />} />
      {list.error && !list.data ? <SocialError error={new Error(list.error)} onRetry={list.reload} /> : null}
      {!list.data && list.loading ? <BlockSkeleton height={200} /> : null}

      {incoming.length > 0 && <SectionHeader title="Waiting for you" />}
      <View style={{ gap: 10 }}>
        {incoming.map((c) => (
          <Card key={c.id}>
            <Versus c={c} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Button label="Decline" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => act(() => challengesApi.decline(c.id), 'Declined')} />
              <Button label="Accept" size="md" style={{ flex: 1 }} onPress={() => act(() => challengesApi.accept(c.id), 'Game on!')} />
            </View>
          </Card>
        ))}
      </View>

      {running.length > 0 && <SectionHeader title="Going on" />}
      <View style={{ gap: 10 }}>
        {running.map((c, i) => (
          <FadeIn key={c.id} index={i}>
            <Card>
              <Versus c={c} />
              {c.status === 'pending' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <Text style={styles.meta}>Waiting for {c.opponent.user.display_name} to accept</Text>
                  <Button label="Withdraw" variant="secondary" size="sm" onPress={() => act(() => challengesApi.cancel(c.id), 'Withdrawn')} />
                </View>
              )}
            </Card>
          </FadeIn>
        ))}
      </View>

      {done.length > 0 && <SectionHeader title="Finished" />}
      <View style={{ gap: 10 }}>
        {done.map((c) => (
          <Card key={c.id}>
            <Versus c={c} />
          </Card>
        ))}
      </View>

      {list.data && items.length === 0 && (
        <EmptyState
          art={<Mascot pose="run" size={140} />}
          title="No challenges yet"
          body="Pick someone and race them: most km run, or most workouts, over a few days."
          action="Challenge someone"
          onAction={() => setCreating(true)}
        />
      )}
    </Screen>
  );
}

function Versus({ c }: { c: Challenge }) {
  const total = Math.max(c.me.score + c.opponent.score, 0.0001);
  const what = c.metric === 'km' ? 'Most km run' : 'Most workouts';
  const status =
    c.status === 'accepted' && c.ends_at ? left(c.ends_at)
      : c.status === 'pending' ? `${c.days} day${c.days === 1 ? '' : 's'} · not started`
        : c.status === 'finished' ? (c.winner_id === c.me.user.id ? 'You won' : c.winner_id ? 'You lost' : 'Draw')
          : c.status === 'declined' ? 'Declined' : 'Withdrawn';
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.title}>{what} · {c.days}d</Text>
        <Text style={[styles.meta, c.status === 'finished' && c.winner_id === c.me.user.id && { color: colors.primary }]}>{status}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <Avatar user={toAvatarUser(c.me.user, true)} size={34} link={false} />
        <Text style={styles.score}>{fmt(c, c.me.score)}</Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.score, { textAlign: 'right' }]}>{fmt(c, c.opponent.score)}</Text>
        <Avatar user={toAvatarUser(c.opponent.user)} size={34} />
      </View>
      {c.status !== 'pending' && <ProgressBar progress={c.me.score / total} style={{ marginTop: 10 }} />}
    </View>
  );
}

function NewChallenge({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [metric, setMetric] = useState<'km' | 'workouts'>('km');
  const [days, setDays] = useState<'1 day' | '3 days' | '7 days' | '14 days'>('7 days');
  const term = q.trim();
  const people = useRemote(term.length >= 2 ? `people:${term}` : 'people:suggest', () => (term.length >= 2 ? profileApi.search(term) : profileApi.suggestions(10)));

  const challenge = async (f: Follower) => {
    try {
      await challengesApi.create(f.id, metric, parseInt(days, 10));
      invalidateRemote('challenges');
      toast(`Challenge sent to ${f.display_name}`, 'sword-cross', colors.primary);
      onClose();
    } catch (e) {
      toast(socialErrorText(e), 'alert-circle', colors.secondary);
    }
  };

  return (
    <Screen tabBar={false}>
      <Header back title="New challenge" right={<IconButton icon="close" onPress={onClose} label="Close" />} />
      <Chips items={['km', 'workouts'] as const} value={metric} onChange={setMetric} icons={{ km: 'run-fast', workouts: 'dumbbell' }} />
      <Chips items={['1 day', '3 days', '7 days', '14 days'] as const} value={days} onChange={setDays} />
      <View style={{ marginTop: 6 }}>
        <SearchBar placeholder="Who do you want to race?" value={q} onChangeText={setQ} />
      </View>
      <View style={{ gap: 8, marginTop: 10 }}>
        {(people.data?.items ?? []).filter((p) => !p.is_me).map((p) => (
          <PressScale key={p.id} onPress={() => challenge(p)} style={styles.person}>
            <Avatar user={toAvatarUser(p)} size={40} link={false} />
            <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>{p.display_name}</Text>
            <Icon name="sword-cross" size={20} color={colors.primary} />
          </PressScale>
        ))}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const KIND_ICON: Record<string, [IconName, string]> = {
  territory_lost: ['map-marker-alert', colors.secondary],
  territory_captured: ['flag-checkered', colors.primary],
  territory_expired: ['map-marker-off', colors.dim],
  challenge: ['sword-cross', colors.orange],
  challenge_accepted: ['sword-cross', colors.primary],
  challenge_finished: ['trophy', colors.gold],
  event_new: ['calendar-star', colors.violet],
  event_reminder: ['calendar-clock', colors.violet],
  event_cancelled: ['calendar-remove', colors.dim],
  checkin: ['map-marker-check', colors.green],
  crew_join: ['account-group', colors.secondary],
  vouch: ['shield-check', colors.primary],
  referral: ['account-multiple-plus', colors.primary],
  badge: ['medal', colors.gold],
};

export function LiveNotifications() {
  const list = useRemote('notifications', () => notificationsApi.list());
  const open = (n: AppNotification) => {
    if (!n.read) notificationsApi.markRead([n.id]).then(() => invalidateRemote('notifications'), () => undefined);
    if (typeof n.data.route === 'string' && n.data.route.startsWith('/')) router.push(n.data.route as Href);
  };
  const markAll = async () => {
    await notificationsApi.markRead().catch(() => undefined);
    list.reload();
  };
  const items = list.data?.items ?? [];
  return (
    <Screen tabBar={false}>
      <Header back title="Notifications" right={list.data?.unread ? <IconButton icon="check-all" onPress={markAll} label="Mark all read" /> : undefined} />
      {list.error && !list.data ? <SocialError error={new Error(list.error)} onRetry={list.reload} /> : null}
      {!list.data && list.loading ? <BlockSkeleton height={240} /> : null}
      <View style={{ gap: 10, marginTop: 10 }}>
        {items.map((n, i) => {
          const [icon, color] = KIND_ICON[n.kind] ?? ['bell', colors.primary];
          return (
            <FadeIn key={n.id} index={i}>
              <PressScale onPress={() => open(n)} style={[styles.row, !n.read && { borderColor: 'rgba(215,255,31,0.35)' }]}>
                {n.actor ? (
                  <Avatar user={toAvatarUser(n.actor)} size={44} link={false} />
                ) : (
                  <View style={[styles.icon, { backgroundColor: `${color}22` }]}>
                    <Icon name={icon} size={22} color={color} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.text}>{n.title}</Text>
                  {!!n.body && <Text style={styles.meta}>{n.body}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
                  {!n.read && <View style={styles.dot} />}
                </View>
              </PressScale>
            </FadeIn>
          );
        })}
      </View>
      {list.data && items.length === 0 && (
        <EmptyState art={<Mascot pose="sleep" size={130} />} title="All quiet" body="Steals, challenges, crew news and event reminders show up here." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  score: { flex: 1, color: colors.text, fontFamily: fonts.labelBold, fontSize: 16 },
  vs: { color: colors.dim, fontFamily: fonts.black, fontSize: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  time: { color: colors.dim, fontFamily: fonts.regular, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
