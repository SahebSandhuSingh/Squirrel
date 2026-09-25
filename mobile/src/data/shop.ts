import { art } from '@/art/palette';
import type { AvatarLook, MascotAccessory, MascotPose, ProductKind, StickerKind } from '@/types';

export type ShopTab = 'Outfits' | 'Gear' | 'Accessories' | 'Pets' | 'Stickers';
export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

/** Thematic tag shown on Outfit "sets" in the avatar builder — Athletic, Streetwear, etc. */
export type OutfitTag = 'Athletic' | 'Streetwear' | 'Running' | 'Gym' | 'Basketball' | 'Football' | 'Casual' | 'Night workout' | 'Winter' | 'Limited Edition';

export type ShopItem = {
  id: string;
  name: string;
  tab: ShopTab;
  /** Sub-filter chip inside a tab (e.g. Hoodies, Tees). */
  category: string;
  /** Outfit-set theme, only set on tab: 'Outfits' set items. */
  styleTag?: OutfitTag;
  price: number;
  rarity: Rarity;
  levelRequired: number;
  art:
    | { type: 'product'; kind: ProductKind; color?: string; accent?: string }
    | { type: 'sticker'; kind: StickerKind }
    | { type: 'pet'; pose: MascotPose; accessory?: MascotAccessory; glow: string };
  description: string;
  /** For outfit-set / shoe items: applied to the live avatar look the moment the item is equipped. */
  lookPatch?: Partial<AvatarLook>;
};

const p = (id: string, name: string, tab: ShopTab, category: string, kind: ProductKind, price: number, rarity: Rarity, levelRequired: number, color: string | undefined, accent: string | undefined, description: string): ShopItem => ({
  id, name, tab, category, price, rarity, levelRequired, art: { type: 'product', kind, color, accent }, description,
});
const s = (id: string, name: string, kind: StickerKind, price: number, rarity: Rarity): ShopItem => ({
  id, name, tab: 'Stickers', category: 'Stickers', price, rarity, levelRequired: 1, art: { type: 'sticker', kind }, description: 'Slap it on posts, stories and your profile.',
});
/** An ownable Outfit "set" — one tap applies the whole top+bottom look. */
const o = (id: string, name: string, tag: OutfitTag, kind: ProductKind, color: string, accent: string, price: number, rarity: Rarity, levelRequired: number, description: string, lookPatch: Partial<AvatarLook>): ShopItem => ({
  id, name, tab: 'Outfits', category: 'Sets', styleTag: tag, price, rarity, levelRequired, art: { type: 'product', kind, color, accent }, description, lookPatch,
});
/** An ownable named shoe — one tap sets the character's shoe colour. */
const sh = (id: string, name: string, price: number, rarity: Rarity, levelRequired: number, color: string, accent: string, description: string): ShopItem => ({
  id, name, tab: 'Outfits', category: 'Shoes', price, rarity, levelRequired, art: { type: 'product', kind: 'shoes', color, accent }, description, lookPatch: { shoeColor: color },
});
/** An ownable pet variant for the avatar builder's Pets tab. */
const pt = (id: string, name: string, pose: MascotPose, accessory: MascotAccessory, glow: string, price: number, rarity: Rarity, levelRequired: number, description: string): ShopItem => ({
  id, name, tab: 'Pets', category: 'Squirrels', price, rarity, levelRequired, art: { type: 'pet', pose, accessory, glow }, description,
});

