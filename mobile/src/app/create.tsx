import { StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Mascot } from '@/art/Mascot';
import { Sheet } from '@/components/Sheet';
import { Display, Icon, PressScale, tap } from '@/components/ui';
import type { IconName } from '@/data/icons';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

type Action = { label: string; sub: string; icon: IconName; color: string; go?: Href; mission?: string };

const ACTIONS: Action[] = [
  { label: 'Start a run', sub: 'GPS · live stats', icon: 'run-fast', color: colors.primary, go: '/run' },
  { label: 'Post activity', sub: 'Photo, run or meal', icon: 'image-plus', color: colors.violet, go: '/compose' },
  { label: 'Log water', sub: '+250 ml', icon: 'cup-water', color: colors.secondary, mission: 'm-water' },
  { label: 'Workout', sub: 'Form-coached sets', icon: 'dumbbell', color: colors.gold, go: '/exercise' },
  { label: 'Log a meal', sub: 'Healthy plate', icon: 'food-apple', color: colors.green, mission: 'm-meal' },
  { label: 'Find an event', sub: 'Join the crew', icon: 'calendar-star', color: colors.orange, go: '/events' },
];

/** Central CREATE action sheet. */
export default function Create() {
  const { logMission, toast, missions } = useApp();
  return (
    <Sheet>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Display size={32}>Let's move</Display>
          <Text style={styles.sub}>What are you up to?</Text>
        </View>
        <Mascot pose="cheer" size={86} />
      </View>
      <View style={styles.grid}>
        {ACTIONS.map((a) => (
          <PressScale
            key={a.label}
            style={styles.action}
            onPress={() => {
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
            <View style={[styles.icon, { backgroundColor: `${a.color}22`, borderColor: `${a.color}66` }]}>
              <Icon name={a.icon} size={26} color={a.color} />
            </View>
            <Text style={styles.label}>{a.label}</Text>
            <Text style={styles.actSub}>{a.sub}</Text>
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
  label: { color: colors.text, fontFamily: fonts.bold, fontSize: 12, marginTop: 8, textAlign: 'center' },
  actSub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 10, marginTop: 2, textAlign: 'center' },
});
