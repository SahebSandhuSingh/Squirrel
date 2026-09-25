/**
 * Design tokens, matched to the Squirrel Social website (squirrel-social-site):
 * near-black canvas, graphite cards, electric LIME as the primary action colour,
 * hot PINK as the secondary accent, purple/orange/yellow for variety.
 */
export const colors = {
  bg: '#060606',
  bg2: '#0B0B0D',
  card: '#111113',
  cardHi: '#17171A',
  glass: 'rgba(17,17,19,0.88)',
  line: '#27272B',
  lineHi: '#3A3A40',

  /** Primary action / "yours" colour (website --lime). */
  primary: '#D7FF1F',
  primarySoft: '#E8FF7A',
  primaryDeep: '#9DBF00',
  /** Secondary accent (website --pink). */
  secondary: '#FF2D9B',
  pink: '#FF2D9B',
  purple: '#A855F7',
  violet: '#C084FC',
  blue: '#5FB8FF',
  gold: '#FFD21F',
  orange: '#FF8A1F',
  coral: '#FF5C7A',
  green: '#3DF0A0',

  text: '#F4F4F4',
  sub: '#D4D4D8',
  dim: '#A9A9AE',
  mute: '#6E6E75',
  onPrimary: '#0B0B0B',
  onSecondary: '#0B0B0B',
};

export const gradients = {
  primary: ['#E6FF6A', '#D7FF1F', '#B8E600'] as const,
  secondary: ['#FF6FBF', '#FF2D9B', '#D6127C'] as const,
  purple: ['#C084FC', '#A855F7', '#7E22CE'] as const,
  gold: ['#FFE580', '#FFD21F', '#F0A81C'] as const,
  sunset: ['#2B0B3F', '#6B1553', '#D0356E', '#FF8A4C'] as const,
  screen: ['#0B0B0D', '#060606'] as const,
  card: ['#17171A', '#111113'] as const,
  scrim: ['rgba(6,6,6,0)', 'rgba(6,6,6,0.65)', 'rgba(6,6,6,0.96)'] as const,
};

export const fonts = {
  /** Brush headline face (website --f-brush). */
  display: 'Knewave_400Regular',
  /** Marker scribbles (website --f-marker). */
  script: 'PermanentMarker_400Regular',
  /** Condensed uppercase labels, buttons, numbers (website --f-label). */
  label: 'Oswald_600SemiBold',
  labelBold: 'Oswald_700Bold',
  /** Section kickers and meta (website --f-mono). */
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_900Black',
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 14, xl: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Max content width so tablets/web get a centred phone-like column instead of stretched cards. */
export const MAX_WIDTH = 560;
