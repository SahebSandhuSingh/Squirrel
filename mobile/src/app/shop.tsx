import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { RunnersArt } from '@/components/art';
import { Chips, Coins, Header, Icon, Screen, Segmented, Tagline, tap } from '@/components/ui';
import { shopItems, type ShopItem } from '@/data/mock';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

const TABS = ['Outfits', 'Gear', 'Accessories', 'Stickers'] as const;
const CATS = ['All', 'Hoodies', 'Tees', 'Shoes', 'Bags'] as const;
type Tab = (typeof TABS)[number];
type Cat = (typeof CATS)[number];

/** Shop — spend coins on avatar gear. */
export default function Shop() {
  const { coins, owned, buy } = useApp();
  const [tab, setTab] = useState<Tab>('Outfits');
  const [cat, setCat] = useState<Cat>('All');

  const items = shopItems.filter((i) => i.tab === tab && (cat === 'All' || i.category === cat));

  const onBuy = (item: ShopItem) => {
    tap();
    if (owned.has(item.id)) return;
    if (coins < item.price) {
      Alert.alert('Not enough coins', 'Complete missions to earn more coins.');
      return;
    }
    Alert.alert(`Buy ${item.name}?`, `${item.price.toLocaleString('en-IN')} coins`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Buy', onPress: () => buy(item.id, item.price) },
    ]);
  };

  return (
    <Screen tabBar={false}>
      <Header title="SHOP" back right={<Coins amount={coins} size={18} />} />
      <Segmented items={TABS} value={tab} onChange={setTab} />

      <View style={styles.hero}>
        <RunnersArt height={150} seed={99} />
        <Tagline size={30} style={{ position: 'absolute', left: 16, top: 18 }}>
          WEAR{'\n'}YOUR{'\n'}PROGRESS
        </Tagline>
        <Icon name="tshirt-crew" size={96} color="#1A1020" style={{ position: 'absolute', right: 14, top: 22 }} />
      </View>

      {tab === 'Outfits' && <Chips items={CATS} value={cat} onChange={setCat} />}

      <View style={styles.grid}>
        {items.map((item) => {
          const has = owned.has(item.id);
          return (
            <Pressable key={item.id} onPress={() => onBuy(item)} style={({ pressed }) => [styles.item, { opacity: pressed ? 0.8 : 1 }, has && { borderColor: colors.green }]}>
              <Icon name={item.icon} size={56} color={item.color} />
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {has ? <Text style={styles.owned}>Owned</Text> : <Coins amount={item.price} size={13} />}
            </Pressable>
          );
        })}
        {items.length === 0 && <Text style={styles.empty}>Nothing here yet — check back soon.</Text>}
      </View>

      <Tagline size={22} style={{ textAlign: 'center', marginTop: 12 }}>
        LOOK GOOD. FEEL GOOD.
      </Tagline>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 8 },
  item: { width: '31.5%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', paddingVertical: 12, gap: 4 },
  itemName: { color: colors.dim, fontSize: 11, fontFamily: fonts.medium, paddingHorizontal: 4 },
  owned: { color: colors.green, fontFamily: fonts.bold, fontSize: 13 },
  empty: { color: colors.dim, width: '100%', textAlign: 'center', marginVertical: 20, fontFamily: fonts.regular },
});
