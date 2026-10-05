/**
 * Partner Hunt building blocks: the person card (anonymous: first name + initial, age band, level,
 * what you share), the "what's in the way" card for each refusal, and option chips built from the
 * server's `options` (labels are never kept in the app).
 */
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { BoardCard, Option, PartnerCard, PartnerOptions } from '@/api/partnerHunt';
import { Button, Card, Icon, PressScale, ProgressBar } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { labelsOf, type BoardBlocker } from '@/logic/partnerHunt';
import { alpha, colors, fonts, radius } from '@/theme';

const LEVEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** One person, as a card. `onPress` opens the buddy screen. No photo before you've both said yes. */
export function PersonCard({ card, options, onPress, right }: { card: PartnerCard | BoardCard; options?: PartnerOptions; onPress?: () => void; right?: React.ReactNode }) {
  const score = 'score' in card ? card.score : null;
  const shared = [...labelsOf(options?.activities, card.shared_activities), ...labelsOf(options?.times, card.shared_times)];
  const body = (
    <View style={styles.card}>
      <View style={styles.initial}>
        <Text style={styles.initialText}>{card.display_name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{card.display_name}</Text>
        <Text style={styles.meta}>{[card.age_band, LEVEL[card.fitness_level] ?? card.fitness_level, card.city].filter(Boolean).join(' · ')}</Text>
        {shared.length > 0 && <Text style={styles.shared} numberOfLines={2}>{shared.join(' · ')}</Text>}
      </View>
      {right ?? (score != null ? <Text style={styles.score} accessibilityLabel={`Match ${score} out of 100`}>{score}</Text> : null)}
    </View>
  );
  return onPress ? (
    <PressScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={`${card.display_name}, ${card.age_band}`}>
      {body}
    </PressScale>
  ) : (
    body
  );
}

/** Multi- or single-select chips from the server's options, in the order given. */
export function OptionChips({ options, selected, onToggle }: { options: Option[]; selected: string[]; onToggle: (key: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <PressScale key={o.key} onPress={() => onToggle(o.key)} style={[styles.chip, on && styles.chipOn]} scaleTo={0.96} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={o.label}>
            <Text style={[styles.chipText, on && { color: colors.onPrimary }]}>{o.label}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

const BLOCKER: Record<BoardBlocker['kind'], { icon: IconName; title: string; body: string; color: string }> = {
  no_profile: { icon: 'account-question', title: 'Finish your profile first', body: 'Partner Hunt uses your training profile. Set it up from the coach, then come back.', color: colors.dim },
  age: { icon: 'card-account-details-outline', title: 'For members 18 and over', body: 'Partner Hunt needs a date of birth on your profile showing you’re 18 or over.', color: colors.dim },
  xp_unavailable: { icon: 'cloud-alert', title: 'Couldn’t check your XP', body: 'That’s on our side, not yours. Try again in a moment.', color: colors.gold },
  xp_locked: { icon: 'lock-outline', title: 'Earn your way in', body: '', color: colors.secondary },
  preferences: { icon: 'tune-variant', title: 'Set your preferences', body: 'You see people who can see you: say what you train, when and where, and turn on “Show me”.', color: colors.primary },
  blocks_unreachable: { icon: 'shield-alert-outline', title: 'Can’t show the board right now', body: 'We couldn’t check who you’ve blocked, so the board is held back. Try again shortly.', color: colors.gold },
  error: { icon: 'alert-circle-outline', title: 'Couldn’t load Partner Hunt', body: '', color: colors.coral },
};

/** What's in the way, with the one thing to do about it. */
export function BlockerCard({ blocker, onRetry }: { blocker: BoardBlocker; onRetry?: () => void }) {
  const u = BLOCKER[blocker.kind];
  const body =
    blocker.kind === 'xp_locked'
      ? `The board opens at ${blocker.minXp} XP${blocker.xp != null ? ` — you have ${blocker.xp}` : ''}. Runs and workouts count. You can set your preferences now, so you’re on boards the moment you’re in.`
      : blocker.kind === 'error'
        ? blocker.message
        : u.body;
  const retry = blocker.kind === 'xp_unavailable' || blocker.kind === 'blocks_unreachable' || blocker.kind === 'error';
  return (
    <Card style={[styles.blocker, { borderColor: alpha(u.color, 0.5) }]}>
      <Icon name={u.icon} size={26} color={u.color} />
      <Text style={styles.blockerTitle}>{u.title}</Text>
      <Text style={styles.blockerBody}>{body}</Text>
      {blocker.kind === 'xp_locked' && blocker.xp != null && <ProgressBar progress={Math.min(1, blocker.xp / Math.max(1, blocker.minXp))} color={colors.secondary} height={8} style={{ alignSelf: 'stretch' }} />}
      {(blocker.kind === 'preferences' || blocker.kind === 'xp_locked') && <Button label={blocker.kind === 'preferences' ? 'Set preferences' : 'Set preferences now'} size="md" variant={blocker.kind === 'preferences' ? 'primary' : 'secondary'} onPress={() => router.push('/partner-hunt/preferences')} style={{ alignSelf: 'stretch' }} />}
      {retry && onRetry && <Button label="Try again" size="md" variant="secondary" iconLeft="refresh" onPress={onRetry} style={{ alignSelf: 'stretch' }} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  initial: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.secondary, 0.12), borderWidth: 1, borderColor: alpha(colors.secondary, 0.4) },
  initialText: { color: colors.secondary, fontFamily: fonts.display, fontSize: 22 },
  name: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 17, letterSpacing: 0.6, textTransform: 'uppercase' },
  meta: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, marginTop: 2 },
  shared: { color: colors.sub, fontFamily: fonts.regular, fontSize: 13, marginTop: 4 },
  score: { color: colors.primary, fontFamily: fonts.display, fontSize: 28, minWidth: 40, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontFamily: fonts.label, fontSize: 14 },
  blocker: { alignItems: 'center', gap: 10, paddingVertical: 20, borderWidth: 1 },
  blockerTitle: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  blockerBody: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
