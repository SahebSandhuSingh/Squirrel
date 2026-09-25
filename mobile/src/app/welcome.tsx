import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { Mascot } from '@/art/Mascot';
import { Character } from '@/art/Character';
import { Tape, Wordmark } from '@/components/Brand';
import { Button, Display, FadeIn, Scrim, Tagline } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH } from '@/theme';

/** Landing screen, styled after the website hero ("Fitness hits different together"). */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { look } = useApp();
  const { continueDemo } = useAuth();
  const w = Math.min(width, MAX_WIDTH);
  const heroH = Math.max(130, Math.min(height * 0.24, 300));
  const h1 = Math.min(56, w * 0.13, height * 0.065);

  return (
    <View style={styles.root}>
      <Scene kind="city-sunset" seed={7} aspect={width / height} style={StyleSheet.absoluteFill} />
      <Scrim style={{ top: '38%' }} strong />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,6,6,0.35)' }]} />

      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 8 }]}>
        <Wordmark size={30} />

        <FadeIn style={{ marginTop: 16 }}>
          <Display size={h1} style={styles.l1}>Fitness</Display>
          <Display size={h1 * 0.78} color={colors.primary} style={styles.l2}>Hits different</Display>
          <Display size={h1} color={colors.secondary} style={styles.l3}>Together</Display>
        </FadeIn>
        <FadeIn delay={180}>
          <Text style={styles.sub}>YOUR CITY IS YOUR PLAYGROUND.</Text>
          <Text style={styles.mono}>Move. Challenge friends. Claim your territory.</Text>
        </FadeIn>

        <View style={{ flex: 1 }} />

        <FadeIn delay={300} style={[styles.hero, { height: heroH }]}>
          <Tagline size={15} style={styles.scribble}>Same parks.{'\n'}Different people.</Tagline>
          <Character look={look} pose="stand" height={heroH} />
          <Mascot pose="wave" size={heroH * 0.52} animated style={{ marginLeft: -heroH * 0.08, marginBottom: -4 }} />
        </FadeIn>
      </View>

      <Tape items={['Touch grass (literally)', 'No gym-bro energy', 'Every run leaves a mark', 'Move play connect']} style={{ marginBottom: 14 }} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <FadeIn delay={450} style={{ gap: 12 }}>
          <Button label="Get started" icon="arrow-right" onPress={() => { continueDemo(); router.push('/avatar'); }} />
          <Button label="I already have an account" variant="secondary" size="md" onPress={() => router.push('/sign-in')} />
          <Text style={styles.foot}>free to join · takes 10 sec · zero gym-bro energy required</Text>
        </FadeIn>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 22, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  bottom: { paddingHorizontal: 22, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  l1: { transform: [{ rotate: '-3deg' }] },
  l2: { transform: [{ rotate: '-5deg' }], marginTop: -4 },
  l3: { transform: [{ rotate: '-3deg' }], marginTop: -2 },
  sub: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 18, letterSpacing: 1, marginTop: 16 },
  mono: { color: colors.sub, fontFamily: fonts.mono, fontSize: 12, marginTop: 4 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  scribble: { position: 'absolute', right: 0, top: 0, textAlign: 'right' },
  foot: { color: colors.dim, textAlign: 'center', fontSize: 11, fontFamily: fonts.mono, marginTop: 2 },
});
