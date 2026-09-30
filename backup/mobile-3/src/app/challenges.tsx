import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { Card, Display, FadeIn, Header, Icon, Kicker, ProgressBar, Screen, Segmented, Tagline } from '@/components/ui';
import { challenges, fmtEnds, fmtMetric, type Challenge, type ChallengeKind } from '@/data/challenges';
import { userById } from '@/data/users';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Daily', 'Head-to-head', 'Group'] as const;
const KIND: Record<(typeof TABS)[number], ChallengeKind> = { Daily: 'daily', 'Head-to-head': 'head-to-head', Group: 'group' };

/**
 * CHOOSE YOUR BATTLE — backend-style Challenges. Progress comes from your logged activity
 * and results resolve automatically (every few minutes server-side); nothing to claim.
 */
export default function Challenges() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Daily');
  const list = challenges.filter((c) => c.kind === KIND[tab]);
  return (
    <Screen tabBar={false}>
      <Header back title="" right={<Text style={styles.link} onPress={() => router.push('/missions')}>Missions →</Text>} />
      <Kicker>Challenges</Kicker>
      <Display size={48} style={{ marginTop: 6, lineHeight: 50 }}>
        Choose your{'\n'}
        <Text style={{ color: colors.secondary }}>battle.</Text>
      </Display>
      <Tagline size={16} rotate={-2} style={{ marginTop: 6 }}>Progress counts itself. Just move.</Tagline>
      <Segmented items={TABS} value={tab} onChange={setTab} />
      <View style={{ gap: 12 }}>
        {list.map((c, i) => (
          <FadeIn key={c.id} index={i}>
            <ChallengeCard c={c} />
          </FadeIn>
        ))}
      </View>
      <View style={styles.note}>
        <Icon name="information-outline" size={16} color={colors.dim} />
        <Text style={styles.noteText}>Challenges read your real runs and steps, and XP lands automatically when they resolve. Missions are the tap-to-log goals on Home.</Text>
      </View>
    </Screen>
  );
}

function ChallengeCard({ c }: { c: Challenge }) {
  const { me } = useApp();
  const color = c.kind === 'daily' ? colors.primary : c.kind === 'head-to-head' ? colors.secondary : colors.purple;
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={[styles.icon, { borderColor: color }]}>
        <Icon name={c.icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.meta}>{fmtEnds(c.endsInMin)} · auto-resolves</Text>
      </View>
      <View style={[styles.xp, { borderColor: color }]}>
        <Text style={[styles.xpText, { color }]}>+{c.xp} XP</Text>
      </View>
    </View>
  );

  if (c.kind === 'head-to-head' && c.opponent) {
    const opp = userById(c.opponent.userId);
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
            <Avatar user={opp} size={48} ring={!leading ? colors.secondary : colors.lineHi} />
            <Text style={styles.vsVal}>{fmtMetric(c.opponent.value, c.metric)}</Text>
            <Text style={styles.meta}>{opp.name.split(' ')[0]}</Text>
          </View>
        </View>
        <View style={styles.tug}>
          <View style={{ flex: c.mine / total, backgroundColor: colors.primary }} />
          <View style={{ flex: c.opponent.value / total, backgroundColor: colors.secondary }} />
        </View>
        <Text style={[styles.status, { color: leading ? colors.primary : colors.secondary }]}>
          {leading ? `You're ahead by ${fmtMetric(+(c.mine - c.opponent.value).toFixed(1), c.metric)}` : `${fmtMetric(+(c.opponent.value - c.mine).toFixed(1), c.metric)} behind — go get it`}
        </Text>
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
        <ProgressBar progress={c.group.value / c.goal} color={color} height={10} style={{ marginTop: 6 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={styles.status}>{fmtMetric(c.group.value, c.metric)} / {fmtMetric(c.goal, c.metric)}</Text>
          <Text style={[styles.status, { color }]}>You: {fmtMetric(c.mine, c.metric)}</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      {head}
      <ProgressBar progress={c.mine / (c.goal ?? 1)} color={color} height={10} style={{ marginTop: 14 }} />
      <Text style={[styles.status, { marginTop: 6 }]}>
        {fmtMetric(c.mine, c.metric)} / {fmtMetric(c.goal ?? 0, c.metric)}
      </Text>
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
  noteText: { flex: 1, color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
});
