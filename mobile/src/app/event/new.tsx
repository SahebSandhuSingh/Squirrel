/**
 * CREATE EVENT — a run, walk, study-break walk or other meetup on campus. Behind the Events
 * lock like the rest of Events. Offered only when the backend's config allows it; the server
 * validates everything again (start in the future, title length, capacity).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { campusApi, errorText, type EventType } from '@/api/campus';
import { EmptyNote, ErrorState, LoadingRows } from '@/components/campus/States';
import { FeatureGate, SoonScreen } from '@/components/Locked';
import { Button, Header, PressScale, Screen, tap } from '@/components/ui';
import { invalidateCampus, useAction, useConfig } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { alpha, colors, fonts, radius } from '@/theme';

const TYPES: { id: EventType; label: string; minutes: number }[] = [
  { id: 'run', label: 'Run', minutes: 45 },
  { id: 'walk', label: 'Walk', minutes: 40 },
  { id: 'study_break_walk', label: 'Study-break walk', minutes: 20 },
  { id: 'social', label: 'Hang out', minutes: 60 },
];

/** Sensible next start times: in 30 min, this evening, tomorrow morning and evening. */
function startSlots(): { label: string; at: Date }[] {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const soon = new Date(Math.ceil((Date.now() + 30 * 60_000) / (15 * 60_000)) * 15 * 60_000);
  const c = [
    { label: `Today · ${soon.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`, at: soon },
    { label: 'Today · 6 PM', at: at(0, 18) },
    { label: 'Tomorrow · 6:30 AM', at: at(1, 6, 30) },
    { label: 'Tomorrow · 6 PM', at: at(1, 18) },
  ];
  return c.filter((x, i) => i === 0 || x.at.getTime() > soon.getTime());
}

export default function NewEventRoute() {
  return (
    <FeatureGate feature="events" fallback={<SoonScreen title="Events" body="Creating campus events switches on with Events." onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />}>
      <NewEvent />
    </FeatureGate>
  );
}

function NewEvent() {
  const config = useConfig();
  const { toast } = useApp();
  const slots = useMemo(() => startSlots(), []);
  const [type, setType] = useState(TYPES[0]);
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [desc, setDesc] = useState('');
  const [slot, setSlot] = useState(0);
  const [cap, setCap] = useState('');
  const create = useAction(() => {
    const start = slots[slot].at;
    return campusApi.createEvent({
      title: title.trim(),
      description: desc.trim() || undefined,
      type: type.id,
      venue: venue.trim(),
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + type.minutes * 60_000).toISOString(),
      capacity: cap ? Math.max(2, Math.min(500, parseInt(cap, 10) || 0)) : null,
    });
  });

  if (!config.data) {
    return (
      <Screen tabBar={false}>
        <Header back title="New event" />
        {config.error ? <ErrorState cause={config.cause} onRetry={config.reload} feature="Creating events" /> : <LoadingRows rows={3} />}
      </Screen>
    );
  }
  if (!config.data.features.create_event) {
    return (
      <Screen tabBar={false}>
        <Header back title="New event" />
        <EmptyNote icon="lock-outline" title="Event creation isn’t open yet" body="RSVP to what’s on for now." action="See events" onAction={() => router.replace('/events')} />
      </Screen>
    );
  }
  const submit = async () => {
    const r = await create.run();
    if (r) {
      invalidateCampus('events');
      toast(`${r.title} is on`, 'calendar-check', colors.primary);
      router.replace({ pathname: '/event/[id]', params: { id: r.id } });
    }
  };
  return (
    <Screen tabBar={false}>
      <Header back title="New event" />
      <Text style={styles.label}>What</Text>
      <View style={styles.wrap}>
        {TYPES.map((t) => (
          <Chip key={t.id} on={type.id === t.id} label={t.label} onPress={() => setType(t)} />
        ))}
      </View>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={80} placeholder={type.id === 'study_break_walk' ? 'e.g. 20-min walk round the lake' : 'e.g. Easy 5K round campus'} placeholderTextColor={colors.mute} />
      <Text style={styles.label}>Where</Text>
      <TextInput style={styles.input} value={venue} onChangeText={setVenue} maxLength={80} placeholder="Meeting point, e.g. Main gate" placeholderTextColor={colors.mute} />
      <Text style={styles.label}>When · {type.minutes} min</Text>
      <View style={styles.wrap}>
        {slots.map((s, i) => (
          <Chip key={s.label} on={slot === i} label={s.label} onPress={() => setSlot(i)} />
        ))}
      </View>
      <Text style={styles.label}>Details (optional)</Text>
      <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} maxLength={500} multiline placeholder="Pace, what to bring, who it’s for" placeholderTextColor={colors.mute} />
      <Text style={styles.label}>Spots (optional)</Text>
      <TextInput style={styles.input} value={cap} onChangeText={(v) => setCap(v.replace(/\D/g, ''))} maxLength={3} keyboardType="number-pad" placeholder="No limit" placeholderTextColor={colors.mute} />
      {create.status === 'error' && <Text style={styles.err}>{errorText(create.error)}</Text>}
      <Button label={create.status === 'loading' ? 'Creating…' : 'Create event'} iconLeft="calendar-plus" disabled={create.status === 'loading' || title.trim().length < 3} onPress={submit} style={{ marginTop: 22 }} />
    </Screen>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <PressScale onPress={() => { tap(); onPress(); }} style={[styles.chip, on && { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) }]} scaleTo={0.96} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: colors.primary }]}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  chip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card },
  chipText: { color: colors.sub, fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, marginTop: 12 },
});
