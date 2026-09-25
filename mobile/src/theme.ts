/**
 * Design tokens — "Blackout": orange, black and white. High-contrast streetwear energy
 * for a Gen-Z / college crowd. Pure-black canvas, blaze ORANGE for every action and
 * everything that's "yours", crisp WHITE as the second voice, amber for rewards.
 * Type is heavy, condensed and slanted (GTA-style title cards).
 */
export const colors = {
  bg: '#0A0A0A',
  bg2: '#111111',
  card: '#161616',
  cardHi: '#1F1F1F',
  glass: 'rgba(22,22,22,0.9)',
  line: '#2A2A2A',
  lineHi: '#3D3D3D',

  /** Primary action / "yours" colour — blaze orange. */
  primary: '#FF6B00',
  primarySoft: '#FF9A4D',
  primaryDeep: '#D95500',
  /** Secondary voice — white. */
  secondary: '#FFFFFF',
  orange: '#FF8A00',
  pink: '#FF8A4C',
  purple: '#FF6B00',
  violet: '#BDBDBD',
  blue: '#E0E0E0',
  gold: '#FFB020',
  coral: '#FF4D2E',
  green: '#FFFFFF',

  text: '#FFFFFF',
  sub: '#D4D4D4',
  dim: '#9A9A9A',
  mute: '#666666',
  onPrimary: '#0A0A0A',
  onSecondary: '#0A0A0A',
};

export const gradients = {
  primary: ['#FF9A4D', '#FF6B00', '#E05A00'] as const,
  secondary: ['#FFFFFF', '#F2F2F2', '#DADADA'] as const,
  purple: ['#FF9A4D', '#FF6B00', '#D95500'] as const,
  gold: ['#FFD27A', '#FFB020', '#E08E00'] as const,
  sunset: ['#1D1C1E', '#7A3E14', '#E86646', '#FF994D'] as const,
  screen: ['#111111', '#0A0A0A'] as const,
  card: ['#1A1A1A', '#161616'] as const,
  scrim: ['rgba(10,10,10,0)', 'rgba(10,10,10,0.65)', 'rgba(10,10,10,0.96)'] as const,
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
