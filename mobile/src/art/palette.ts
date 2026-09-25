/**
 * Shared illustration palette. Every piece of art in src/art uses these so the
 * whole app reads as one visual universe: neon nightlife over a sunset city.
 */
export const art = {
  // night sky -> sunset
  night0: '#0A0B07',
  night1: '#15160D',
  night2: '#232614',
  dusk: '#3B3F1F',
  magenta: '#763E18',
  coral: '#DC7252',
  orange: '#FF7A45',
  amber: '#FFB547',
  sunTop: '#FFE08A',
  sunBottom: '#F89B54',

  // neon
  pink: '#F79035',
  lime: '#D7FF1F',
  /** UI route / 'yours' colour (matches theme primary). */
  route: '#F28C28',
  pinkHi: '#FAB784',
  purple: '#C0CD6E',
  violet: '#D5DE9C',
  cyan: '#D7C25D',
  yellow: '#FFD43B',
  green: '#9CCB7A',

  // buildings / silhouettes
  building0: '#17180D',
  building1: '#212214',
  building2: '#2C2E1B',
  silhouette: '#0E0F08',

  // squirrel mascot
  fur: '#D9783A',
  furDark: '#A9521F',
  furLight: '#F2A15E',
  belly: '#FBE2BF',
  nose: '#3A1A12',

  // neutrals
  ink: '#0D0E09',
  white: '#FFFFFF',
  cloud: '#F4F5EF',
  steel: '#919388',
};

export const skinTones = ['#F6D3B8', '#E8B48F', '#C98A5E', '#A0643A', '#6E4127', '#4A2A1A'] as const;
export const hairColors = ['#1A1116', '#3B2218', '#6B3A1F', '#B7773A', '#E5C07B', '#FF4DC4', '#8A3FFC'] as const;
