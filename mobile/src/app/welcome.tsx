/**
 * WELCOME — IISER-first launch. Live counters (users, zones, crews) come from
 * GET /v1/campus/stats and update over the realtime channel; nothing is hardcoded. When the
 * backend isn't reachable the counters are simply hidden.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Scene } from '@/art/Scene';
import { Mascot } from '@/art/Mascot';
import { campusApi, type LaunchStats } from '@/api/campus';
import { useAuth } from '@/auth/AuthProvider';
import { Tape, Wordmark } from '@/components/Brand';
import { CampusMap } from '@/components/campus/CampusMap';
import { SourceBadge } from '@/components/campus/States';
import { AnimatedNumber, Button, Display, FadeIn, Icon, Pulse, Scrim, Tagline } from '@/components/ui';
import { useCampus, useConfig, useRealtime, useZones } from '@/hooks/useCampus';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { continueDemo } = useAuth();
  const config = useConfig();
  const zones = useZones();
  const stats = useCampus<LaunchStats>('stats', () => campusApi.stats(), { needsAuth: false });
  const [pushed, setPushed] = useState<LaunchStats | null>(null);
  useRealtime((m) => {
    if (m.type === 'stats.updated') setPushed(m.data);
  });
  const s = pushed && (!stats.data || pushed.updated_at >= stats.data.updated_at) ? pushed : stats.data;
  const campusName = config.data?.campus.name ?? 'IISER Kolkata';
  const domain = config.data?.campus.email_domains[0] ?? null;
  const h1 = Math.min(58, width * 0.13, height * 0.07);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Scene kind="city-night" seed={21} aspect={width / height} style={StyleSheet.absoluteFill} />
      <Scrim style={{ top: '20%' }} strong />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,6,6,0.45)' }]} />

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18 }]} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark size={28} showLogo={false} color={colors.onImage} />
          <SourceBadge />
        </View>

        <FadeIn style={{ marginTop: 18 }}>
          <View style={styles.livePill}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }}>
              <Pulse size={8} color={colors.green} />
            </View>
            <Text style={styles.liveText}>Live now</Text>
          </View>
          <Display size={h1} color={colors.onImage} style={styles.l1}>Live at</Display>
          <Display size={h1} color={colors.primary} style={styles.l2}>{campusName}</Display>
          <Text style={styles.sub}>MOVE · DISCOVER PEOPLE · CLAIM TERRITORY · JOIN CREWS · MEET IRL</Text>
          <Text style={styles.body}>A private social network for {campusName} — only people with a verified {domain ? `@${domain}` : '.ac.in'} email get in.</Text>
        </FadeIn>

        {/* Live counters — only real numbers from the backend */}
        {s ? (
          <FadeIn delay={120} style={styles.counters}>
            <Counter value={s.users_total} label="Squirrels" icon="account-group" />
            <Counter value={s.zones_claimed} label={`of ${s.zones_total} zones held`} icon="map-marker-radius" color={colors.secondary} />
            <Counter value={s.crews_total} label="Crews" icon="flag-variant" color={colors.gold} />
          </FadeIn>
        ) : stats.loading ? (
          <View style={styles.counters}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.counter, { opacity: 0.4 }]}>
                <Text style={styles.counterV}>—</Text>
                <Text style={styles.counterL}>loading</Text>
              </View>
            ))}
          </View>
        ) : null}
        {s && s.users_active_now > 0 && (
          <Text style={styles.activeNow}>
            <Text style={{ color: colors.green }}>● </Text>
            {s.users_active_now} moving on campus right now
          </Text>
        )}

        {/* Campus map visual */}
        {!!zones.data?.length && (
          <FadeIn delay={200}>
            <CampusMap zones={zones.data} meId={null} interactive={false} style={styles.map} />
          </FadeIn>
        )}

        {/* Founding Squirrel */}
        <FadeIn delay={260} style={styles.founding}>
          <Mascot pose="cheer" size={78} animated />
          <View style={{ flex: 1 }}>
            <Text style={styles.foundTitle}>Be a Founding Squirrel</Text>
            <Text style={styles.foundBody}>
              Join the first wave at {campusName} and keep the Founding Squirrel badge forever.
              {s?.founding_spots_left != null ? ` ${s.founding_spots_left} spots left.` : ''}
            </Text>
          </View>
        </FadeIn>

        <Tape items={['IISER only', 'Every run leaves a mark', 'Claim your hostel', 'Meet IRL']} style={{ marginTop: 18, marginHorizontal: -22 }} />

        <FadeIn delay={380} style={{ gap: 10, marginTop: 18 }}>
          <Button label={`Join with your ${domain ? `@${domain}` : '.ac.in'} email`} iconLeft="email-check-outline" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'join' } })} />
          <Button label="I already have an account" variant="secondary" size="md" onPress={() => router.push('/sign-in')} />
          <Text
            style={styles.demo}
            onPress={() => {
              continueDemo();
              router.push('/onboarding');
            }}
            accessibilityRole="button">
            Just looking? Explore the demo →
          </Text>
          <Tagline size={15} color={colors.onImage} rotate={-3} style={{ alignSelf: 'center', marginTop: 4 }}>Same campus. New people.</Tagline>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

function Counter({ value, label, icon, color = colors.primary }: { value: number; label: string; icon: React.ComponentProps<typeof Icon>['name']; color?: string }) {
  return (
    <View style={styles.counter} accessibilityLabel={`${value} ${label}`}>
      <Icon name={icon} size={16} color={color} />
      <AnimatedNumber value={value} style={styles.counterV} />
      <Text style={styles.counterL} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  content: { paddingHorizontal: 22, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.imageChip, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(61,240,160,0.5)', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  liveText: { color: colors.green, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  l1: { transform: [{ rotate: '-3deg' }] },
  l2: { transform: [{ rotate: '-3deg' }], marginTop: -4 },
  sub: { color: colors.onImage, fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1, marginTop: 14 },
  body: { color: colors.onImageSub, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 6 },
  counters: { flexDirection: 'row', gap: 8, marginTop: 18 },
  counter: { flex: 1, backgroundColor: colors.glass, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 8, gap: 2 },
  counterV: { color: colors.text, fontFamily: fonts.display, fontSize: 28 },
  counterL: { color: colors.dim, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  activeNow: { color: colors.onImageSub, fontFamily: fonts.mono, fontSize: 12, marginTop: 10 },
  map: { height: 210, marginTop: 16 },
  founding: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, padding: 12 },
  foundTitle: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 0.8, textTransform: 'uppercase' },
  foundBody: { color: colors.onImageSub, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  demo: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', marginTop: 4, paddingVertical: 6 },
});
