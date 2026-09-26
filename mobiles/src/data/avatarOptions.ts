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
export const outfitColors = ['#16101E', '#2F5BFF', '#7090FF', '#FFFFFF', '#00B2FF', '#FF4D8D', '#12B76A', '#FFB020'];
export const shoeColors = ['#FFFFFF', '#2F5BFF', '#FFFFFF', '#16101E', '#FFB020', '#7090FF'];
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
  { body: 'female', skin: skinTones[0], hair: 'ponytail', hairColor: hairColors[3], top: 'tank', topColor: '#2F5BFF', bottom: 'leggings', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'headband' },
  { body: 'female', skin: skinTones[4], hair: 'afro', hairColor: hairColors[0], top: 'hoodie', topColor: '#7090FF', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'none' },
  { body: 'male', skin: skinTones[3], hair: 'short', hairColor: hairColors[0], top: 'tee', topColor: '#FFFFFF', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'none' },
  { body: 'male', skin: skinTones[1], hair: 'curly', hairColor: hairColors[1], top: 'jacket', topColor: '#FF4D8D', bottom: 'joggers', bottomColor: '#1B1524', shoeColor: '#2F5BFF', accessory: 'shades' },
  { body: 'male', skin: skinTones[5], hair: 'buzz', hairColor: hairColors[0], top: 'hoodie', topColor: '#2F5BFF', bottom: 'joggers', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'headphones' },
];

/**
 * Named roster for the character rail — reuses the 10-look `demoLooks` set
 * already drawn in art/Character.tsx (was unused elsewhere). Index-matched.
 */
export const characterNames = ['Nova', 'Blaze', 'Coco', 'Ace', 'Rook', 'Storm', 'Juno', 'Kato', 'Mira', 'Dex'];
