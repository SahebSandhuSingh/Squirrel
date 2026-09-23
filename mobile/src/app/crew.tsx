import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RunnersArt } from '@/components/art';
import { Chips, Header, IconBadge, PillButton, Screen, SearchBar, Tagline } from '@/components/ui';
import { crews } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const SCOPES = ['Nearby', 'Online', 'Campus', 'Interests'] as const;
type Scope = (typeof SCOPES)[number];

/** Find Your Crew — clubs to join. */
export default function Crew() {
  const [scope, setScope] = useState<Scope>('Nearby');
  const [q, setQ] = useState('');
  const { joinedCrews, toggleCrew } = useApp();

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return crews.filter(
      (c) => (scope === 'Nearby' || scope === 'Interests' || c.scope === scope || term) && (!term || c.name.toLowerCase().includes(term) || c.interest.includes(term)),
    );
  }, [scope, q]);

  return (
    <Screen tabBar={false}>
      <Header title="Find Your Crew" back />
      <View style={{ marginTop: 8 }}>
        <SearchBar placeholder="Search clubs (running, gym, yoga...)" value={q} onChangeText={setQ} />
      </View>
      <Chips items={SCOPES} value={scope} onChange={setScope} />

      <View style={{ gap: 10 }}>
        {list.map((c) => (
          <View key={c.id} style={styles.row}>
            <IconBadge icon={c.icon} color="#111" bg={c.color} size={48} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.meta}>{c.members} members</Text>
            </View>
            <PillButton label="Join" activeLabel="Joined" active={joinedCrews.has(c.id)} onPress={() => toggleCrew(c.id)} />
          </View>
        ))}
        {list.length === 0 && <Text style={styles.empty}>No crews match “{q}”. Start one?</Text>}
      </View>

      <View style={styles.banner}>
        <RunnersArt height={160} seed={88} />
        <Tagline size={24} style={{ position: 'absolute', left: 16, top: 18 }}>
          Different routes.{'\n'}Better people.
        </Tagline>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12 },
  name: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  empty: { color: colors.dim, textAlign: 'center', marginVertical: 20, fontFamily: fonts.regular },
  banner: { marginTop: 16, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
});
