import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Header, Icon, IconButton, PillButton, Screen, Segmented } from '@/components/ui';
import { avatars, events } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Nearby', 'Online', 'My Events'] as const;
type Tab = (typeof TABS)[number];

/** Events — nearby, online, and the ones you've joined. */
export default function Events() {
  const [tab, setTab] = useState<Tab>('Nearby');
  const { joinedEvents, toggleEvent } = useApp();

  const list = events.filter((e) => (tab === 'My Events' ? joinedEvents.has(e.id) : tab === 'Online' ? e.online : !e.online));

  return (
    <Screen tabBar={false}>
      <Header title="Events" back right={<IconButton icon="plus" size={28} />} />
      <Segmented items={TABS} value={tab} onChange={setTab} activeColor={colors.blue} />

      <View style={{ gap: 10 }}>
        {list.map((e) => {
          const going = joinedEvents.has(e.id);
          return (
            <View key={e.id} style={styles.row}>
              <LinearGradient colors={e.colors} style={styles.thumb}>
                <Icon name={e.icon} size={34} color="rgba(255,255,255,0.9)" />
                <View style={styles.faces}>
                  {avatars.slice(0, 3).map((a, i) => (
                    <View key={i} style={[styles.face, { marginLeft: i ? -8 : 0 }]}>
                      <Text style={{ fontSize: 12 }}>{a}</Text>
                    </View>
                  ))}
                  <Text style={styles.more}>+{e.going + (going ? 1 : 0)}</Text>
                </View>
              </LinearGradient>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.title}>{e.title}</Text>
                <Text style={styles.meta}>{e.place}</Text>
                <Text style={styles.meta}>{e.when}</Text>
                <View style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                  <PillButton label="Join" activeLabel="Going ✓" active={going} onPress={() => toggleEvent(e.id)} />
                </View>
              </View>
            </View>
          );
        })}
        {list.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Icon name="calendar-blank-outline" size={40} color={colors.mute} />
            <Text style={styles.empty}>You haven't joined any events yet.</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10 },
  thumb: { width: 120, height: 104, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  faces: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center' },
  face: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cardHi, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  more: { color: '#fff', fontFamily: fonts.bold, fontSize: 11, marginLeft: 4 },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  meta: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  empty: { color: colors.dim, marginTop: 10, fontFamily: fonts.regular },
});
