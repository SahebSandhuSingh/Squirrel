import type { AvatarLook } from '@/types';

export type User = {
  id: string;
  name: string;
  handle: string;
  look: AvatarLook;
  level: number;
  cityId: string;
  area: string;
  bio: string;
  tags: string[];
  verified?: boolean;
  followers: number;
  following: number;
  posts: number;
};

const L = (l: Partial<AvatarLook> & Pick<AvatarLook, 'body' | 'skin' | 'hair'>): AvatarLook => ({
  hairColor: '#1A1116',
  top: 'hoodie',
  topColor: '#16101E',
  bottom: 'joggers',
  bottomColor: '#1B1524',
  shoeColor: '#FFFFFF',
  accessory: 'none',
  ...l,
});

export const users: User[] = [
  {
    id: 'u_aanya',
    name: 'Aanya S.',
    handle: 'aanya.moves',
    look: L({ body: 'female', skin: '#C98A5E', hair: 'bun', hairColor: '#1A1116', top: 'crop', topColor: '#16101E', bottom: 'joggers', bottomColor: '#1B1524', shoeColor: '#FFFFFF' }),
    level: 13,
    cityId: 'pune',
    area: 'Koregaon Park',
    bio: 'Building a healthier, happier me\nand a kinder world. 🌱',
    tags: ['Runner', 'Yoga', 'No Sugar Club'],
    verified: true,
    followers: 4800,
    following: 28,
    posts: 12,
  },
  { id: 'u_rhea', name: 'Rhea K.', handle: 'rhea.runs', look: L({ body: 'female', skin: '#E8B48F', hair: 'ponytail', hairColor: '#3B2218', top: 'tank', topColor: '#FF2D9B', bottom: 'leggings', bottomColor: '#16101E', accessory: 'headband' }), level: 18, cityId: 'pune', area: 'Koregaon Park', bio: 'Sunrise miles. Sunset smiles.', tags: ['Runner', 'Early Birds'], verified: true, followers: 9200, following: 310, posts: 88 },
  { id: 'u_aarav', name: 'Aarav M.', handle: 'aarav.lifts', look: L({ body: 'male', skin: '#A0643A', hair: 'short', top: 'tee', topColor: '#A855F7', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#D7FF1F' }), level: 15, cityId: 'pune', area: 'Baner', bio: 'Lifting Squirrels captain. PR hunter.', tags: ['Gym', 'Powerlifting'], followers: 3100, following: 190, posts: 54 },
  { id: 'u_meera', name: 'Meera J.', handle: 'meera.flows', look: L({ body: 'female', skin: '#F6D3B8', hair: 'long', hairColor: '#6B3A1F', top: 'tank', topColor: '#FFFFFF', bottom: 'leggings', bottomColor: '#A855F7', accessory: 'none' }), level: 21, cityId: 'pune', area: 'Aundh', bio: 'Yoga Vibes host. Breathe in, show up.', tags: ['Yoga', 'Mindfulness'], verified: true, followers: 12400, following: 402, posts: 131 },
  { id: 'u_kabir', name: 'Kabir R.', handle: 'kabir.cycles', look: L({ body: 'male', skin: '#C98A5E', hair: 'curly', hairColor: '#1A1116', top: 'jacket', topColor: '#FF8A1F', bottom: 'joggers', bottomColor: '#1B1524', accessory: 'shades' }), level: 11, cityId: 'pune', area: 'Kothrud', bio: '100 km weekends. Coffee after.', tags: ['Cycling', 'Coffee'], followers: 1800, following: 240, posts: 40 },
  { id: 'u_zoya', name: 'Zoya F.', handle: 'zoya.hiit', look: L({ body: 'female', skin: '#6E4127', hair: 'afro', hairColor: '#1A1116', top: 'crop', topColor: '#D7FF1F', bottom: 'shorts', bottomColor: '#16101E', shoeColor: '#FF2D9B' }), level: 16, cityId: 'pune', area: 'Viman Nagar', bio: 'HIIT coach @ Pulse. No days off (except Sundays).', tags: ['HIIT', 'Coach'], verified: true, followers: 7600, following: 150, posts: 96 },
  { id: 'u_dev', name: 'Dev P.', handle: 'dev.dawn', look: L({ body: 'male', skin: '#E8B48F', hair: 'buzz', top: 'hoodie', topColor: '#FF2D9B', bottom: 'joggers', bottomColor: '#16101E', accessory: 'headphones' }), level: 9, cityId: 'pune', area: 'Hinjewadi', bio: 'Engineer by day, 5 AM runner by habit.', tags: ['Runner', 'Early Birds'], followers: 640, following: 120, posts: 22 },
  { id: 'u_isha', name: 'Isha T.', handle: 'isha.eats.clean', look: L({ body: 'female', skin: '#A0643A', hair: 'bob', hairColor: '#1A1116', top: 'tee', topColor: '#3DF0A0', bottom: 'joggers', bottomColor: '#1B1524', accessory: 'cap' }), level: 12, cityId: 'pune', area: 'Kalyani Nagar', bio: 'No Sugar Club founder. Recipes > rules.', tags: ['Nutrition', 'No Sugar Club'], followers: 5300, following: 280, posts: 74 },
  { id: 'u_neil', name: 'Neil D.', handle: 'neil.bandra', look: L({ body: 'male', skin: '#C98A5E', hair: 'short', hairColor: '#3B2218', top: 'tank', topColor: '#16101E', bottom: 'shorts', bottomColor: '#FF2D9B' }), level: 19, cityId: 'mumbai', area: 'Bandra', bio: 'Marine Drive at 6. Every. Day.', tags: ['Runner'], followers: 8800, following: 330, posts: 102 },
  { id: 'u_tara', name: 'Tara V.', handle: 'tara.blr', look: L({ body: 'female', skin: '#C98A5E', hair: 'curly', hairColor: '#6B3A1F', top: 'hoodie', topColor: '#A855F7', bottom: 'leggings', bottomColor: '#16101E', accessory: 'shades' }), level: 14, cityId: 'bangalore', area: 'Indiranagar', bio: 'Cubbon loops & filter coffee.', tags: ['Runner', 'Coffee'], followers: 2900, following: 210, posts: 61 },
  { id: 'u_sam', name: 'Sam O.', handle: 'sam.ldn', look: L({ body: 'male', skin: '#4A2A1A', hair: 'afro', top: 'jacket', topColor: '#D7FF1F', bottom: 'joggers', bottomColor: '#16101E' }), level: 22, cityId: 'london', area: 'Shoreditch', bio: 'Canal runs & climbing walls.', tags: ['Runner', 'Climbing'], verified: true, followers: 15100, following: 500, posts: 140 },
  { id: 'u_maya', name: 'Maya L.', handle: 'maya.nyc', look: L({ body: 'female', skin: '#F6D3B8', hair: 'ponytail', hairColor: '#E5C07B', top: 'crop', topColor: '#FF8A1F', bottom: 'leggings', bottomColor: '#16101E', accessory: 'headphones' }), level: 17, cityId: 'nyc', area: 'Williamsburg', bio: 'Bridges, bagels, burpees.', tags: ['HIIT', 'Runner'], followers: 6700, following: 260, posts: 83 },
];

export const CURRENT_USER_ID = 'u_aanya';

export const userById = (id: string) => users.find((u) => u.id === id) ?? users[0];
