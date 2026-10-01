/**
 * AMBASSADOR PROGRAMME — apply to be a Campus Ambassador (a short statement, reviewed by the
 * team), see where your application stands, and once approved, share your recruit code and
 * track the people who joined with it. Someone recruited by an ambassador enters that code here.
 *
 * Backed by the Social service's /v1/ambassador routes (api/social/ambassador.ts). Until those
 * are live the screen keeps its layout and says "Not live yet" — nothing is sent or saved.
 * The separate waitlist form (Profile → Ambassador waitlist, /ambassador) is unchanged.
 */
import { useState } from 'react';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { errorText, featureUnavailable } from '@/api/campus';
import { AMBASSADOR_STATEMENT_MAX, AMBASSADOR_STATEMENT_MIN, ambassadorApi, ambassadorProgrammeLive, type AmbassadorProgramme, type RecruitPage, type Recruiter } from '@/api/social/ambassador';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { ErrorState, LoadingRows, NotConnected, NotLiveYet } from '@/components/campus/States';
import { shortTime } from '@/components/campus/territoryUi';
import { Button, Card, Display, Header, Icon, Kicker, Screen, SectionHeader, Segmented, tap } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useCampus } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Apply', 'Recruits'] as const;
const STATUS: Record<string, { label: string; color: string; icon: React.ComponentProps<typeof Icon>['name']; body: string }> = {
  pending: { label: 'Under review', color: colors.violet, icon: 'progress-clock', body: 'The team reads every application. You can edit it or withdraw it while it’s pending.' },
  approved: { label: 'Approved', color: colors.primary, icon: 'check-decagram', body: 'You’re a Campus Ambassador. Share your code — everyone who joins with it shows up under Recruits.' },
  rejected: { label: 'Not this time', color: colors.coral, icon: 'close-circle-outline', body: 'You can edit your statement and apply again.' },
};

export default function AmbassadorProgrammeScreen() {
  const { mode } = useAuth();
  const live = ambassadorProgrammeLive();
  const signedIn = mode === 'live';
  const [tab, setTab] = useState<(typeof TABS)[number]>('Apply');
  const status = useCampus<AmbassadorProgramme>('ambassador:programme', () => ambassadorApi.status(), { enabled: live && signedIn, needsAuth: false });

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <Kicker color={colors.violet}>Campus Ambassador</Kicker>
      <Display size={36} style={{ marginTop: 4 }}>
        Bring your{'\n'}
        <Text style={{ color: colors.primary }}>campus in</Text>
      </Display>
      <Text style={styles.lead}>Ambassadors get IISER Kolkata moving: they run crews and events, and invite people in. No payouts — just the badge, early features and a direct line to the team.</Text>

      {!live ? (
        <>
          <NotLiveYet name="Ambassador applications" body="Applying and recruit tracking switch on when the ambassador service goes live. The waitlist is open meanwhile." />
          <Button label="Join the ambassador waitlist" variant="secondary" size="md" iconLeft="clipboard-list-outline" onPress={() => router.push('/ambassador')} style={{ marginTop: 12 }} />
        </>
      ) : !signedIn ? (
        <NotConnected name="Ambassador applications" reason="signed_out" />
      ) : status.error && !status.data ? (
        featureUnavailable(status.error) ? <NotLiveYet name="Ambassador applications" /> : <ErrorState cause={status.cause} onRetry={status.reload} />
      ) : !status.data ? (
        <LoadingRows rows={3} height={80} />
      ) : (
        <>
          <Segmented items={TABS} value={tab} onChange={setTab} style={{ marginTop: 14 }} />
          {tab === 'Apply' ? <Apply data={status.data} onChanged={(d) => status.mutate(d)} reload={status.reload} /> : <Recruits data={status.data} />}
          <RecruitedBy />
        </>
      )}
    </Screen>
  );
}

function Apply({ data, onChanged, reload }: { data: AmbassadorProgramme; onChanged: (d: AmbassadorProgramme) => void; reload: () => void }) {
  const { toast } = useApp();
  const app = data.application;
  const [text, setText] = useState(app?.statement ?? '');
  const [editing, setEditing] = useState(!app);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const len = text.trim().length;
  const ok = len >= AMBASSADOR_STATEMENT_MIN && len <= AMBASSADOR_STATEMENT_MAX;
  const st = app ? STATUS[app.status] : null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const a = await ambassadorApi.apply(text.trim());
      tap('success');
      onChanged({ ...data, application: a });
      setEditing(false);
      toast(app ? 'Application updated' : 'Application sent', 'send-check', colors.primary);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    setBusy(true);
    setErr(null);
    try {
      await ambassadorApi.withdraw();
      onChanged({ ...data, application: null });
      setText('');
      setEditing(true);
      reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      {app && st && (
        <Card style={[styles.status, { borderColor: st.color }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={st.icon} size={20} color={st.color} />
            <Text style={[styles.statusLabel, { color: st.color }]}>{st.label}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.meta}>sent {shortTime(app.created_at)}</Text>
          </View>
          <Text style={styles.body}>{st.body}</Text>
          {!!app.review_note && <Text style={styles.note}>“{app.review_note}”</Text>}
          {!editing && <Text style={styles.statement}>{app.statement}</Text>}
        </Card>
      )}
      {data.is_ambassador && data.referral_code && <CodeCard code={data.referral_code} />}

      {editing && !data.is_ambassador ? (
        <>
          <Text style={styles.label}>Why you? ({AMBASSADOR_STATEMENT_MIN}–{AMBASSADOR_STATEMENT_MAX} characters)</Text>
          <TextInput
            style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={AMBASSADOR_STATEMENT_MAX}
            placeholder="What you’d start on campus, who you’d bring in, crews or events you’d run…"
            placeholderTextColor={colors.mute}
            accessibilityLabel="Your statement"
          />
          <Text style={[styles.meta, { textAlign: 'right', color: len && !ok ? colors.coral : colors.dim }]}>{len}/{AMBASSADOR_STATEMENT_MAX}</Text>
          <Button label={busy ? 'Sending…' : app ? 'Update application' : 'Apply'} iconLeft="send" disabled={busy || !ok} onPress={submit} />
          {app && <Text style={styles.link} onPress={() => { setEditing(false); setText(app.statement); }}>Cancel</Text>}
        </>
      ) : (
        app &&
        app.status !== 'approved' && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Edit" variant="secondary" size="md" iconLeft="pencil-outline" onPress={() => setEditing(true)} style={{ flex: 1 }} />
            {app.status === 'pending' && <Button label={busy ? 'Withdrawing…' : 'Withdraw'} variant="secondary" size="md" iconLeft="undo" disabled={busy} onPress={withdraw} style={{ flex: 1 }} />}
          </View>
        )
      )}
      {err && <Text style={styles.err} accessibilityRole="alert">{err}</Text>}
    </View>
  );
}

