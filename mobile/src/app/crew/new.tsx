/** CREATE CREW — only offered when the backend's config says crews can be created. */
import { SOCIAL_API_CONFIGURED } from '@/api/social';
import { S_INTERESTS } from '@/api/social/types';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { campusApi, errorText } from '@/api/campus';
import { EmptyNote, ErrorState, LoadingRows } from '@/components/campus/States';
import { Button, Header, Icon, PressScale, Screen, tap } from '@/components/ui';
import { invalidateCampus, useAction, useConfig } from '@/hooks/useCampus';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const COLORS = [colors.primary, colors.secondary, colors.purple, colors.blue, colors.orange, colors.green];
const ICONS = ['run-fast', 'walk', 'weather-night', 'weather-sunset-up', 'shield-account', 'lightning-bolt'] as const;

export default function NewCrew() {
  const config = useConfig();
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [icon, setIcon] = useState<(typeof ICONS)[number]>(ICONS[0]);
  const [interest, setInterest] = useState<string>('running');
  const [meets, setMeets] = useState('');
  const create = useAction(() => campusApi.createCrew({ name: name.trim(), description: desc.trim(), color, icon, interest, meets: meets.trim() || undefined }));

  if (!config.data) {
    return (
      <Screen tabBar={false}>
        <Header back title="New crew" />
        {config.error ? <ErrorState cause={config.cause} onRetry={config.reload} feature="Creating crews" /> : <LoadingRows rows={3} />}
      </Screen>
    );
  }
  if (!config.data.features.create_crew) {
    return (
      <Screen tabBar={false}>
        <Header back title="New crew" />
        <EmptyNote icon="lock-outline" title="Crew creation isn’t open yet" body="Join an existing crew for now — creating your own is coming." action="Browse crews" onAction={() => router.replace('/crews')} />
      </Screen>
    );
  }
  const submit = async () => {
    const r = await create.run();
    if (r) {
      invalidateCampus('crews');
      invalidateCampus('me');
      toast(`${r.name} is live`, 'flag-checkered', colors.primary);
      router.replace({ pathname: '/crew/[id]', params: { id: r.id } });
    }
  };
  return (
    <Screen tabBar={false}>
      <Header back title="New crew" />
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={40} placeholder="e.g. Tapti Trail Blazers" placeholderTextColor={colors.mute} />
      <Text style={styles.label}>What’s it about?</Text>
      <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} maxLength={200} multiline placeholder="When you meet, what you do, who it’s for" placeholderTextColor={colors.mute} />
      <Text style={styles.label}>Activity</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {S_INTERESTS.map((k) => (
          <PressScale key={k} onPress={() => { tap(); setInterest(k); }} style={[styles.chip, interest === k && { borderColor: colors.primary }]} scaleTo={0.95} accessibilityRole="radio" accessibilityState={{ selected: interest === k }}>
            <Text style={[styles.chipText, interest === k && { color: colors.primary }]}>{k}</Text>
          </PressScale>
        ))}
      </View>
      <Text style={styles.label}>When do you meet? (optional)</Text>
      <TextInput style={styles.input} value={meets} onChangeText={setMeets} maxLength={60} placeholder="e.g. Weekdays 6:30 AM, Sports Ground" placeholderTextColor={colors.mute} />
      {/* The Social service has no crew colours or icons; only offer them to a backend that stores them. */}
      {!SOCIAL_API_CONFIGURED && (
        <>
      <Text style={styles.label}>Look</Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {COLORS.map((c) => (
          <PressScale key={c} onPress={() => { tap(); setColor(c); }} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} scaleTo={0.9} accessibilityRole="radio" accessibilityState={{ selected: color === c }} accessibilityLabel={`Colour ${c}`}>
            <View />
          </PressScale>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {ICONS.map((i) => (
          <PressScale key={i} onPress={() => { tap(); setIcon(i); }} style={[styles.iconBtn, icon === i && { borderColor: color }]} scaleTo={0.9} accessibilityRole="radio" accessibilityState={{ selected: icon === i }} accessibilityLabel={i}>
            <Icon name={i} size={22} color={icon === i ? color : colors.dim} />
          </PressScale>
        ))}
      </View>
        </>
      )}
      {create.status === 'error' && <Text style={styles.err}>{errorText(create.error)}</Text>}
      <Button label={create.status === 'loading' ? 'Creating…' : 'Create crew'} iconLeft="flag-plus" disabled={create.status === 'loading' || name.trim().length < 3} onPress={submit} style={{ marginTop: 22 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontFamily: fonts.regular, fontSize: 15 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
  iconBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  chip: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  chipText: { color: colors.sub, fontFamily: fonts.label, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  err: { color: colors.coral, fontFamily: fonts.medium, fontSize: 13, marginTop: 12 },
});
