/**
 * WAITLIST & INVITES — your place in line from the Social service (GET /v1/me/membership) and
 * the community rules (GET /v1/community/config): position, "invite N to skip the line",
 * your referral code, founding badge, who referred you, and claiming a friend's code.
 * Everything shown is the server's; nothing is computed or invented here.
 */
import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { errorText } from '@/api/campus';
import { SOCIAL_API_CONFIGURED, socialApi } from '@/api/social';
import type { SMembership } from '@/api/social/types';
import { useAuth } from '@/auth/AuthProvider';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { ErrorState, LoadingRows, NotConnected } from '@/components/campus/States';
import { Button, Card, Display, FadeIn, Header, Icon, Kicker, ProgressBar, Screen, tap } from '@/components/ui';
import { useCampus, useRefreshOnFocus } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, radius } from '@/theme';

/** The Social service needs your account; `mode` is the source of truth for that. */
function useSocialSession() {
  const { mode } = useAuth();
  return { signedIn: mode === 'live' };
}

export default function Waitlist() {
  const { signedIn } = useSocialSession();
  const live = SOCIAL_API_CONFIGURED && signedIn;
  const membership = useCampus<SMembership>('social:membership', () => socialApi.membership(), { needsAuth: false, enabled: live });
  const config = useCampus('social:community-config', () => socialApi.communityConfig(), { needsAuth: false, enabled: SOCIAL_API_CONFIGURED });
  useRefreshOnFocus(membership.reload);
  const m = membership.data;
  const cfg = config.data;

  return (
    <Screen tabBar={false}>
      <Header back title="" />
      <Kicker>Waitlist & invites</Kicker>
      <Display size={44} style={{ marginTop: 4 }}>
        Skip the <Text style={{ color: colors.primary }}>line</Text>
      </Display>

      {!SOCIAL_API_CONFIGURED ? (
        <NotConnected name="The waitlist" reason="not_configured" body="Your place in line and invites come from the Social service, which isn’t connected to this build yet." />
      ) : !signedIn ? (
        <NotConnected name="The waitlist" reason="signed_out" body="Your place in line and your invite code belong to your account. Sign in to see them." />
      ) : membership.error && !m ? (
        <ErrorState cause={membership.cause} onRetry={membership.reload} title="Couldn’t load your membership" />
      ) : !m ? (
        <LoadingRows rows={3} height={92} style={{ marginTop: 14 }} />
      ) : (
        <View style={{ gap: 12, marginTop: 14 }}>
          <FadeIn>
            <StatusCard m={m} />
          </FadeIn>
          <FadeIn index={1}>
            <ReferralCard m={m} />
          </FadeIn>
          <FadeIn index={2}>
            <CodeCard m={m} />
          </FadeIn>
          {(m.founding || cfg) && (
            <FadeIn index={3}>
              <FoundingCard m={m} first={cfg?.founding_first ?? null} total={cfg?.founding_total ?? null} />
            </FadeIn>
          )}
          {m.referred_by && (
            <FadeIn index={4}>
              <Card style={styles.row}>
                <PersonAvatar person={{ user_id: m.referred_by.id, display_name: m.referred_by.display_name, avatar_url: m.referred_by.avatar_url }} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Invited by</Text>
                  <Text style={styles.name} numberOfLines={1}>{m.referred_by.display_name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>@{m.referred_by.username}</Text>
                </View>
              </Card>
            </FadeIn>
          )}
          {!m.referred_by && (
            <FadeIn index={5}>
              <ClaimCard onClaimed={membership.mutate} />
            </FadeIn>
          )}
          {!m.email_verified && <Text style={styles.hint}>Verify your email to keep your place in line.</Text>}
        </View>
      )}
    </Screen>
  );
}

function StatusCard({ m }: { m: SMembership }) {
  const moved = m.position - m.effective_position;
  return (
    <Card glow={m.admitted ? colors.primary : undefined} style={{ paddingVertical: 18 }}>
      <View style={[styles.pill, { borderColor: alpha(m.admitted ? colors.primary : colors.secondary, 0.6) }]}>
        <Icon name={m.admitted ? 'check-decagram' : 'timer-sand'} size={14} color={m.admitted ? colors.primary : colors.secondary} />
        <Text style={[styles.pillText, { color: m.admitted ? colors.primary : colors.secondary }]}>{m.admitted ? 'You’re in' : 'On the waitlist'}</Text>
      </View>
      <View style={styles.stats}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Your spot</Text>
          <Display size={52} color={m.admitted ? colors.primary : colors.text}>#{m.effective_position.toLocaleString('en-IN')}</Display>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.label}>Joined at</Text>
          <Text style={styles.statValue}>#{m.position.toLocaleString('en-IN')}</Text>
          <Text style={[styles.label, { marginTop: 8 }]}>Members</Text>
          <Text style={styles.statValue}>{m.members_total.toLocaleString('en-IN')}</Text>
        </View>
      </View>
      {moved > 0 && <Text style={styles.sub}>Up {moved.toLocaleString('en-IN')} spot{moved === 1 ? '' : 's'} thanks to your invites.</Text>}
    </Card>
  );
}

function ReferralCard({ m }: { m: SMembership }) {
  const need = m.referrals_to_skip;
  const progress = m.skipped ? 1 : need > 0 ? m.referrals / need : 0;
  return (
    <Card>
      <Text style={styles.cardTitle}>{m.skipped ? 'Line skipped' : `Invite ${need} friend${need === 1 ? '' : 's'} to skip the line`}</Text>
      <ProgressBar progress={progress} color={colors.primary} color2={colors.secondary} height={8} style={{ marginTop: 10 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={styles.sub}>
          {m.referrals}/{need} joined with your code
        </Text>
        {m.skipped && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="rocket-launch" size={14} color={colors.primary} />
            <Text style={[styles.sub, { color: colors.primary }]}>Skipped</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function CodeCard({ m }: { m: SMembership }) {
  const { toast } = useApp();
  const shareText = `Join me on Squirrel — use my invite code ${m.referral_code}${m.invite_url ? `: ${m.invite_url}` : ''}`;
  const copy = async () => {
    tap();
    try {
      await Clipboard.setStringAsync(m.referral_code);
      toast('Invite code copied', 'content-copy', colors.primary);
    } catch {
      toast('Couldn’t copy the code', 'alert-circle-outline', colors.coral);
    }
  };
  const share = async () => {
    tap();
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as (Navigator & { share?: (d: { text: string; url?: string }) => Promise<void> }) | undefined;
      if (nav?.share) {
        await nav.share({ text: shareText, url: m.invite_url ?? undefined }).catch(() => {});
        return;
      }
      try {
        await nav?.clipboard?.writeText(shareText);
        toast('Invite copied — paste it anywhere', 'content-copy', colors.primary);
      } catch {
        toast('Couldn’t share the invite', 'alert-circle-outline', colors.coral);
      }
      return;
    }
    await Share.share({ message: shareText, url: m.invite_url ?? undefined }).catch(() => {});
  };
  return (
    <Card style={{ alignItems: 'center' }}>
      <Text style={styles.label}>Your invite code</Text>
      <Text style={styles.code} selectable accessibilityLabel={`Invite code ${m.referral_code.split('').join(' ')}`}>
        {m.referral_code}
      </Text>
      {m.invite_url ? <Text style={styles.url} numberOfLines={1} selectable>{m.invite_url}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' }}>
        <Button label="Copy" iconLeft="content-copy" variant="secondary" size="md" onPress={copy} style={{ flex: 1 }} />
        <Button label="Share" iconLeft="share-variant" size="md" onPress={share} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

function FoundingCard({ m, first, total }: { m: SMembership; first: number | null; total: number | null }) {
  const f = m.founding;
  const info =
    first !== null && total !== null
      ? `The first ${first.toLocaleString('en-IN')} members get the Founding Squirrel badge${total !== first ? ` · ${total.toLocaleString('en-IN')} founding badges in all` : ''}.`
      : null;
  if (!f && !info) return null;
  return (
    <Card glow={f ? colors.gold : undefined} style={styles.row}>
      <View style={[styles.badge, { backgroundColor: alpha(colors.gold, f ? 0.18 : 0.08) }]}>
        <Icon name={f ? 'medal' : 'medal-outline'} size={28} color={f ? colors.gold : colors.dim} />
      </View>
      <View style={{ flex: 1 }}>
        {f ? (
          <>
            <Text style={[styles.label, { color: colors.gold }]}>{f.title}</Text>
            <Display size={24}>Founding Squirrel #{f.rank.toLocaleString('en-IN')}</Display>
          </>
        ) : (
          <Text style={styles.cardTitle}>Founding Squirrels</Text>
        )}
        {info ? <Text style={[styles.sub, { marginTop: 4 }]}>{info}</Text> : null}
      </View>
    </Card>
  );
}

function ClaimCard({ onClaimed }: { onClaimed: (m: SMembership) => void }) {
  const { toast } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SMembership | null>(null);
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await socialApi.claimReferral(code);
      setResult(r);
      setCode('');
      toast('Invite code applied', 'check-circle', colors.primary);
      onClaimed(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>Have a friend’s code?</Text>
      <Text style={[styles.sub, { marginTop: 4 }]}>Enter it so they get credit for inviting you.</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(null);
          }}
          placeholder="FRIEND’S CODE"
          placeholderTextColor={colors.mute}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={submit}
          editable={!busy}
          style={styles.input}
          accessibilityLabel="Friend’s invite code"
        />
        <Button label={busy ? 'Applying…' : 'Apply'} size="md" onPress={submit} disabled={busy || !code.trim()} />
      </View>
      {error ? <Text style={[styles.sub, { color: colors.coral, marginTop: 8 }]}>{error}</Text> : null}
      {result ? (
        <Text style={[styles.sub, { color: colors.primary, marginTop: 8 }]}>
          Applied{result.referred_by ? ` — invited by ${result.referred_by.display_name}` : ''}. You’re #{result.effective_position.toLocaleString('en-IN')} in line.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  stats: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 4 },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.3 },
  label: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  cardTitle: { color: colors.text, fontFamily: fonts.label, fontSize: 18, letterSpacing: 0.8, textTransform: 'uppercase' },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  sub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  code: { color: colors.primary, fontFamily: fonts.display, fontSize: 44, letterSpacing: 4, marginTop: 4 },
  url: { color: colors.sub, fontFamily: fonts.mono, fontSize: 12, marginTop: 2, maxWidth: '100%' },
  badge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: colors.text, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 2, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  hint: { color: colors.dim, fontSize: 12, textAlign: 'center', marginTop: 4, fontFamily: fonts.regular },
});
