/**
 * Design tokens — "Olive & Sand": earthy streetwear for a Gen-Z / college crowd.
 * Olive-black canvas, SAND as the primary action colour, OLIVE as the secondary accent,
 * and the logo's squirrel ORANGE for energy (routes, XP, highlights). Terracotta,
 * mustard and sage fill out the set. Type stays heavy, condensed and slanted (GTA-style).
 */
export const colors = {
  bg: '#0E100B',
  bg2: '#14170F',
  card: '#1A1D14',
  cardHi: '#23271A',
  glass: 'rgba(26,29,20,0.9)',
  line: '#2E3322',
  lineHi: '#434A31',

  /** Primary action / "yours" colour — sand. */
  primary: '#E3CB8F',
  primarySoft: '#EFDDB2',
  primaryDeep: '#BFA464',
  /** Secondary accent — olive. */
  secondary: '#9DB04C',
  /** Logo orange — energy accent. */
  orange: '#F28C28',
  pink: '#E07A5F',
  purple: '#6F7D3C',
  violet: '#B4C27A',
  blue: '#8FB3AA',
  gold: '#E9B949',
  coral: '#D9643A',
  green: '#9CCB7A',

  text: '#F4EFE3',
  sub: '#D6CFBC',
  dim: '#9E9A86',
  mute: '#6B6957',
  onPrimary: '#1A1608',
  onSecondary: '#10130A',
};

export const gradients = {
  primary: ['#F2E2B8', '#E3CB8F', '#C9AE6C'] as const,
  secondary: ['#B9CB6A', '#9DB04C', '#788A2E'] as const,
  purple: ['#A7B75E', '#7E8C4A', '#5D6A30'] as const,
  gold: ['#F3D27A', '#E9B949', '#C9951F'] as const,
  sunset: ['#232614', '#763E18', '#DC7252', '#F89B54'] as const,
  screen: ['#14170F', '#0E100B'] as const,
  card: ['#1D2116', '#1A1D14'] as const,
  scrim: ['rgba(14,16,11,0)', 'rgba(14,16,11,0.65)', 'rgba(14,16,11,0.96)'] as const,
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
