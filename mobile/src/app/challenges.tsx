import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { challengeErrorText, progressApi, progressLive, type ServerChallenge } from '@/api/progress';
import { useRemote } from '@/api/useRemote';
import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Display, EmptyState, FadeIn, Header, Icon, Kicker, ProgressBar, Screen, Segmented, Tagline, tap } from '@/components/ui';
import { challenges as demoChallenges, fmtEnds, fmtMetric, type Challenge, type ChallengeKind } from '@/data/challenges';
import type { IconName } from '@/data/icons';
import { users } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Daily', 'Head-to-head', 'Group', 'Special'] as const;
type Tab = (typeof TABS)[number];
const KIND: Record<Tab, ChallengeKind> = { Daily: 'daily', 'Head-to-head': 'head-to-head', Group: 'group', Special: 'special' };
const EMPTY: Record<Tab, { title: string; body: string }> = {
  Daily: { title: 'No dailies right now', body: "Today's challenges appear here at midnight, your time." },
  'Head-to-head': { title: 'No duels yet', body: 'When someone challenges you, or you challenge them, the battle shows up here.' },
  Group: { title: 'No group goals', body: 'Crew-wide challenges will land here when they go live.' },
  Special: { title: 'Nothing limited-time', body: 'Special events drop now and then. Check back soon.' },
};

const METRIC: Record<ServerChallenge['metric'], Challenge['metric']> = {
  steps: 'steps',
  active_minutes: 'minutes',
  workout_minutes: 'minutes',
  workouts: 'workouts',
  distance_km: 'km',
  territory_km2: 'km2',
};
const DEFAULT_ICON: Record<ChallengeKind, IconName> = { daily: 'calendar-today', 'head-to-head': 'sword-cross', group: 'account-group', special: 'lightning-bolt' };

/** Server challenge → the card model this screen already renders. */
function fromServer(c: ServerChallenge): Challenge {
  const kind: ChallengeKind = c.kind === 'head_to_head' ? 'head-to-head' : c.kind;
  return {
    id: c.id,
    kind,
    title: c.title,
    metric: METRIC[c.metric],
    icon: (c.icon as IconName | null) ?? DEFAULT_ICON[kind],
    mine: c.me.current,
    goal: kind === 'head-to-head' ? undefined : c.target,
    opponent: c.opponent ? { userId: c.opponent.userId, value: c.opponent.score, name: c.opponent.name } : undefined,
    group: c.group ? { name: c.group.name ?? 'Your crew', value: c.group.collective, members: c.group.members } : undefined,
    xp: c.xpReward,
    endsInMin: c.endsInMinutes,
    live: {
      description: c.description,
      joined: c.joined,
      canJoin: c.canJoin,
      invited: !!c.invited,
      status: c.status,
      mine: c.me.status,
      completed: c.me.completed,
      closedReason: c.closedReason,
      ineligible: c.ineligible ?? null,
      winnerUserId: c.winnerUserId ?? null,
      xpTie: c.xpRewardTie,
      participants: c.participants,
      maxParticipants: c.maxParticipants,
      minLevel: typeof c.rules?.minLevel === 'number' ? c.rules.minLevel : undefined,
    },
  };
}

/**
 * CHOOSE YOUR BATTLE — backend-style Challenges. Progress comes from your logged activity
 * and results resolve automatically (every few minutes server-side); nothing to claim.
 */
