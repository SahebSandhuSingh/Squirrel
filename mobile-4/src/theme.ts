/**
 * Design tokens: the Squirrel Social website palette (www.squirrelsocial.in /
 * squirrel-social-site), a near-black canvas with graphite panels, electric LIME for every
 * action and everything that's "yours", and hot PINK as the second voice, with purple,
 * orange and yellow for variety. Type is GTA-style: heavy condensed, slanted headlines.
 *
 * Two complete themes. DARK is the original identity. LIGHT is its daylight twin, not an
 * inversion: warm paper canvas, white cards, near-black ink, deeper lime/pink for text and
 * icons (so they stay readable on light surfaces) and the same neon lime on filled actions.
 *
 * The theme is read synchronously at startup from the saved preference, so every style in the
 * app (including module-level StyleSheets) is built with the right palette. Switching saves the
 * choice and reloads the JS app — see `setThemePreference`.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemeName = 'dark' | 'light';
const THEME_KEY = 'squirrel.theme';

function readThemePreference(): ThemeName {
  try {
    const v = Platform.OS === 'web' ? (typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_KEY) : null) : SecureStore.getItem(THEME_KEY);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Saves the preference. The caller reloads the app so every screen picks it up at once. */
export function saveThemePreference(t: ThemeName) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, t);
  } else SecureStore.setItem(THEME_KEY, t);
}

/** The active theme for this app session. */
export const THEME: ThemeName = readThemePreference();
export const isLightTheme = THEME === 'light';

const dark = {
  bg: '#060606',
  bg2: '#0B0B0D',
  card: '#111113',
  cardHi: '#17171A',
  glass: 'rgba(17,17,19,0.88)',
  line: '#27272B',
  lineHi: '#3A3A40',
  /** Base colour for floating panels over the map / content (used with `alpha`). */
  panel: '#0A0A0D',

  /** Primary action / "yours" colour (website --lime). Text, icons, borders. */
  primary: '#D7FF1F',
  /** Filled primary surfaces (buttons, FAB): always the neon lime, with `onPrimary` ink. */
  primaryFill: '#D7FF1F',
  primarySoft: '#E8FF7A',
  primaryDeep: '#9DBF00',
  /** Secondary accent (website --pink). */
  secondary: '#FF2D9B',
  orange: '#FF8A1F',
  pink: '#FF2D9B',
  purple: '#A855F7',
  violet: '#C084FC',
  blue: '#5FB8FF',
  gold: '#FFD21F',
  coral: '#FF5C7A',
  green: '#3DF0A0',

  text: '#F4F4F4',
  sub: '#D4D4D8',
  dim: '#A9A9AE',
  mute: '#6E6E75',
  onPrimary: '#0B0B0B',
  onSecondary: '#0B0B0B',

  /** Text / icons drawn on top of artwork and photos (artwork doesn't change with the theme). */
  onImage: '#FFFFFF',
  onImageSub: 'rgba(255,255,255,0.82)',
  /** Dark translucent chip used on top of artwork. */
  imageChip: 'rgba(6,6,6,0.72)',
  /** Dim layer behind modals and sheets. */
  backdrop: 'rgba(0,0,0,0.6)',
};

export type Palette = typeof dark;

const light: Palette = {
  bg: '#F3F1EA',
  bg2: '#EAE7DD',
  card: '#FFFFFF',
  cardHi: '#F6F4EE',
  glass: 'rgba(255,255,255,0.9)',
  line: '#DCD8CB',
  lineHi: '#C7C2B2',
  panel: '#FFFFFF',

  primary: '#5F8C00',
  primaryFill: '#D7FF1F',
  primarySoft: '#7FAF00',
  primaryDeep: '#4A6E00',
  secondary: '#D6127C',
  orange: '#C65A00',
  pink: '#D6127C',
  purple: '#8B3FDB',
  violet: '#7C3AED',
  blue: '#1D6FC4',
  gold: '#9A6B00',
  coral: '#D2304F',
  green: '#0A8A58',

  text: '#111113',
  sub: '#2D2D32',
  dim: '#5C5B60',
  mute: '#8C8A83',
  onPrimary: '#0B0B0B',
  onSecondary: '#FFFFFF',

  onImage: '#FFFFFF',
  onImageSub: 'rgba(255,255,255,0.85)',
  imageChip: 'rgba(6,6,6,0.72)',
  backdrop: 'rgba(20,18,12,0.45)',
};

export const colors: Palette = isLightTheme ? light : dark;
/** The dark palette in both themes, for screens drawn over the camera (the live workout). */
export const darkColors: Palette = dark;

/** Same colour at a given opacity: alpha('#D7FF1F', 0.1) → 'rgba(215,255,31,0.1)'. */
export function alpha(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const gradients = {
  primary: ['#E6FF6A', '#D7FF1F', '#B8E600'] as const,
  secondary: ['#FF6FBF', '#FF2D9B', '#D6127C'] as const,
  purple: ['#C084FC', '#A855F7', '#7E22CE'] as const,
  gold: ['#FFE580', '#FFD21F', '#F0A81C'] as const,
  sunset: ['#2B0B3F', '#6B1553', '#D0356E', '#FF8A4C'] as const,
  screen: (isLightTheme ? ['#F7F5EF', '#EFECE3'] : ['#0B0B0D', '#060606']) as readonly [string, string],
  card: (isLightTheme ? ['#FFFFFF', '#F6F4EE'] : ['#17171A', '#111113']) as readonly [string, string],
  /** Over artwork and photos — same in both themes. */
  scrim: ['rgba(6,6,6,0)', 'rgba(6,6,6,0.65)', 'rgba(6,6,6,0.96)'] as const,
};

/**
 * The campus map's base layer. Dark: the night campus. Light: a daylight game map
 * (sand ground, pale roads, soft green) — still stylised, never a street-map look.
 */
export const mapColors = isLightTheme
  ? { bg: '#E9E5D8', ground: '#F1EEE4', frame: '#DDD8C8', road: '#FFFFFF', roadEdge: '#D2CCBA', path: '#E2DCCB', building: '#DCD6C6', buildingLine: '#C8C1AD', green: '#CFE3B4', water: '#B9D7EC', field: '#DCE8C0', label: '#6E6A5E', labelHalo: '#F1EEE4' }
  : { bg: '#06070A', ground: '#0A0B10', frame: '#14161C', road: '#1C1F27', roadEdge: '#101218', path: '#171A21', building: '#15171D', buildingLine: '#23262E', green: '#0F1812', water: '#0B1520', field: '#121A10', label: '#6E7280', labelHalo: '#0A0B10' };

/** Status bar content over the app's own surfaces. */
export const statusBarStyle: 'light' | 'dark' = isLightTheme ? 'dark' : 'light';

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
