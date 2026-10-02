import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Character } from '@/art/Character';
import { SceneImage, ShopItemCard } from '@/components/cards';
import { Chips, Coins, FadeIn, Header, Screen, Segmented, Tagline } from '@/components/ui';
import { shopItems, type ShopTab } from '@/data/shop';
import { useApp } from '@/state/AppState';
import { colors, fonts, MAX_WIDTH } from '@/theme';

const TABS: ShopTab[] = ['Outfits', 'Gear', 'Accessories', 'Pets', 'Stickers'];

/** SHOP — gamified cosmetic store. */
export default function Shop() {
  const { width } = useWindowDimensions();
  const { coins, owned, equipped, level, look } = useApp();
  const [tab, setTab] = useState<ShopTab>('Outfits');
  const [cat, setCat] = useState('All');
  const cats = useMemo(() => ['All', ...Array.from(new Set(shopItems.filter((i) => i.tab === tab).map((i) => i.category)))], [tab]);
  const items = shopItems.filter((i) => i.tab === tab && (cat === 'All' || i.category === cat));
  const cols = Math.min(width, MAX_WIDTH) >= 400 ? 3 : 3;
  const cardW = (Math.min(width, MAX_WIDTH) - 32 - (cols - 1) * 10) / cols;

  return (
    <Screen tabBar={false}>
      <Header back title="Shop" right={<Coins amount={coins} size={17} />} />
      <Segmented items={TABS} labels={{ Accessories: 'Extras' }} value={tab} onChange={(t) => { setTab(t); setCat('All'); }} />

      <SceneImage kind="rooftop" seed={99} height={170} scrim={false}>
        <View style={{ position: 'absolute', left: 16, top: 16 }}>
          <Tagline size={30} rotate={-5} color={colors.onImage}>Wear{'\n'}your{'\n'}progress</Tagline>
        </View>
        <View style={{ position: 'absolute', right: 12, bottom: -6 }}>
          <Character look={look} pose="flex" height={176} />
        </View>
        <View style={styles.drop}>
          <Text style={styles.dropText}>NEW DROP · Sunset Collection</Text>
        </View>
      </SceneImage>

      {cats.length > 2 && <Chips items={cats} value={cat} onChange={setCat} />}

      <View style={[styles.grid, cats.length <= 2 && { marginTop: 14 }]}>
        {items.map((it, i) => (
          <FadeIn key={it.id} index={i} style={{ width: cardW }}>
            <ShopItemCard item={it} owned={owned.has(it.id)} equipped={equipped.has(it.id)} locked={level < it.levelRequired && !owned.has(it.id)} onPress={() => router.push({ pathname: '/item/[id]', params: { id: it.id } })} />
          </FadeIn>
        ))}
      </View>

      <Tagline size={22} color={colors.primary} style={{ textAlign: 'center', marginTop: 20 }}>Look good. Feel good.</Tagline>
      <Text style={styles.foot}>Coins come from missions, runs and events. No real money, ever.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  drop: { position: 'absolute', left: 16, bottom: 14, backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  dropText: { color: colors.onSecondary, fontFamily: fonts.black, fontSize: 10, letterSpacing: 0.6 },
  foot: { color: colors.mute, fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
