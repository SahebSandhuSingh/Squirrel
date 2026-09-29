/**
 * SQUIRREL DATES — a light, optional nudge: "you both know this part of campus". The backend
 * (Dev B) picks who, where and when from real shared zones; this only presents its suggestion.
 * Campus discovery, not a dating app: no photos-first, no romantic framing, one tap to dismiss.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { errorText, featureUnavailable } from '@/api/campus';
import { dismissDateSuggestion, getDateSuggestions, inviteFromSuggestion } from '@/api/campus/discovery';
import type { DateSuggestion, DateSuggestions } from '@/api/campus/types';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { EmptyNote, ErrorState, LoadingRows, NotLiveYet } from '@/components/campus/States';
import { whenText } from '@/components/events/StudyBreak';
import { Button, Icon, SectionHeader, tap } from '@/components/ui';
import { useAction, useCampus } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, radius } from '@/theme';

export function SquirrelDateCard({ s, onGone }: { s: DateSuggestion; onGone: (id: string) => void }) {
  const { toast } = useApp();
  const invite = useAction(() => inviteFromSuggestion(s.id));
  const later = useAction(() => dismissDateSuggestion(s.id));
  const [sent, setSent] = useState(false);
  const first = s.person.display_name.split(' ')[0];
  const doInvite = async () => {
    tap('impact');
    if (await invite.run()) {
      tap('success');
      setSent(true);
      toast(`Invite sent to ${first}`, 'send-check', colors.secondary);
    }
  };
  const dismiss = async () => {
    tap();
    if (await later.run()) onGone(s.id);
  };
  return (
    <View style={styles.card} accessibilityLabel={`Squirrel Date suggestion: ${s.person.display_name}. ${s.reason}`}>
      <View style={styles.head}>
        <Icon name="map-marker-account-outline" size={14} color={colors.secondary} />
        <Text style={styles.kicker}>Squirrel Date</Text>
      </View>
      <Text style={styles.title}>You both know this campus.</Text>

      <View style={styles.person}>
        <PersonAvatar person={s.person} size={48} ring={colors.secondary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{s.person.display_name}</Text>
          {s.person.level != null && <Text style={styles.level}>Level {s.person.level}</Text>}
        </View>
      </View>
      <Text style={styles.reason}>{s.reason}</Text>

      {(s.zone || s.suggested_time) && (
        <View style={styles.suggest}>
          <Text style={styles.suggestK}>Suggested</Text>
          {!!s.zone && <Text style={styles.suggestV} numberOfLines={2}>{s.zone.name}</Text>}
          {!!s.suggested_time && <Text style={styles.suggestT}>{whenText(s.suggested_time)}</Text>}
        </View>
      )}

      <View style={styles.actions}>
        <Button label="View profile" size="sm" onPress={() => router.push({ pathname: '/user/[id]', params: { id: s.person.user_id } })} style={{ flex: 1 }} />
        {s.can_invite && (
          <Button label={sent ? 'Invite sent' : invite.status === 'loading' ? 'Sending…' : 'Invite'} size="sm" variant="secondary" iconLeft={sent ? 'check' : 'send'} disabled={sent || invite.status === 'loading'} onPress={doInvite} style={{ flex: 1 }} />
        )}
      </View>
      <Text style={styles.later} onPress={later.status === 'loading' ? undefined : dismiss} accessibilityRole="button">
        {later.status === 'loading' ? 'Hiding…' : 'Maybe later'}
      </Text>
      {(invite.status === 'error' || later.status === 'error') && <Text style={styles.err}>{errorText(invite.error ?? later.error)}</Text>}
    </View>
  );
}

/** Social tab section: one suggestion at a time; "Not live yet" (layout kept, no actions) until its backend ships. */
export function SquirrelDatesSection() {
  const r = useCampus<DateSuggestions>('dates:suggestions', () => getDateSuggestions());
  const [gone, setGone] = useState<string[]>([]);
  const list = (r.data?.suggestions ?? []).filter((s) => !gone.includes(s.id));
  if (r.data && !r.data.available) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader title="Squirrel Dates" />
      {r.error && !r.data && featureUnavailable(r.cause) ? (
        <NotLiveYet name="Squirrel Dates" compact body="Suggestions for people you share campus spots with switch on once their backend is ready." />
      ) : r.error && !r.data ? (
        <ErrorState cause={r.cause} onRetry={r.reload} compact feature="Squirrel Dates" />
      ) : !r.data ? (
        <LoadingRows rows={1} height={200} />
      ) : list.length === 0 ? (
        <EmptyNote icon="map-search-outline" title="No matches yet." body="Keep exploring campus." />
      ) : (
        <SquirrelDateCard key={list[0].id} s={list[0]} onGone={(id) => setGone((g) => [...g, id])} />
      )}
    </View>
  );
}

/** On someone's profile: shown only when the backend has a suggestion for this person. */
export function ProfileDateSuggestion({ userId }: { userId: string }) {
  const r = useCampus<DateSuggestions>(`dates:for:${userId}`, () => getDateSuggestions(userId));
  const [gone, setGone] = useState(false);
  const s = r.data?.available ? r.data.suggestions[0] : undefined;
  if (!s || gone) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <SquirrelDateCard s={s} onGone={() => setGone(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: alpha(colors.secondary, 0.45), padding: 16, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { color: colors.secondary, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.4, textTransform: 'uppercase' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  level: { color: colors.violet, fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  reason: { color: colors.sub, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  suggest: { gap: 2, backgroundColor: colors.cardHi, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 9 },
  suggestK: { color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  suggestT: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
  suggestV: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  later: { color: colors.dim, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', paddingVertical: 4 },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center' },
});
