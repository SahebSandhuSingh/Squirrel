/**
 * Shared illustration palette. Every piece of art in src/art uses these so the
 * whole app reads as one visual universe: neon nightlife over a sunset city.
 */
export const art = {
  // night sky -> sunset
  night0: '#06070C',
  night1: '#0A0C19',
  night2: '#0F122B',
  dusk: '#141B4A',
  magenta: '#142C7A',
  coral: '#E04E7F',
  orange: '#FF7A45',
  amber: '#FFB547',
  sunTop: '#FFE08A',
  sunBottom: '#FF8A5C',

  // neon
  pink: '#2D5EFF',
  lime: '#D7FF1F',
  /** UI route / 'yours' colour (matches theme primary). */
  route: '#2F5BFF',
  pinkHi: '#7F9DFF',
  purple: '#4D63EE',
  violet: '#8594F5',
  cyan: '#35DFFF',
  yellow: '#FFD43B',
  green: '#3DF0A0',

  // buildings / silhouettes
  building0: '#0A0C1C',
  building1: '#0E1228',
  building2: '#151935',
  silhouette: '#060711',

  // squirrel mascot
  fur: '#D9783A',
  furDark: '#A9521F',
  furLight: '#F2A15E',
  belly: '#FBE2BF',
  nose: '#3A1A12',

  // neutrals
  ink: '#08090F',
  white: '#FFFFFF',
  cloud: '#EDEEF7',
  steel: '#858796',
};

export const skinTones = ['#F6D3B8', '#E8B48F', '#C98A5E', '#A0643A', '#6E4127', '#4A2A1A'] as const;
export const hairColors = ['#1A1116', '#3B2218', '#6B3A1F', '#B7773A', '#E5C07B', '#FF4DC4', '#8A3FFC'] as const;