export default function Challenges() {
  const { mode } = useAuth();
  const { toast } = useApp();
  const live = progressLive(mode);
  const remote = useRemote(live ? 'progress:challenges' : null, () => progressApi.challenges('current'));
  const all = useMemo(() => (live ? (remote.data?.challenges ?? []).map(fromServer) : demoChallenges), [live, remote.data]);
  // "Special" only exists on the server; the tab shows up when there is something in it.
  const tabs = useMemo(() => TABS.filter((t) => t !== 'Special' || all.some((c) => c.kind === 'special')), [all]);
  const [picked, setTab] = useState<Tab>('Daily');
  const tab = tabs.includes(picked) ? picked : 'Daily';
  const list = all.filter((c) => c.kind === KIND[tab]);
  const [busy, setBusy] = useState<string | null>(null);

  const act = useCallback(
    async (c: Challenge, action: 'join' | 'leave') => {
      if (busy) return;
      setBusy(c.id);
      try {
        await (action === 'join' ? progressApi.join(c.id) : progressApi.leave(c.id));
        tap('success');
        toast(
          action === 'join' ? (c.live?.invited ? `Duel on · ${c.title}` : `Joined · ${c.title}`) : c.live?.invited ? 'Invite declined' : 'You left the challenge',
          action === 'join' ? 'flag-checkered' : 'exit-run',
          action === 'join' ? colors.primary : colors.dim,
        );
      } catch (e) {
        toast(challengeErrorText(e), 'alert-circle-outline', colors.coral);
      } finally {
        setBusy(null);
        remote.reload();
      }
    },
    [busy, remote, toast],
  );

  const unauthorized = remote.error != null && /401|sign in|token/i.test(remote.error);
  return (
    <Screen tabBar={false}>
      <Header back title="" right={<Text style={styles.link} onPress={() => router.push('/missions')}>Missions →</Text>} />
      <Kicker>Challenges</Kicker>
      <Display size={48} style={{ marginTop: 6, lineHeight: 50 }}>
        Choose your{'\n'}
        <Text style={{ color: colors.secondary }}>battle.</Text>
      </Display>
      <Tagline size={16} rotate={-2} style={{ marginTop: 6 }}>Progress counts itself. Just move.</Tagline>
      <Segmented items={tabs} value={tab} onChange={setTab} />
      {live && !remote.data && remote.loading ? (
        <View style={{ gap: 12 }}>
          {[0, 1].map((i) => (
            <Card key={i} style={{ opacity: 0.5 }}>
              <Text style={styles.meta}>Loading challenges…</Text>
              <ProgressBar progress={0} height={10} style={{ marginTop: 14 }} />
            </Card>
          ))}
        </View>
      ) : live && !remote.data && remote.error ? (
        <EmptyState
          title={unauthorized ? 'Sign in again' : "Couldn't load challenges"}
          body={unauthorized ? 'Your session expired. Sign in to see and join challenges.' : remote.error}
          action={unauthorized ? 'Sign in' : 'Try again'}
          onAction={unauthorized ? () => router.push('/sign-in') : remote.reload}
        />
      ) : list.length === 0 ? (
        <EmptyState title={EMPTY[tab].title} body={EMPTY[tab].body} />
      ) : (
        <View style={{ gap: 12 }}>
          {list.map((c, i) => (
            <FadeIn key={c.id} index={i}>
              <ChallengeCard c={c} busy={busy === c.id} onAct={live ? act : undefined} />
            </FadeIn>
          ))}
        </View>
      )}
      {live && remote.data && remote.error && <Text style={[styles.meta, { marginTop: 10, color: colors.coral }]}>Showing the last update · {remote.error}</Text>}
      <View style={styles.note}>
        <Icon name="information-outline" size={16} color={colors.dim} />
        <Text style={styles.noteText}>Challenges read your real runs and steps, and XP lands automatically when they resolve. Missions are the tap-to-log goals on Home.</Text>
      </View>
    </Screen>
  );
}

