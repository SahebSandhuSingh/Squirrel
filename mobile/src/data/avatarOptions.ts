import type { AccessoryStyle, AvatarLook, BottomStyle, HairStyle, TopStyle } from '@/types';
import { hairColors, skinTones } from '@/art/palette';
import type { IconName } from '@/data/icons';

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
export const outfitColors = ['#16101E', '#FF35B5', '#8A3FFC', '#35DFFF', '#FFFFFF', '#FF7A45', '#3DF0A0', '#FFD43B'];
export const shoeColors = ['#FFFFFF', '#FF35B5', '#35DFFF', '#16101E', '#FFD43B', '#8A3FFC'];
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
  { body: 'female', skin: skinTones[0], hair: 'ponytail', hairColor: hairColors[3], top: 'tank', topColor: '#FF35B5', bottom: 'leggings', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'headband' },
  { body: 'female', skin: skinTones[4], hair: 'afro', hairColor: hairColors[0], top: 'hoodie', topColor: '#8A3FFC', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#35DFFF', accessory: 'none' },
  { body: 'male', skin: skinTones[3], hair: 'short', hairColor: hairColors[0], top: 'tee', topColor: '#35DFFF', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'none' },
  { body: 'male', skin: skinTones[1], hair: 'curly', hairColor: hairColors[1], top: 'jacket', topColor: '#FF7A45', bottom: 'joggers', bottomColor: '#1B1524', shoeColor: '#FF35B5', accessory: 'shades' },
  { body: 'male', skin: skinTones[5], hair: 'buzz', hairColor: hairColors[0], top: 'hoodie', topColor: '#FF35B5', bottom: 'joggers', bottomColor: '#16101E', shoeColor: '#FFFFFF', accessory: 'headphones' },
];
