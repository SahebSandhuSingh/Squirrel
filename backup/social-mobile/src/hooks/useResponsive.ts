import { useWindowDimensions } from 'react-native';
import { space, MAX_WIDTH } from '@/theme';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;
  const contentWidth = Math.min(width, MAX_WIDTH);
  const scale = Math.min(width / 375, 1.3); // Base on iPhone 13 width, cap at 1.3x

  return {
    width,
    height,
    isTablet,
    isLandscape,
    contentWidth,
    scale,
    space: {
      xs: space.xs * scale,
      sm: space.sm * scale,
      md: space.md * scale,
      lg: space.lg * scale,
      xl: space.xl * scale,
      xxl: space.xxl * scale,
    },
  };
}

export function useSpacing() {
  const { scale } = useResponsive();
  return {
    xs: space.xs * scale,
    sm: space.sm * scale,
    md: space.md * scale,
    lg: space.lg * scale,
    xl: space.xl * scale,
    xxl: space.xxl * scale,
  };
}