/** Result / state line for a live challenge, and the join / leave controls. */
function LiveFooter({ c, color, busy, onAct }: { c: Challenge; color: string; busy: boolean; onAct: (c: Challenge, a: 'join' | 'leave') => void }) {
  const l = c.live!;
  const result =
    l.mine === 'won'
      ? { text: `You won · +${c.xp} XP`, color: colors.primary, icon: 'trophy' as IconName }
      : l.mine === 'tied'
        ? { text: `Tie · +${l.xpTie ?? 0} XP each`, color: colors.gold, icon: 'scale-balance' as IconName }
        : l.mine === 'lost'
          ? { text: 'They took this one', color: colors.coral, icon: 'flag-outline' as IconName }
          : l.completed
            ? { text: `Completed · +${c.xp} XP earned`, color: colors.primary, icon: 'check-decagram' as IconName }
            : l.mine === 'failed'
              ? { text: 'Ended · not completed', color: colors.dim, icon: 'timer-sand-complete' as IconName }
              : l.status === 'cancelled'
                ? { text: 'Cancelled · never accepted', color: colors.dim, icon: 'cancel' as IconName }
                : l.status === 'ended' || l.closedReason === 'challenge_expired' || l.closedReason === 'challenge_closed'
                  ? { text: 'Ended', color: colors.dim, icon: 'timer-sand-complete' as IconName }
                  : null;
  if (result) {
    return (
      <View style={styles.result}>
        <Icon name={result.icon} size={16} color={result.color} />
        <Text style={[styles.resultText, { color: result.color }]}>{result.text}</Text>
      </View>
    );
  }
  if (l.invited) {
    return (
      <View style={styles.actions}>
        <Button label="Accept duel" size="sm" variant="accent" disabled={busy} onPress={() => onAct(c, 'join')} style={{ flex: 1 }} />
        <Button label="Decline" size="sm" variant="ghost" disabled={busy} onPress={() => onAct(c, 'leave')} style={{ flex: 1 }} />
      </View>
    );
  }
  if (!l.joined) {
    const why = l.ineligible;
    const label = l.canJoin
      ? 'Join challenge'
      : why?.code === 'challenge_full'
        ? 'Full'
        : why && l.minLevel && /level/i.test(why.detail)
          ? `Level ${l.minLevel}+`
          : why
            ? 'Not eligible'
            : 'Not open';
    return (
      <View>
        <View style={styles.actions}>
          <Button label={label} size="sm" disabled={busy || !l.canJoin} onPress={() => onAct(c, 'join')} style={{ flex: 1 }} />
          {l.maxParticipants != null && <Text style={[styles.meta, { alignSelf: 'center' }]}>{l.participants}/{l.maxParticipants} in</Text>}
        </View>
        {why && <Text style={[styles.meta, { marginTop: 6 }]}>{why.detail.charAt(0).toUpperCase() + why.detail.slice(1)}</Text>}
      </View>
    );
  }
  return (
    <View style={[styles.actions, { justifyContent: 'space-between' }]}>
      <Text style={[styles.meta, { color, alignSelf: 'center' }]}>In · progress counts automatically</Text>
      <Text style={styles.leave} onPress={busy ? undefined : () => onAct(c, 'leave')} accessibilityRole="button">
        {c.kind === 'head-to-head' ? 'Forfeit' : 'Leave'}
      </Text>
    </View>
  );
}

