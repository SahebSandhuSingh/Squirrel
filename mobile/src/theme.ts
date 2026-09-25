/**
 * Design tokens — "Voltage": white + electric blue. A bright, clean LIGHT theme for a
 * Gen-Z / college crowd. White canvas, soft blue-grey cards, ELECTRIC BLUE for every action
 * and everything that's "yours", near-black ink for text, amber for coins/rewards.
 * The city artwork stays dark, so anything drawn on top of it uses `onImage` (white).
 * Type is heavy, condensed and slanted (GTA-style title cards).
 */
export const colors = {
  bg: '#FFFFFF',
  bg2: '#F4F6FB',
  card: '#F4F6FB',
  cardHi: '#E9EDF7',
  glass: 'rgba(255,255,255,0.94)',
  line: '#E1E6F0',
  lineHi: '#C7CFE0',

  /** Primary action / "yours" colour — electric blue. */
  primary: '#2F5BFF',
  primarySoft: '#7090FF',
  primaryDeep: '#1B3FD6',
  /** Secondary voice — ink. */
  secondary: '#0B0F1A',
  orange: '#FF8A00',
  pink: '#FF4D8D',
  purple: '#2F5BFF',
  violet: '#7090FF',
  blue: '#00B2FF',
  gold: '#FFB020',
  coral: '#FF4D4D',
  green: '#12B76A',

  text: '#0B0F1A',
  sub: '#3A4256',
  dim: '#6B7489',
  mute: '#A0A8BA',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',

  /** Text / icons drawn on top of the (dark) city artwork and photos. */
  onImage: '#FFFFFF',
  onImageSub: 'rgba(255,255,255,0.82)',
  /** Dark translucent chip used on top of artwork. */
  imageChip: 'rgba(8,12,24,0.72)',
};

export const gradients = {
  primary: ['#5A7BFF', '#2F5BFF', '#1B3FD6'] as const,
  secondary: ['#2A3142', '#0B0F1A', '#000000'] as const,
  purple: ['#5A7BFF', '#2F5BFF', '#1B3FD6'] as const,
  gold: ['#FFD27A', '#FFB020', '#E08E00'] as const,
  sunset: ['#1D1C1E', '#1B3FD6', '#2F5BFF', '#7090FF'] as const,
  screen: ['#FFFFFF', '#F7F9FD'] as const,
  card: ['#FFFFFF', '#F4F6FB'] as const,
  /** Always dark: used over artwork so white text stays legible. */
  scrim: ['rgba(8,12,24,0)', 'rgba(8,12,24,0.6)', 'rgba(8,12,24,0.92)'] as const,
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
