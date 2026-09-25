import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ItemArt } from '@/components/cards';
import { Sheet } from '@/components/Sheet';
import { Button, CoinIcon, Display, Icon } from '@/components/ui';
import { rarityColor, shopItemById } from '@/data/shop';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

/** Shop item sheet: preview, rarity, buy / equip. */
export default function ItemSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { owned, equipped, buy, toggleEquip, coins, level, toast, look, setLook, pet, setPet, gear, setGear } = useApp();
  const item = shopItemById(id);
  if (!item) return <Sheet><Text style={{ color: colors.text }}>Item not found.</Text></Sheet>;
  const has = owned.has(item.id);
  const isPet = item.tab === 'Pets';
  const isGear = item.tab === 'Gear';
  const isEquipped = isPet ? pet === item.id : isGear ? gear === item.id : equipped.has(item.id);
  const locked = level < item.levelRequired;
  const short = coins < item.price;
  const rc = rarityColor[item.rarity];

  const onEquip = () => {
    if (isPet) { setPet(isEquipped ? 'pet-none' : item.id); router.back(); return; }
    if (isGear) { setGear(isEquipped ? 'none' : item.id); router.back(); return; }
    if (item.lookPatch && !isEquipped) setLook({ ...look, ...item.lookPatch });
    toggleEquip(item.id);
    router.back();
  };

  const onBuy = () => {
    const r = buy(item.id);
    if (r === 'coins') toast(`You need ${(item.price - coins).toLocaleString('en-IN')} more coins`, 'alert-circle-outline', colors.orange);
    if (r === 'level') toast(`Unlocks at Level ${item.levelRequired}`, 'lock', colors.violet);
  };

  return (
    <Sheet>
      <View style={styles.stage}>
        <LinearGradient colors={[`${rc}40`, 'transparent']} style={StyleSheet.absoluteFill} />
        <ItemArt item={item} size={170} />
        <View style={[styles.rarity, { borderColor: rc }]}>
          <Text style={[styles.rarityText, { color: rc }]}>{item.rarity}</Text>
        </View>
      </View>
      <Display size={30} style={{ marginTop: 14 }}>{item.name}</Display>
      <Text style={styles.desc}>{item.description}</Text>
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <CoinIcon size={16} />
          <Text style={styles.metaText}>{item.price.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.meta}>
          <Icon name="shield-star" size={16} color={colors.violet} />
          <Text style={styles.metaText}>Level {item.levelRequired}+</Text>
        </View>
        <View style={styles.meta}>
          <Icon name="tag-outline" size={16} color={colors.secondary} />
          <Text style={styles.metaText}>{item.category}</Text>
        </View>
      </View>
      {has ? (
        <Button label={isEquipped ? 'Unequip' : 'Equip'} variant={isEquipped ? 'secondary' : 'primary'} iconLeft={isEquipped ? 'close' : 'check'} onPress={onEquip} style={{ marginTop: 18 }} />
      ) : (
        <Button
          label={locked ? `Unlocks at level ${item.levelRequired}` : short ? `Need ${(item.price - coins).toLocaleString('en-IN')} more` : `Unlock for ${item.price.toLocaleString('en-IN')}`}
          iconLeft={locked ? 'lock' : 'lock-open-variant'}
          variant={locked || short ? 'secondary' : 'gold'}
          onPress={onBuy}
          disabled={locked || short}
          style={{ marginTop: 18 }}
        />
      )}
      {!has && short && !locked && <Text style={styles.hint} onPress={() => { router.back(); router.push('/missions'); }}>Earn coins from missions →</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stage: { height: 210, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rarity: { position: 'absolute', top: 12, left: 12, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  rarityText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  desc: { color: colors.sub, fontFamily: fonts.regular, fontSize: 14, marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.line },
  metaText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 12 },
  hint: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center', marginTop: 12 },
});
