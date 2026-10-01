/**
 * NEW CHALLENGE — type (from the backend's list), target (a person or a crew), zone (when the
 * type needs one), and a start time. Validation errors come back from the server and show inline.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { campusApi, errorText, type ChallengeTypeInfo, type Crew, type PersonCard, type Zone } from '@/api/campus';
import { PersonAvatar } from '@/components/campus/PersonAvatar';
import { ErrorState, LoadingRows } from '@/components/campus/States';
import { Button, Header, Icon, PressScale, Screen, Segmented, tap } from '@/components/ui';
import { invalidateCampus, useAction, useCampus, useZones } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, radius } from '@/theme';

/** Next few sensible slots: this evening, tomorrow morning/evening, Saturday morning. */
function slots(): { label: string; at: Date }[] {
  const out: { label: string; at: Date }[] = [];
  const mk = (days: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const now = Date.now();
  const cands = [
    { label: 'Today · 6 PM', at: mk(0, 18) },
    { label: 'Tomorrow · 6:30 AM', at: mk(1, 6, 30) },
    { label: 'Tomorrow · 6 PM', at: mk(1, 18) },
  ];
  const sat = new Date();
  sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
  sat.setHours(7, 0, 0, 0);
  cands.push({ label: `Sat · 7 AM`, at: sat });
  for (const c of cands) if (c.at.getTime() > now + 30 * 60_000) out.push(c);
  return out;
}

export default function NewInvite() {
  const params = useLocalSearchParams<{ userId?: string; zoneId?: string; crewId?: string }>();
  const { toast } = useApp();
  const types = useCampus<ChallengeTypeInfo[]>('challenge-types', () => campusApi.challengeTypes());
  const people = useCampus<PersonCard[]>('people:friends', () => campusApi.suggestedPeople('friends'));
  const crews = useCampus('crews:all:', () => campusApi.crews({ scope: 'all' }));
  const zones = useZones();
  const preset = useCampus(`profile:${params.userId}`, () => campusApi.profile(params.userId!), { enabled: !!params.userId });
  const [typeId, setTypeId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<'user' | 'crew'>(params.crewId ? 'crew' : 'user');
  const [userId, setUserId] = useState<string | null>(params.userId ?? null);
  const [crewId, setCrewId] = useState<string | null>(params.crewId ?? null);
  const [zoneId, setZoneId] = useState<string | null>(params.zoneId || null);
  const times = useMemo(() => slots(), []);
  const [slot, setSlot] = useState(0);
  const [msg, setMsg] = useState('');
  const typeList = types.data ?? [];
  const type = typeList.find((t) => t.id === typeId) ?? (params.zoneId ? typeList.find((t) => t.requires_zone) : typeList[0]) ?? null;
  const allowedTargets = type?.targets ?? ['user', 'crew'];
  const kind = allowedTargets.includes(targetKind) ? targetKind : allowedTargets[0];
  const targetId = kind === 'user' ? userId : crewId;
  const ready = !!type && !!targetId && (!type.requires_zone || !!zoneId) && !!times[slot];
  const create = useAction(() =>
    campusApi.createInvite({
      type: type!.id,
      target: { type: kind, id: targetId! },
      zone_id: type!.requires_zone ? zoneId : null,
      starts_at: times[slot].at.toISOString(),
      message: msg.trim() || undefined,
    }),
  );


  if (!types.data) {
    return (
      <Screen tabBar={false}>
        <Header back title="New challenge" />
        {types.error ? <ErrorState cause={types.cause} onRetry={types.reload} /> : <LoadingRows rows={4} />}
      </Screen>
    );
  }

  const submit = async () => {
    const r = await create.run();
    if (r) {
      invalidateCampus('invites');
      toast(`${r.type_label} sent`, 'sword-cross', colors.secondary);
      router.replace('/invites');
    }
  };

  // Make sure a prefilled person (from a profile) is selectable even if not in suggestions.
  const personList: { user_id: string; display_name: string; avatar_url: string | null }[] = [...(people.data ?? [])];
  if (preset.data && !personList.some((p) => p.user_id === preset.data!.user_id)) personList.unshift(preset.data);

  return (
    <Screen tabBar={false}>
      <Header back title="New challenge" />

      <Text style={styles.label}>Type</Text>
      <View style={{ gap: 8 }}>
        {typeList.map((t) => {
          const on = type?.id === t.id;
          return (
            <PressScale key={t.id} onPress={() => { tap(); setTypeId(t.id); }} style={[styles.opt, on && { borderColor: colors.secondary, backgroundColor: alpha(colors.secondary, 0.08) }]} scaleTo={0.98} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={on ? colors.secondary : colors.dim} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>{t.label}</Text>
                <Text style={styles.optBody}>{t.description}</Text>
              </View>
            </PressScale>
          );
        })}
      </View>

      <Text style={styles.label}>Who</Text>
      {allowedTargets.length > 1 && <Segmented items={['Person', 'Crew'] as const} value={kind === 'user' ? 'Person' : 'Crew'} onChange={(v) => setTargetKind(v === 'Person' ? 'user' : 'crew')} />}
      {kind === 'user' ? (
        people.error && !people.data ? (
          <ErrorState cause={people.cause} onRetry={people.reload} compact />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {personList.map((p) => {
              const on = userId === p.user_id;
              return (
                <PressScale key={p.user_id} onPress={() => { tap(); setUserId(p.user_id); }} style={[styles.person, on && { borderColor: colors.secondary }]} scaleTo={0.95} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={p.display_name}>
                  <PersonAvatar person={p} size={44} link={false} />
                  <Text style={styles.personName} numberOfLines={1}>{p.display_name.split(' ')[0]}</Text>
                </PressScale>
              );
            })}
            {!personList.length && <Text style={styles.optBody}>{people.loading ? 'Loading people…' : 'No suggestions yet.'}</Text>}
          </ScrollView>
        )
      ) : (
        <View style={{ gap: 8 }}>
          {(crews.data?.items ?? []).filter((c: Crew) => c.my_membership == null).map((c: Crew) => {
            const on = crewId === c.id;
            return (
              <PressScale key={c.id} onPress={() => { tap(); setCrewId(c.id); }} style={[styles.opt, on && { borderColor: colors.blue }]} scaleTo={0.98} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Icon name="account-group" size={18} color={c.color ?? colors.blue} />
                <Text style={[styles.optTitle, { flex: 1 }]}>{c.name}</Text>
                <Text style={styles.optBody}>{c.members_count}</Text>
              </PressScale>
            );
          })}
          {crews.error && <ErrorState cause={crews.cause} onRetry={crews.reload} compact />}
        </View>
      )}

      {type?.requires_zone && (
        <>
          <Text style={styles.label}>Zone</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(zones.data ?? []).map((z: Zone) => {
              const on = zoneId === z.id;
              return (
                <PressScale key={z.id} onPress={() => { tap(); setZoneId(z.id); }} style={[styles.chip, on && { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) }]} scaleTo={0.96} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[styles.chipText, on && { color: colors.primary }]}>{z.short_name ?? z.name}</Text>
                </PressScale>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.label}>When</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {times.map((t, i) => (
          <PressScale key={t.label} onPress={() => { tap(); setSlot(i); }} style={[styles.chip, slot === i && { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) }]} scaleTo={0.96} accessibilityRole="radio" accessibilityState={{ selected: slot === i }}>
            <Text style={[styles.chipText, slot === i && { color: colors.primary }]}>{t.label}</Text>
          </PressScale>
        ))}
      </View>

      <Text style={styles.label}>Trash talk (optional)</Text>
      <TextInput style={styles.input} value={msg} onChangeText={setMsg} maxLength={140} placeholder="Keep it friendly 😏" placeholderTextColor={colors.mute} />

      {create.status === 'error' && <Text style={styles.err}>{errorText(create.error)}</Text>}
      <Button label={create.status === 'loading' ? 'Sending…' : 'Send challenge'} iconLeft="sword-cross" variant="accent" disabled={!ready || create.status === 'loading'} onPress={submit} style={{ marginTop: 20 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, padding: 12 },
  optTitle: { color: colors.text, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase' },
  optBody: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  person: { width: 76, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, paddingVertical: 10 },
  personName: { color: colors.sub, fontFamily: fonts.medium, fontSize: 12 },
  chip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card },
  chipText: { color: colors.sub, fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, marginTop: 12 },
});
