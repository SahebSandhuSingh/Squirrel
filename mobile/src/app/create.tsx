import { useLocks } from '@/components/Locked';
import { isLocked, type Feature } from '@/data/features';
import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Sheet } from '@/components/Sheet';
import { Display, Icon, PressScale, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

type Action = { label: string; sub: string; icon: IconName; color: string; go?: Href; mission?: string; locked?: Feature };

const ACTIONS: Action[] = [
  { label: 'Start a run', sub: 'GPS · live stats', icon: 'run-fast', color: colors.primary, go: '/run' },
  { label: 'Post activity', sub: 'Photo or run', icon: 'image-plus', color: colors.violet, go: '/compose' },
  { label: 'Log water', sub: '+250 ml', icon: 'cup-water', color: colors.secondary, mission: 'm-water', locked: 'mealWater' },
  { label: 'Log workout', sub: '+1 squat set', icon: 'arm-flex', color: colors.gold, mission: 'm-squats' },
  { label: 'Log a meal', sub: 'Healthy plate', icon: 'food-apple', color: colors.green, mission: 'm-meal', locked: 'mealWater' },
  { label: 'Find an event', sub: 'Join the crew', icon: 'calendar-star', color: colors.orange, go: '/events', locked: 'events' },
];

const lockedAction = (a: Action) => !!a.locked && isLocked(a.locked);

/** Central CREATE action sheet. */
export default function Create() {
  const { logMission, toast, missions } = useApp();
  const locks = useLocks();
  return (
    <Sheet>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Display size={32}>Let's move</Display>
          <Text style={styles.sub}>What are you up to?</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {ACTIONS.map((a) => (
          <PressScale
            key={a.label}
            style={styles.action}
            accessibilityLabel={lockedAction(a) ? `${a.label}, coming soon` : a.label}
            onPress={() => {
              if (lockedAction(a)) {
                locks.notify(a.locked!);
                return;
              }
              if (a.mission) {
                const m = missions.find((x) => x.id === a.mission);
                if (m && m.current >= m.goal) toast(`${m.title} already done today`, 'check-circle', colors.green);
                else {
                  tap('success');
                  logMission(a.mission);
                  if (m) toast(`${a.label} logged · ${m.title}`, a.icon, a.color);
                }
                router.back();
              } else if (a.go) {
                router.back();
                router.push(a.go);
              }
            }}>
            <View style={[styles.icon, lockedAction(a) ? styles.iconLocked : { backgroundColor: `${a.color}22`, borderColor: `${a.color}66` }]}>
              <Icon name={a.icon} size={26} color={lockedAction(a) ? colors.mute : a.color} />
              {lockedAction(a) && (
                <View style={styles.lockBadge}>
                  <Icon name="lock" size={11} color={colors.onPrimary} />
                </View>
              )}
            </View>
            <Text style={[styles.label, lockedAction(a) && { color: colors.dim }]}>{a.label}</Text>
            <Text style={styles.actSub}>{lockedAction(a) ? 'Coming soon' : a.sub}</Text>
          </PressScale>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { color: colors.dim, fontFamily: fonts.medium, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 12 },
  action: { width: '31.5%', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: 14, paddingHorizontal: 4 },
  icon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  iconLocked: { backgroundColor: colors.cardHi, borderColor: colors.line },
  lockBadge: { position: 'absolute', right: -5, top: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.dim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  label: { color: colors.text, fontFamily: fonts.bold, fontSize: 12, marginTop: 8, textAlign: 'center' },
  actSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 10, marginTop: 2, textAlign: 'center' },
});