function ChallengeCard({ c, busy = false, onAct }: { c: Challenge; busy?: boolean; onAct?: (c: Challenge, a: 'join' | 'leave') => void }) {
  const { me } = useApp();
  const color = c.kind === 'daily' ? colors.primary : c.kind === 'head-to-head' ? colors.secondary : c.kind === 'special' ? colors.gold : colors.purple;
  const ended = c.live && (c.live.status === 'ended' || c.live.status === 'cancelled');
  const footer = c.live && onAct ? <LiveFooter c={c} color={color} busy={busy} onAct={onAct} /> : null;
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={[styles.icon, { borderColor: color }]}>
        <Icon name={c.icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.meta}>{ended ? 'Ended' : c.live?.status === 'upcoming' ? 'Starts soon' : `${fmtEnds(c.endsInMin)} · auto-resolves`}</Text>
      </View>
      <View style={[styles.xp, { borderColor: color }]}>
        <Text style={[styles.xpText, { color }]}>+{c.xp} XP</Text>
      </View>
    </View>
  );

  if (c.kind === 'head-to-head' && c.opponent) {
    // Known demo people keep their portrait; anyone else gets an initial (never someone else's face).
    const opp = users.find((u) => u.id === c.opponent!.userId);
    const oppName = c.opponent.name ?? opp?.name ?? 'Opponent';
    const total = c.mine + c.opponent.value || 1;
    const leading = c.mine >= c.opponent.value;
    return (
      <Card>
        {head}
        <View style={styles.vs}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Avatar user={me} size={48} ring={leading ? colors.primary : colors.lineHi} />
            <Text style={styles.vsVal}>{fmtMetric(c.mine, c.metric)}</Text>
            <Text style={styles.meta}>You</Text>
          </View>
          <Text style={styles.vsText}>VS</Text>
          <View style={{ alignItems: 'center', flex: 1 }}>
            {opp ? (
              <Avatar user={opp} size={48} ring={!leading ? colors.secondary : colors.lineHi} />
            ) : (
              <View style={[styles.initial, { borderColor: !leading ? colors.secondary : colors.lineHi }]}>
                <Text style={styles.initialText}>{oppName.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.vsVal}>{fmtMetric(c.opponent.value, c.metric)}</Text>
            <Text style={styles.meta}>{oppName.split(' ')[0]}</Text>
          </View>
        </View>
        <View style={styles.tug}>
          <View style={{ flex: c.mine / total, backgroundColor: colors.primary }} />
          <View style={{ flex: c.opponent.value / total, backgroundColor: colors.secondary }} />
        </View>
        {!(c.live && (ended || c.live.mine === 'won' || c.live.mine === 'lost' || c.live.mine === 'tied' || c.live.invited)) && (
          <Text style={[styles.status, { color: leading ? colors.primary : colors.secondary }]}>
            {c.mine === c.opponent.value
              ? 'Dead level — next move wins it'
              : leading
                ? `You're ahead by ${fmtMetric(+(c.mine - c.opponent.value).toFixed(1), c.metric)}`
                : `${fmtMetric(+(c.opponent.value - c.mine).toFixed(1), c.metric)} behind — go get it`}
          </Text>
        )}
        {footer}
      </Card>
    );
  }

  if (c.kind === 'group' && c.group && c.goal) {
    return (
      <Card>
        {head}
        <Text style={[styles.meta, { marginTop: 12 }]}>
          {c.group.name} · {c.group.members} members
        </Text>
        <ProgressBar progress={Math.min(1, c.group.value / c.goal)} color={color} height={10} style={{ marginTop: 6 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={styles.status}>{fmtMetric(c.group.value, c.metric)} / {fmtMetric(c.goal, c.metric)}</Text>
          <Text style={[styles.status, { color }]}>You: {fmtMetric(c.mine, c.metric)}</Text>
        </View>
        {footer}
      </Card>
    );
  }

  return (
    <Card>
      {head}
      {c.live?.description ? <Text style={[styles.meta, { marginTop: 10 }]}>{c.live.description}</Text> : null}
      <ProgressBar progress={Math.min(1, c.mine / (c.goal ?? 1))} color={color} height={10} style={{ marginTop: 14 }} />
      <Text style={[styles.status, { marginTop: 6 }]}>
        {fmtMetric(c.mine, c.metric)} / {fmtMetric(c.goal ?? 0, c.metric)}
      </Text>
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primary, fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  icon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontFamily: fonts.label, fontSize: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  xp: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  xpText: { fontFamily: fonts.monoBold, fontSize: 11 },
  vs: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  vsVal: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 20, marginTop: 6 },
  vsText: { color: colors.text, fontFamily: fonts.display, fontSize: 26 },
  tug: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  status: { color: colors.sub, fontFamily: fonts.mono, fontSize: 11, marginTop: 8 },
  note: { flexDirection: 'row', gap: 8, marginTop: 18, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  leave: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', paddingVertical: 4 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  resultText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  initial: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardHi },
  initialText: { color: colors.text, fontFamily: fonts.display, fontSize: 22 },
  noteText: { flex: 1, color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
