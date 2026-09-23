import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CityBackdrop } from '@/components/art';
import { Display, GradientButton, Mascot, OutlineButton, Tagline } from '@/components/ui';
import { colors, fonts } from '@/theme';

/** Welcome / splash screen. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <CityBackdrop height={620} style={StyleSheet.absoluteFill} seed={21} />
      <View style={[styles.content, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 20 }]}>
        <View>
          <Display size={66} style={styles.logo}>SQUIRREL</Display>
          <Tagline size={58} color={colors.pink} rotate={-8} style={{ marginTop: -18, marginLeft: 60 }}>
            Social
          </Tagline>
          <Text style={styles.motto}>MOVE{'\n'}CONNECT{'\n'}GROW</Text>
        </View>

        <View style={styles.hero}>
          <Text style={{ fontSize: 110 }}>🧑🏽‍🦱</Text>
          <Mascot size={120} />
        </View>

        <View style={{ gap: 12 }}>
          <GradientButton label="GET STARTED" icon="arrow-right" onPress={() => router.push('/avatar')} />
          <OutlineButton label="I ALREADY HAVE AN ACCOUNT" onPress={() => router.replace('/home')} />
          <Text style={styles.foot}>REAL PEOPLE. HEALTHIER DAYS. BIGGER STORIES.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  logo: { textShadowColor: colors.pink, textShadowRadius: 18, transform: [{ rotate: '-4deg' }] },
  motto: { alignSelf: 'flex-end', textAlign: 'right', color: colors.text, fontFamily: fonts.script, fontSize: 18, lineHeight: 20, marginTop: 8, transform: [{ rotate: '-6deg' }] },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  foot: { color: colors.dim, textAlign: 'center', fontSize: 11, letterSpacing: 1, fontFamily: fonts.medium, marginTop: 4 },
});