function CodeCard({ code }: { code: string }) {
  const { toast } = useApp();
  const msg = `Join me on Squirrel Social at IISER Kolkata — use my ambassador code ${code} when you sign up.`;
  return (
    <Card style={{ gap: 10, borderColor: colors.primary }}>
      <Text style={styles.label}>Your recruit code</Text>
      <Text style={styles.code} selectable>{code}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Copy" size="sm" variant="secondary" iconLeft="content-copy" onPress={async () => { await Clipboard.setStringAsync(code); toast('Code copied', 'content-copy', colors.primary); }} style={{ flex: 1 }} />
        <Button label="Share" size="sm" iconLeft="share-variant" onPress={() => Share.share({ message: msg }).catch(() => null)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

function Recruits({ data }: { data: AmbassadorProgramme }) {
  const r = useCampus<RecruitPage>('ambassador:recruits', () => ambassadorApi.recruits(), { enabled: data.is_ambassador, needsAuth: false });
  if (!data.is_ambassador) {
    return (
      <Card style={[styles.box, { marginTop: 14 }]}>
        <Icon name="account-multiple-plus-outline" size={28} color={colors.dim} />
        <Text style={styles.body}>Recruit tracking opens once your application is approved. You’ll get a code, and everyone who joins with it is counted here.</Text>
      </Card>
    );
  }
  return (
    <View style={{ marginTop: 14 }}>
      <Card style={styles.total}>
        <Text style={styles.totalV}>{(r.data?.total ?? data.recruits_count).toLocaleString('en-IN')}</Text>
        <Text style={styles.label}>people recruited</Text>
      </Card>
      {data.referral_code && <View style={{ marginTop: 12 }}><CodeCard code={data.referral_code} /></View>}
      <SectionHeader title="Recruits" />
      {r.error && !r.data ? (
        <ErrorState cause={r.cause} onRetry={r.reload} compact />
      ) : !r.data ? (
        <LoadingRows rows={3} height={52} />
      ) : r.data.items.length ? (
        <View style={{ gap: 8 }}>
          {r.data.items.map((x) => (
            <View key={x.user.id} style={styles.row}>
              <PersonAvatar person={{ user_id: x.user.id, display_name: x.user.display_name, avatar_url: x.user.avatar_url }} size={36} />
              <Text style={styles.name} numberOfLines={1}>{x.user.display_name}</Text>
              <Text style={styles.meta}>{shortTime(x.recruited_at)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.body}>Nobody yet — share your code.</Text>
      )}
    </View>
  );
}

/** "Were you recruited by an ambassador?" — once per account. */
function RecruitedBy() {
  const r = useCampus<Recruiter>('ambassador:recruiter', () => ambassadorApi.myRecruiter(), { needsAuth: false });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!r.data) return null;
  const claim = async () => {
    setBusy(true);
    setErr(null);
    try {
      r.mutate(await ambassadorApi.claimReferral(code));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionHeader title="Recruited by" />
      {r.data.ambassador ? (
        <View style={styles.row}>
          <PersonAvatar person={{ user_id: r.data.ambassador.id, display_name: r.data.ambassador.display_name, avatar_url: r.data.ambassador.avatar_url }} size={36} />
          <Text style={styles.name} numberOfLines={1}>{r.data.ambassador.display_name}</Text>
          {r.data.recruited_at && <Text style={styles.meta}>{shortTime(r.data.recruited_at)}</Text>}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <TextInput style={styles.input} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={16} placeholder="Ambassador code" placeholderTextColor={colors.mute} accessibilityLabel="Ambassador code" />
          <Button label={busy ? 'Saving…' : 'Save'} size="sm" variant="secondary" disabled={busy || code.trim().length < 4} onPress={claim} />
          {err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.dim, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 12 },
  label: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  status: { gap: 8, borderWidth: 1.5 },
  statusLabel: { fontFamily: fonts.labelBold, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' },
  body: { color: colors.sub, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  note: { color: colors.text, fontFamily: fonts.medium, fontSize: 13, fontStyle: 'italic' },
  statement: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  link: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center', paddingVertical: 4 },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13 },
  code: { color: colors.primary, fontFamily: fonts.display, fontSize: 34, letterSpacing: 4 },
  box: { alignItems: 'center', gap: 10, paddingVertical: 22 },
  total: { alignItems: 'center', gap: 2, paddingVertical: 16 },
  totalV: { color: colors.primary, fontFamily: fonts.display, fontSize: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
});
