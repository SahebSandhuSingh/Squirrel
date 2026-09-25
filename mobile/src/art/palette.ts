/**
 * Shared illustration palette. Every piece of art in src/art uses these so the
 * whole app reads as one visual universe: neon nightlife over a sunset city.
 */
export const art = {
  // night sky -> sunset
  night0: '#090909',
  night1: '#111112',
  night2: '#1D1C1E',
  dusk: '#302D31',
  magenta: '#7A3E14',
  coral: '#E86646',
  orange: '#FF7A45',
  amber: '#FFB547',
  sunTop: '#FFE08A',
  sunBottom: '#FF994D',

  // neon
  pink: '#FF892D',
  lime: '#939688',
  /** UI route / 'yours' colour (matches theme primary). */
  route: '#FF6B00',
  pinkHi: '#FFB57F',
  purple: '#9C98A3',
  violet: '#BDB9C1',
  cyan: '#949EA0',
  yellow: '#FFD43B',
  green: '#919C97',

  // buildings / silhouettes
  building0: '#131214',
  building1: '#1B1A1C',
  building2: '#252426',
  silhouette: '#0B0B0C',

  // squirrel mascot
  fur: '#D9783A',
  furDark: '#A9521F',
  furLight: '#F2A15E',
  belly: '#FBE2BF',
  nose: '#3A1A12',

  // neutrals
  ink: '#0B0B0C',
  white: '#FFFFFF',
  cloud: '#F2F2F2',
  steel: '#8D8D8E',
};

export const skinTones = ['#F6D3B8', '#E8B48F', '#C98A5E', '#A0643A', '#6E4127', '#4A2A1A'] as const;
export const hairColors = ['#1A1116', '#3B2218', '#6B3A1F', '#B7773A', '#E5C07B', '#FF4DC4', '#8A3FFC'] as const;