export const shopItems: ShopItem[] = [
  p('h-night', 'Night Shift Hoodie', 'Outfits', 'Hoodies', 'hoodie', 1200, 'Rare', 5, '#16101E', '#FF6B00', 'Heavyweight black hoodie with the neon tail mark.'),
  p('h-cloud', 'Cloud Nine Hoodie', 'Outfits', 'Hoodies', 'hoodie', 1500, 'Epic', 10, '#F4ECF8', '#FF9A4D', 'Brushed fleece in cloud white. Purple drawcords.'),
  p('h-sunset', 'Sunset Hoodie', 'Outfits', 'Hoodies', 'hoodie', 2200, 'Legendary', 15, '#FF8A4C', '#FFB020', 'Unlocked by the most consistent squirrels.'),
  p('t-neon', 'Neon Tee', 'Outfits', 'Tees', 'tee', 600, 'Common', 1, '#FF6B00', '#FFFFFF', 'Breathable run tee.'),
  p('t-cyan', 'Mono Split Tee', 'Outfits', 'Tees', 'tee', 700, 'Common', 3, '#FFFFFF', '#16101E', 'Two-tone training tee.'),
  p('t-tank', 'Tempo Tank', 'Outfits', 'Tees', 'tank', 550, 'Common', 1, '#16101E', '#FFFFFF', 'For hot-weather tempo runs.'),
  p('j-bomber', 'Afterglow Bomber', 'Outfits', 'Jackets', 'jacket', 1800, 'Epic', 12, '#FF9A4D', '#FF6B00', 'Satin bomber with reflective trim.'),
  p('b-joggers', 'Cargo Joggers', 'Outfits', 'Bottoms', 'joggers', 1500, 'Rare', 6, '#1B1524', '#FF6B00', 'Tapered joggers with zip pockets.'),
  p('b-shorts', 'Split Shorts', 'Outfits', 'Bottoms', 'shorts', 650, 'Common', 2, '#16101E', '#FF8A4C', '5" race shorts.'),
  p('s-aero', 'Aero Runners', 'Outfits', 'Shoes', 'shoes', 1000, 'Rare', 4, '#FFFFFF', '#FF6B00', 'Light, bouncy daily trainers.'),
  p('s-high', 'Court Hightops', 'Outfits', 'Shoes', 'hightops', 1400, 'Epic', 9, '#16101E', '#FFFFFF', 'Streetwear hightops for rest days.'),
  p('g-duffel', 'Gym Duffel', 'Gear', 'Bags', 'bag', 1200, 'Rare', 5, '#FF4F6E', '#16101E', 'Fits shoes, towel and snacks.'),
  p('g-pack', 'Trail Pack', 'Gear', 'Bags', 'backpack', 1300, 'Rare', 7, '#16101E', '#FF6B00', 'Hydration-ready run pack.'),
  p('g-bottle', 'Neon Bottle', 'Gear', 'Hydration', 'bottle', 600, 'Common', 1, '#FFFFFF', '#FF6B00', '1L insulated bottle.'),
  p('g-watch', 'Pulse Watch', 'Gear', 'Tech', 'watch', 700, 'Rare', 3, '#C9C9D6', '#FF6B00', 'Tracks every step (in-game).'),
  p('g-buds', 'Beat Buds', 'Gear', 'Tech', 'earbuds', 900, 'Rare', 6, '#FFFFFF', '#FF9A4D', 'For the one-more-km playlist.'),
  p('g-gloves', 'Grip Gloves', 'Gear', 'Training', 'gloves', 450, 'Common', 2, '#16101E', '#FFB020', 'Lifting gloves with wrist wrap.'),
  p('g-mat', 'Flow Mat', 'Gear', 'Training', 'mat', 800, 'Common', 3, '#BDBDBD', '#16101E', 'Grippy yoga mat.'),
  p('a-shades', 'Pink Shades', 'Accessories', 'Eyewear', 'sunglasses', 400, 'Common', 1, '#FF6B00', '#FFFFFF', 'The signature squirrel look.'),
  p('a-cap', 'Squirrel Cap', 'Accessories', 'Headwear', 'cap', 800, 'Rare', 4, '#FF4F6E', '#FFFFFF', 'Curved brim, tail logo.'),
  p('a-beanie', 'Night Beanie', 'Accessories', 'Headwear', 'beanie', 500, 'Common', 2, '#FF9A4D', '#FF6B00', 'For 5 AM winter runs.'),
  p('a-band', 'Sweatband', 'Accessories', 'Headwear', 'headband', 300, 'Common', 1, '#FF6B00', '#FFFFFF', 'Retro terry headband.'),
  p('a-socks', 'Stripe Socks', 'Accessories', 'Socks', 'socks', 250, 'Common', 1, '#FFFFFF', '#FF6B00', 'Crew socks, double stripe.'),
  s('st-nodays', 'No Days Off', 'no-days-off', 150, 'Common'),
  s('st-flex', 'Squirrel Flex', 'squirrel-flex', 250, 'Rare'),
  s('st-heart', 'Neon Heart', 'neon-heart', 150, 'Common'),
  s('st-crown', 'Crown', 'crown', 300, 'Epic'),
  s('st-fire', 'On Fire', 'fire', 150, 'Common'),
  s('st-vibes', 'Good Vibes', 'good-vibes', 200, 'Rare'),
  s('st-km', 'One More KM', 'one-more-km', 250, 'Rare'),
  s('st-hydrate', 'Hydrate', 'hydrate', 150, 'Common'),

  // --- Gear (avatar builder) ---------------------------------------------
  p('gr-dumbbell', 'Iron Dumbbell', 'Gear', 'Strength', 'dumbbell', 500, 'Common', 1, '#2A2036', art.pink, 'A trusty pair for the daily set.'),
  p('gr-kettlebell', 'Neon Kettlebell', 'Gear', 'Strength', 'kettlebell', 750, 'Rare', 4, '#16101E', art.cyan, 'Cast iron with a glow-in-the-dark ring.'),
  p('gr-jumprope', 'Speed Rope', 'Gear', 'Cardio', 'jumprope', 400, 'Common', 1, art.pink, art.cloud, 'Ball-bearing handles for fast doubles.'),
  p('gr-band', 'Resistance Band', 'Gear', 'Training', 'resistanceband', 350, 'Common', 2, art.green, art.pink, 'Latex band, medium tension.'),
  p('gr-basketball', 'Street Basketball', 'Gear', 'Sports', 'basketball', 650, 'Rare', 5, art.orange, '#16101E', 'Grippy outdoor rubber.'),
  p('gr-football', 'Match Football', 'Gear', 'Sports', 'football', 650, 'Rare', 5, art.cloud, art.pink, 'Five-panel training ball.'),
  p('gr-racket', 'Ace Racket', 'Gear', 'Sports', 'tennisracket', 850, 'Epic', 8, art.yellow, art.purple, 'Light frame, strung for topspin.'),

  // --- Extra accessories ---------------------------------------------------
  p('a-chain', 'Nut Chain', 'Accessories', 'Jewelry', 'chain', 900, 'Epic', 7, art.yellow, art.cloud, 'The signature Squirrel Social pendant.'),
  p('a-wristband', 'Court Wristband', 'Accessories', 'Jewelry', 'wristband', 300, 'Common', 1, art.pink, art.cyan, 'Terry cloth, tail logo.'),
  p('a-sport-shades', 'Sport Shades', 'Accessories', 'Eyewear', 'sunglasses', 650, 'Rare', 5, art.cyan, art.violet, 'Wraparound lenses that stay put.'),

  // --- Outfit sets — themed looks (Outfit tab in the avatar builder) ------
  o('os-athletic', 'Tempo Set', 'Athletic', 'tee', art.cyan, '#16101E', 900, 'Common', 1, 'Breathable tee and split shorts for tempo days.', { top: 'tee', topColor: art.cyan, bottom: 'shorts', bottomColor: '#16101E' }),
  o('os-street', 'Block Party', 'Streetwear', 'jacket', '#16101E', art.pink, 1600, 'Rare', 6, 'Bomber jacket over joggers — rest-day drip.', { top: 'jacket', topColor: '#16101E', bottom: 'joggers', bottomColor: '#1B1524' }),
  o('os-running', 'Split Runner', 'Running', 'tank', art.pink, '#16101E', 850, 'Common', 2, 'Race tank and leggings, built for pace.', { top: 'tank', topColor: art.pink, bottom: 'leggings', bottomColor: '#16101E' }),
  o('os-gym', 'Lift Day', 'Gym', 'tank', art.purple, art.pink, 1000, 'Rare', 4, 'Crop top and joggers for the weight room.', { top: 'crop', topColor: art.purple, bottom: 'joggers', bottomColor: '#1B1524' }),
  o('os-basketball', 'Hoop Fit', 'Basketball', 'tank', art.orange, '#16101E', 1200, 'Rare', 6, 'Mesh tank and shorts, court-ready.', { top: 'tank', topColor: art.orange, bottom: 'shorts', bottomColor: '#16101E' }),
  o('os-football', 'Pitch Kit', 'Football', 'tee', art.green, art.cloud, 1200, 'Rare', 6, 'Club-style tee and shorts.', { top: 'tee', topColor: art.green, bottom: 'shorts', bottomColor: art.cloud }),
  o('os-casual', 'Off Duty', 'Casual', 'hoodie', art.cloud, art.purple, 1100, 'Common', 3, 'Soft hoodie and joggers for the walk home.', { top: 'hoodie', topColor: art.cloud, bottom: 'joggers', bottomColor: '#3A3160' }),
  o('os-night', 'Afterglow', 'Night workout', 'jacket', art.purple, art.pink, 1800, 'Epic', 10, 'Reflective jacket built for 9 PM sessions.', { top: 'jacket', topColor: art.purple, bottom: 'joggers', bottomColor: '#16101E' }),
  o('os-winter', 'Frostline', 'Winter', 'hoodie', '#2E2658', art.cyan, 1700, 'Epic', 9, 'Heavyweight fleece for cold-morning runs.', { top: 'hoodie', topColor: '#2E2658', bottom: 'joggers', bottomColor: '#16101E' }),
  o('os-limited', 'Solstice Drop', 'Limited Edition', 'jacket', art.orange, art.yellow, 3000, 'Legendary', 18, 'One-run collector jacket. Wear it loud.', { top: 'jacket', topColor: art.orange, bottom: 'shorts', bottomColor: '#16101E' }),

  // --- Shoes ---------------------------------------------------------------
  sh('sh-trainer', 'Daily Trainers', 550, 'Common', 1, art.cloud, art.pink, 'Everyday cushioning for easy miles.'),
  sh('sh-trail', 'Trailbreaker', 950, 'Rare', 5, '#4A3D2A', art.green, 'Lugged outsole for loose terrain.'),
  sh('sh-neon', 'Neon Pulse', 1100, 'Rare', 6, art.pink, art.cyan, 'Reflective mesh, glows under city lights.'),
  sh('sh-hoop', 'Hoop High', 1300, 'Epic', 8, art.orange, '#16101E', 'High-top cut for lateral support.'),

  // --- Pets — Squirrel Social mascot variants ------------------------------
  pt('pet-gym', 'Gym Squirrel', 'lift', 'headband', art.orange, 900, 'Rare', 5, 'Never skips a set.'),
  pt('pet-runner', 'Runner Squirrel', 'run', 'headphones', art.cyan, 900, 'Rare', 4, 'Always chasing a PB.'),
  pt('pet-neon', 'Neon Squirrel', 'cheer', 'sunglasses', art.pink, 1500, 'Epic', 8, 'Glows under the city lights.'),
  pt('pet-gamer', 'Gamer Squirrel', 'sit', 'headphones', art.purple, 1500, 'Epic', 9, 'One more round, one more km.'),
  pt('pet-ninja', 'Ninja Squirrel', 'idle', 'headband', art.violet, 1600, 'Epic', 10, 'Silent, focused, always on time.'),
  pt('pet-golden', 'Golden Squirrel', 'cheer', 'crown', art.yellow, 2500, 'Legendary', 15, 'The rarest squirrel in the city.'),
];

export const STARTER_OWNED = ['t-neon', 'a-shades', 's-aero', 'st-heart'];

export const rarityColor: Record<Rarity, string> = {
  Common: '#9A8CAE',
  Rare: '#FFFFFF',
  Epic: '#BDBDBD',
  Legendary: '#FFB020',
};

export const shopItemById = (id: string) => shopItems.find((i) => i.id === id);
