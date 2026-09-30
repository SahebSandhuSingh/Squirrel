import type { AccessoryStyle, AvatarLook, BottomStyle, HairStyle, TopStyle } from '@/types';
import { hairColors, skinTones } from '@/art/palette';
import type { IconName } from '@/data/icons';
import { shopItems, type ShopItem } from '@/data/shop';

/**
 * Data-driven avatar catalogs. `shopItems` (src/data/shop.ts) is the single
 * source of truth for anything ownable — it already carries id / name /
 * category / rarity / levelRequired ("unlockCondition") / art (asset) /
 * description, so these are thin, typed selectors over it rather than a
 * duplicate catalog. Swapping this for a backend later just means pointing
 * these selectors at an API response shaped the same way.
 */
export const outfitSets = (): ShopItem[] => shopItems.filter((i) => i.tab === 'Outfits' && i.category === 'Sets');
export const shoeCatalog = (): ShopItem[] => shopItems.filter((i) => i.tab === 'Outfits' && i.category === 'Shoes');
export const gearCatalog = (): ShopItem[] => shopItems.filter((i) => i.tab === 'Gear');
export const accessoryExtras = (): ShopItem[] => shopItems.filter((i) => i.tab === 'Accessories');
export const petCatalog = (): ShopItem[] => shopItems.filter((i) => i.tab === 'Pets');

export type AvatarCategory = 'Body' | 'Hair' | 'Outfit' | 'Shoes' | 'Accessories' | 'Gear' | 'Emotes' | 'Pets';

export const avatarCategories: { id: AvatarCategory; icon: IconName }[] = [
  { id: 'Body', icon: 'face-woman-shimmer' },
  { id: 'Hair', icon: 'hair-dryer' },
  { id: 'Outfit', icon: 'tshirt-crew' },
  { id: 'Shoes', icon: 'shoe-sneaker' },
  { id: 'Accessories', icon: 'sunglasses' },
  { id: 'Gear', icon: 'headphones' },
  { id: 'Emotes', icon: 'emoticon-happy' },
  { id: 'Pets', icon: 'paw' },
];

export const hairStyles: HairStyle[] = ['bun', 'ponytail', 'long', 'bob', 'curly', 'afro', 'short', 'buzz'];
export const topStyles: TopStyle[] = ['crop', 'hoodie', 'tee', 'tank', 'jacket'];
export const bottomStyles: BottomStyle[] = ['joggers', 'leggings', 'shorts'];
export const accessoryStyles: AccessoryStyle[] = ['none', 'shades', 'cap', 'headband', 'headphones'];
export const outfitColors = ['#16101E', '#D7FF1F', '#A855F7', '#FFFFFF', '#5FB8FF', '#FF2D9B', '#3DF0A0', '#FFD21F'];
export const shoeColors = ['#FFFFFF', '#D7FF1F', '#FFFFFF', '#16101E', '#FFD21F', '#A855F7'];
export { hairColors, skinTones };

export const emotes: { id: string; label: string; pose: 'wave' | 'flex' | 'run' | 'yoga' | 'lift' | 'stand' }[] = [
  { id: 'e-wave', label: 'Wave', pose: 'wave' },
  { id: 'e-flex', label: 'Flex', pose: 'flex' },
  { id: 'e-run', label: 'Sprint', pose: 'run' },
  { id: 'e-yoga', label: 'Tree', pose: 'yoga' },
  { id: 'e-lift', label: 'Lift', pose: 'lift' },
  { id: 'e-stand', label: 'Chill', pose: 'stand' },
];

export const pets: { id: string; label: string; pose: 'idle' | 'sit' | 'wave' | 'cheer' }[] = [
  { id: 'pet-none', label: 'None', pose: 'idle' },
  { id: 'pet-nutty', label: 'Nutty', pose: 'sit' },
  { id: 'pet-scout', label: 'Scout', pose: 'wave' },
  { id: 'pet-hype', label: 'Hype', pose: 'cheer' },
];

/** Starter presets shown as the thumbnail row. */
export const presetLooks: AvatarLook[] = [
  { body: 'female', skin: skinTones[2], hair: 'bun', hairColor: hairColors[0], top: 'crop', topColor: '#16101E', bottom: 'joggers', bottomColor: '#1B1524', shoeColor: '#FFFFFF', accessory: 'none' },
  { body: 'female', skin: skinTones[0], hair: 'ponytail', hairColor: hairColors[3], top: 'tank', topColor: '#D7FF1F', bottom: 'leggings', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'headband' },
  { body: 'female', skin: skinTones[4], hair: 'afro', hairColor: hairColors[0], top: 'hoodie', topColor: '#A855F7', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'none' },
  { body: 'male', skin: skinTones[3], hair: 'short', hairColor: hairColors[0], top: 'tee', topColor: '#FFFFFF', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'none' },
  { body: 'male', skin: skinTones[1], hair: 'curly', hairColor: hairColors[1], top: 'jacket', topColor: '#FF2D9B', bottom: 'joggers', bottomColor: '#1B1524', shoeColor: '#D7FF1F', accessory: 'shades' },
  { body: 'male', skin: skinTones[5], hair: 'buzz', hairColor: hairColors[0], top: 'hoodie', topColor: '#D7FF1F', bottom: 'joggers', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'headphones' },
];

/**
 * Named roster for the character rail — reuses the 10-look `demoLooks` set
 * already drawn in art/Character.tsx (was unused elsewhere). Index-matched.
 */
export const characterNames = ['Nova', 'Blaze', 'Coco', 'Ace', 'Rook', 'Storm', 'Juno', 'Kato', 'Mira', 'Dex'];
