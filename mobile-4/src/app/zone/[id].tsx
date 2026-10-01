import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CampusMap } from '@/components/campus/CampusMap';
import { SourceBadge } from '@/components/campus/States';
import { ZonePanel } from '@/components/campus/ZonePanel';
import { Header, Screen } from '@/components/ui';
import { useMe, useTerritorySync, useZones } from '@/hooks/useCampus';

/** One zone: its place on the map, owner, status, history and the allowed action. */
export default function ZoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const zones = useZones();
  const me = useMe();
  useTerritorySync();
  return (
    <Screen tabBar={false}>
      <Header back title="Zone" right={<SourceBadge />} />
      {!!zones.data?.length && <CampusMap zones={zones.data} meId={me.data?.user_id ?? null} selectedId={id} interactive={false} style={styles.map} />}
      <View style={{ marginTop: 14 }}>
        <ZonePanel zoneId={id} meId={me.data?.user_id ?? null} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, marginTop: 8 },
});
