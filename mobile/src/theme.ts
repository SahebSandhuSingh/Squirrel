/**
 * Design tokens — "Varsity Night": a Gen-Z / college look.
 * Deep navy-black canvas, TANGERINE as the primary action colour, electric COBALT as the
 * secondary accent, with lavender, mint and yellow for variety. Type is heavy, condensed
 * and slanted (GTA-style title cards) using free Google Fonts lookalikes.
 */
export const colors = {
  bg: '#07090F',
  bg2: '#0C1020',
  card: '#111626',
  cardHi: '#182036',
  glass: 'rgba(17,22,38,0.9)',
  line: '#232B45',
  lineHi: '#33406A',

  /** Primary action / "yours" colour. */
  primary: '#FF7A1A',
  primarySoft: '#FFA566',
  primaryDeep: '#D95A00',
  /** Secondary accent. */
  secondary: '#3B6BFF',
  pink: '#FF5FA2',
  purple: '#7C5CFF',
  violet: '#B69CFF',
  blue: '#6FA8FF',
  gold: '#FFD23F',
  orange: '#FF7A1A',
  coral: '#FF5C6E',
  green: '#4BF0B5',

  text: '#F5F7FF',
  sub: '#C9D0E6',
  dim: '#8E97B5',
  mute: '#5C6585',
  onPrimary: '#140800',
  onSecondary: '#FFFFFF',
};

export const gradients = {
  primary: ['#FFA566', '#FF7A1A', '#E85F00'] as const,
  secondary: ['#6F92FF', '#3B6BFF', '#2449D8'] as const,
  purple: ['#B69CFF', '#7C5CFF', '#5634E0'] as const,
  gold: ['#FFE580', '#FFD23F', '#F0A81C'] as const,
  sunset: ['#2B0B3F', '#6B1553', '#D0356E', '#FF8A4C'] as const,
  screen: ['#0C1020', '#07090F'] as const,
  card: ['#151B2E', '#111626'] as const,
  scrim: ['rgba(7,9,15,0)', 'rgba(7,9,15,0.65)', 'rgba(7,9,15,0.96)'] as const,
};

/** GTA-style type: heavy condensed headlines, condensed (often italic) labels, clean body. */
export const fonts = {
  /** Headlines & big numbers — heavy condensed, rendered with a slight forward slant. */
  display: 'Anton_400Regular',
  /** Punchy slanted callouts ("JUST ONE MORE KM"). */
  script: 'BarlowCondensed_800ExtraBold_Italic',
  /** Labels, buttons, tabs. */
  label: 'BarlowCondensed_600SemiBold',
  labelBold: 'BarlowCondensed_700Bold',
  /** Kickers and meta. */
  mono: 'Inter_500Medium',
  monoBold: 'BarlowCondensed_700Bold_Italic',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_900Black',
};

/** Forward slant applied to display type for the GTA title-card feel. */
export const DISPLAY_SKEW = '-6deg';

export const radius = { xs: 6, sm: 10, md: 14, lg: 16, xl: 22, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Max content width so tablets/web get a centred phone-like column instead of stretched cards. */
export const MAX_WIDTH = 560;
