import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { Mascot } from '@/art/Mascot';
import { Character } from '@/art/Character';
import { Button, Display, FadeIn, Scrim, Tagline } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH } from '@/theme';

/** Cinematic landing screen. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { look } = useApp();
  const w = Math.min(width, MAX_WIDTH);
  const heroH = Math.min(height * 0.42, 380);
  const logo = Math.min(76, w * 0.19);

  return (
    <View style={styles.root}>
      <Scene kind="city-sunset" seed={7} aspect={width / height} style={StyleSheet.absoluteFill} />
      <Scrim style={{ top: '45%' }} strong />

      <View style={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 18 }]}>
        <FadeIn>
          <Display size={logo} style={styles.logo}>
            Squirrel
          </Display>
          <Tagline size={logo * 0.86} color={colors.pink} rotate={-8} style={{ marginTop: -logo * 0.28, marginLeft: w * 0.16 }}>
            Social
          </Tagline>
        </FadeIn>
        <FadeIn delay={200} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
          <Text style={styles.motto}>MOVE{'\n'}CONNECT{'\n'}GROW</Text>
        </FadeIn>

        <View style={{ flex: 1 }} />

        <FadeIn delay={300} style={[styles.hero, { height: heroH }]}>
          <Character look={look} pose="stand" height={heroH} />
          <Mascot pose="wave" size={heroH * 0.52} animated style={{ marginLeft: -heroH * 0.08, marginBottom: -4 }} />
        </FadeIn>

        <FadeIn delay={450} style={{ gap: 12, marginTop: 8 }}>
          <Button label="Get Started" icon="arrow-right" onPress={() => router.push('/avatar')} />
          <Button label="I already have an account" variant="secondary" size="md" onPress={() => router.replace('/home')} />
          <Text style={styles.foot}>REAL PEOPLE. HEALTHIER DAYS. BIGGER STORIES.</Text>
        </FadeIn>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 22, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  logo: { textShadowColor: 'rgba(255,53,181,0.7)', textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 }, transform: [{ rotate: '-4deg' }], letterSpacing: 1 },
  motto: { textAlign: 'right', color: colors.text, fontFamily: fonts.display, fontSize: 18, lineHeight: 21, letterSpacing: 2.5, transform: [{ rotate: '-4deg' }] },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  foot: { color: colors.dim, textAlign: 'center', fontSize: 11, letterSpacing: 1.4, fontFamily: fonts.semibold, marginTop: 6 },
});
