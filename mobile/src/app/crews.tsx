import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mascot } from '@/art/Mascot';
import { CrewCard, SceneImage } from '@/components/cards';
import { CityChip } from '@/components/TopBar';
import { Chips, EmptyState, FadeIn, Header, Screen, SearchBar, Tagline } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { colors, fonts } from '@/theme';

const SCOPES = ['Nearby', 'Online', 'Campus', 'Interests'] as const;
type Scope = (typeof SCOPES)[number];
const SCOPE_ICONS = { Nearby: 'map-marker-radius', Online: 'web', Campus: 'school', Interests: 'heart-multiple' } as const;

/** FIND YOUR CREW. */
export default function Crews() {
  const { crews, joinedCrews, toggleCrew, city } = useApp();
  const [scope, setScope] = useState<Scope>('Nearby');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return crews
      .filter((c) => (term ? true : scope === 'Interests' ? true : scope === 'Nearby' ? c.scope !== 'Online' : c.scope === scope))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || c.interest.includes(term) || c.tagline.toLowerCase().includes(term))
      .sort((a, b) => (scope === 'Interests' ? a.interest.localeCompare(b.interest) : b.members - a.members));
  }, [crews, scope, q]);

  return (
    <Screen tabBar={false}>
      <Header back title="Find Your Crew" right={<CityChip />} />
      <View style={{ marginTop: 10 }}>
        <SearchBar placeholder="Search clubs (running, gym, yoga...)" value={q} onChangeText={setQ} />
      </View>
      <Chips items={SCOPES} value={scope} onChange={setScope} icons={SCOPE_ICONS} />

      <Text style={styles.count}>
        {list.length} crews {scope === 'Nearby' ? `in ${city.name}` : scope === 'Online' ? 'online' : scope === 'Campus' ? 'on campus' : 'by interest'} · {joinedCrews.size} joined
      </Text>

      <View style={{ gap: 10 }}>
        {list.map((c, i) => (
          <FadeIn key={c.id} index={i}>
            <CrewCard crew={c} joined={joinedCrews.has(c.id)} onToggle={() => toggleCrew(c.id)} />
          </FadeIn>
        ))}
      </View>
      {list.length === 0 && <EmptyState art={<Mascot pose="sit" size={120} />} title="No crews found" body={`Nothing matches “${q}”. Start the first one in ${city.name}!`} action="Start a crew" onAction={() => setQ('')} />}

      <SceneImage kind="crew" seed={88} height={170} style={{ marginTop: 20 }}>
        <Tagline size={26} style={{ position: 'absolute', left: 16, top: 22 }}>
          Different routes.{'\n'}Better people.
        </Tagline>
      </SceneImage>
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { color: colors.dim, fontFamily: fonts.medium, fontSize: 12, marginBottom: 10 },
});
