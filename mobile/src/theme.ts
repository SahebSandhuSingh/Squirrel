export const colors = {
  bg: '#07050D',
  bg2: '#10091A',
  card: '#160D23',
  cardHi: '#21122F',
  glass: 'rgba(33,18,47,0.72)',
  line: '#2C1A40',
  lineHi: '#3F2759',

  pink: '#FF35B5',
  pinkHi: '#FF4DC4',
  pinkSoft: '#FF8AD8',
  pinkDeep: '#B01E7E',
  purple: '#8A3FFC',
  violet: '#B57BFF',
  cyan: '#35DFFF',
  blue: '#5FB8FF',
  gold: '#FFD43B',
  orange: '#FF7A45',
  coral: '#FF5C7A',
  green: '#3DF0A0',

  text: '#FFFFFF',
  sub: '#CFC3DD',
  dim: '#9A8CAE',
  mute: '#6B5D80',
  onPink: '#2A0620',
  onCyan: '#032029',
};

export const gradients = {
  pink: ['#FF7FD6', '#FF35B5', '#D81E93'] as const,
  purple: ['#A56BFF', '#8A3FFC', '#5B1FC0'] as const,
  cyan: ['#7DEBFF', '#35DFFF', '#1AA8D6'] as const,
  gold: ['#FFE580', '#FFD43B', '#F0A81C'] as const,
  sunset: ['#2B0B3F', '#6B1553', '#D0356E', '#FF8A4C'] as const,
  screen: ['#10091A', '#07050D'] as const,
  card: ['#1E1130', '#150C22'] as const,
  scrim: ['rgba(7,5,13,0)', 'rgba(7,5,13,0.65)', 'rgba(7,5,13,0.96)'] as const,
};

export const fonts = {
  display: 'Anton_400Regular',
  script: 'PermanentMarker_400Regular',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_900Black',
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Max content width so tablets/web get a centred phone-like column instead of stretched cards. */
export const MAX_WIDTH = 560;
