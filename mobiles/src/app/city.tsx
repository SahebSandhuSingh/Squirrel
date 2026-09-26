import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Scene } from '@/art/Scene';
import { Sheet } from '@/components/Sheet';
import { Display, Icon, Scrim, tap } from '@/components/ui';
import { cities } from '@/data/cities';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

/** City picker — every city-scoped screen re-derives from the chosen city. */
export default function CityPicker() {
  const { city, setCity } = useApp();
  return (
    <Sheet>
      <Display size={28}>Choose your city</Display>
      <Text style={styles.sub}>Crews, events, the map and your Nearby feed follow the city you pick.</Text>
      <View style={styles.grid}>
        {cities.map((c, i) => {
          const on = c.id === city.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                tap('success');
                if (!on) setCity(c.id);
                router.back();
              }}
              style={[styles.card, on && { borderColor: colors.primary }]}
              accessibilityLabel={c.name}>
              <Scene kind={i % 3 === 0 ? 'city-sunset' : i % 3 === 1 ? 'city-night' : 'city-dawn'} seed={i * 13 + 5} aspect={1.9} style={StyleSheet.absoluteFill} />
              <Scrim strong />
              <View style={styles.label}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.country}>{c.country}</Text>
              </View>
              {on && (
                <View style={styles.check}>
                  <Icon name="check" size={14} color={colors.onPrimary} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 14 },
  card: { width: '48.5%', height: 84, borderRadius: radius.md, overflow: 'hidden', borderWidth: 2, borderColor: colors.line },
  label: { position: 'absolute', left: 10, bottom: 8 },
  name: { color: colors.onImage, fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.4 },
  country: { color: colors.onImageSub, fontFamily: fonts.medium, fontSize: 11 },
  check: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
