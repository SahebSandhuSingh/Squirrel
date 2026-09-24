import type { ProductKind, StickerKind } from '@/types';

export type ShopTab = 'Outfits' | 'Gear' | 'Accessories' | 'Stickers';
export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export type ShopItem = {
  id: string;
  name: string;
  tab: ShopTab;
  /** Sub-filter chip inside a tab (e.g. Hoodies, Tees). */
  category: string;
  price: number;
  rarity: Rarity;
  levelRequired: number;
  art: { type: 'product'; kind: ProductKind; color?: string; accent?: string } | { type: 'sticker'; kind: StickerKind };
  description: string;
};

const p = (id: string, name: string, tab: ShopTab, category: string, kind: ProductKind, price: number, rarity: Rarity, levelRequired: number, color: string | undefined, accent: string | undefined, description: string): ShopItem => ({
  id, name, tab, category, price, rarity, levelRequired, art: { type: 'product', kind, color, accent }, description,
});
const s = (id: string, name: string, kind: StickerKind, price: number, rarity: Rarity): ShopItem => ({
  id, name, tab: 'Stickers', category: 'Stickers', price, rarity, levelRequired: 1, art: { type: 'sticker', kind }, description: 'Slap it on posts, stories and your profile.',
});

export const shopItems: ShopItem[] = [
  p('h-night', 'Night Shift Hoodie', 'Outfits', 'Hoodies', 'hoodie', 1200, 'Rare', 5, '#16101E', '#FF35B5', 'Heavyweight black hoodie with the neon tail mark.'),
  p('h-cloud', 'Cloud Nine Hoodie', 'Outfits', 'Hoodies', 'hoodie', 1500, 'Epic', 10, '#F4ECF8', '#8A3FFC', 'Brushed fleece in cloud white. Purple drawcords.'),
  p('h-sunset', 'Sunset Hoodie', 'Outfits', 'Hoodies', 'hoodie', 2200, 'Legendary', 15, '#FF7A45', '#FFD43B', 'Unlocked by the most consistent squirrels.'),
  p('t-neon', 'Neon Tee', 'Outfits', 'Tees', 'tee', 600, 'Common', 1, '#FF35B5', '#FFFFFF', 'Breathable run tee.'),
  p('t-cyan', 'Cyan Split Tee', 'Outfits', 'Tees', 'tee', 700, 'Common', 3, '#35DFFF', '#16101E', 'Two-tone training tee.'),
  p('t-tank', 'Tempo Tank', 'Outfits', 'Tees', 'tank', 550, 'Common', 1, '#16101E', '#35DFFF', 'For hot-weather tempo runs.'),
  p('j-bomber', 'Afterglow Bomber', 'Outfits', 'Jackets', 'jacket', 1800, 'Epic', 12, '#8A3FFC', '#FF35B5', 'Satin bomber with reflective trim.'),
  p('b-joggers', 'Cargo Joggers', 'Outfits', 'Bottoms', 'joggers', 1500, 'Rare', 6, '#1B1524', '#FF35B5', 'Tapered joggers with zip pockets.'),
  p('b-shorts', 'Split Shorts', 'Outfits', 'Bottoms', 'shorts', 650, 'Common', 2, '#16101E', '#FF7A45', '5" race shorts.'),
  p('s-aero', 'Aero Runners', 'Outfits', 'Shoes', 'shoes', 1000, 'Rare', 4, '#FFFFFF', '#FF35B5', 'Light, bouncy daily trainers.'),
  p('s-high', 'Court Hightops', 'Outfits', 'Shoes', 'hightops', 1400, 'Epic', 9, '#16101E', '#35DFFF', 'Streetwear hightops for rest days.'),
  p('g-duffel', 'Gym Duffel', 'Gear', 'Bags', 'bag', 1200, 'Rare', 5, '#FF4F6E', '#16101E', 'Fits shoes, towel and snacks.'),
  p('g-pack', 'Trail Pack', 'Gear', 'Bags', 'backpack', 1300, 'Rare', 7, '#16101E', '#FF35B5', 'Hydration-ready run pack.'),
  p('g-bottle', 'Neon Bottle', 'Gear', 'Hydration', 'bottle', 600, 'Common', 1, '#35DFFF', '#FF35B5', '1L insulated bottle.'),
  p('g-watch', 'Pulse Watch', 'Gear', 'Tech', 'watch', 700, 'Rare', 3, '#C9C9D6', '#FF35B5', 'Tracks every step (in-game).'),
  p('g-buds', 'Beat Buds', 'Gear', 'Tech', 'earbuds', 900, 'Rare', 6, '#FFFFFF', '#8A3FFC', 'For the one-more-km playlist.'),
  p('g-gloves', 'Grip Gloves', 'Gear', 'Training', 'gloves', 450, 'Common', 2, '#16101E', '#FFD43B', 'Lifting gloves with wrist wrap.'),
  p('g-mat', 'Flow Mat', 'Gear', 'Training', 'mat', 800, 'Common', 3, '#B57BFF', '#16101E', 'Grippy yoga mat.'),
  p('a-shades', 'Pink Shades', 'Accessories', 'Eyewear', 'sunglasses', 400, 'Common', 1, '#FF35B5', '#35DFFF', 'The signature squirrel look.'),
  p('a-cap', 'Squirrel Cap', 'Accessories', 'Headwear', 'cap', 800, 'Rare', 4, '#FF4F6E', '#FFFFFF', 'Curved brim, tail logo.'),
  p('a-beanie', 'Night Beanie', 'Accessories', 'Headwear', 'beanie', 500, 'Common', 2, '#8A3FFC', '#FF35B5', 'For 5 AM winter runs.'),
  p('a-band', 'Sweatband', 'Accessories', 'Headwear', 'headband', 300, 'Common', 1, '#FF35B5', '#FFFFFF', 'Retro terry headband.'),
  p('a-socks', 'Stripe Socks', 'Accessories', 'Socks', 'socks', 250, 'Common', 1, '#FFFFFF', '#FF35B5', 'Crew socks, double stripe.'),
  s('st-nodays', 'No Days Off', 'no-days-off', 150, 'Common'),
  s('st-flex', 'Squirrel Flex', 'squirrel-flex', 250, 'Rare'),
  s('st-heart', 'Neon Heart', 'neon-heart', 150, 'Common'),
  s('st-crown', 'Crown', 'crown', 300, 'Epic'),
  s('st-fire', 'On Fire', 'fire', 150, 'Common'),
  s('st-vibes', 'Good Vibes', 'good-vibes', 200, 'Rare'),
  s('st-km', 'One More KM', 'one-more-km', 250, 'Rare'),
  s('st-hydrate', 'Hydrate', 'hydrate', 150, 'Common'),
];

export const STARTER_OWNED = ['t-neon', 'a-shades', 's-aero', 'st-heart'];

export const rarityColor: Record<Rarity, string> = {
  Common: '#9A8CAE',
  Rare: '#35DFFF',
  Epic: '#B57BFF',
  Legendary: '#FFD43B',
};

export const shopItemById = (id: string) => shopItems.find((i) => i.id === id);
