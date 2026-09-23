import React, { useMemo } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '@/theme';

/** Deterministic pseudo-random so the skyline doesn't jump on re-render. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function Palm({ x, base, h, flip = 1 }: { x: number; base: number; h: number; flip?: number }) {
  const top = base - h;
  const fronds = [-70, -40, -12, 15, 45, 75].map((a, i) => {
    const rad = ((a - 90) * Math.PI) / 180;
    const len = h * 0.32;
    const ex = x + Math.cos(rad) * len * flip;
    const ey = top + Math.sin(rad) * len * 0.55 + len * 0.35;
    const cx = x + Math.cos(rad) * len * 0.5 * flip;
    const cy = top - len * 0.25;
    return <Path key={i} d={`M${x},${top} Q${cx},${cy} ${ex},${ey}`} stroke="#07030C" strokeWidth={3} fill="none" strokeLinecap="round" />;
  });
  return (
    <G>
      <Path d={`M${x - 2},${base} Q${x + 6 * flip},${base - h * 0.5} ${x},${top}`} stroke="#07030C" strokeWidth={4} fill="none" />
      {fronds}
    </G>
  );
}

/** Synthwave sunset city: gradient sky, sun, skyline with lit windows, palms. */
export function CityBackdrop({ height = 300, style, palms = true, seed = 7, sun = true }: { height?: number; style?: StyleProp<ViewStyle>; palms?: boolean; seed?: number; sun?: boolean }) {
  const W = 400;
  const H = height;
  const buildings = useMemo(() => {
    const r = rng(seed);
    const list: { x: number; w: number; h: number; windows: { x: number; y: number; c: string }[] }[] = [];
    let x = -10;
    while (x < W) {
      const w = 18 + r() * 34;
      const h = H * (0.18 + r() * (r() > 0.8 ? 0.55 : 0.32));
      const windows: { x: number; y: number; c: string }[] = [];
      for (let wy = H - h + 8; wy < H - 6; wy += 9) {
        for (let wx = x + 4; wx < x + w - 4; wx += 7) {
          if (r() > 0.62) windows.push({ x: wx, y: wy, c: r() > 0.7 ? colors.cyan : r() > 0.5 ? colors.pinkSoft : colors.gold });
        }
      }
      list.push({ x, w, h, windows });
      x += w + 2;
    }
    return list;
  }, [H, seed]);

  return (
    <View style={[{ height, width: '100%', overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <Defs>
          <SvgGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#12071D" />
            <Stop offset="0.45" stopColor="#4A0F4F" />
            <Stop offset="0.8" stopColor="#C0336E" />
            <Stop offset="1" stopColor="#FF8A4C" />
          </SvgGradient>
          <SvgGradient id="sun" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFD36E" />
            <Stop offset="1" stopColor="#FF4FC3" />
          </SvgGradient>
          <SvgGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity="0" />
            <Stop offset="1" stopColor={colors.bg} stopOpacity="1" />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width={W} height={H} fill="url(#sky)" />
        {sun && <Circle cx={W * 0.62} cy={H * 0.62} r={H * 0.2} fill="url(#sun)" opacity={0.9} />}
        {buildings.map((b, i) => (
          <G key={i}>
            <Rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill={i % 3 ? '#140820' : '#1C0B2B'} />
            {b.windows.map((w, k) => (
              <Rect key={k} x={w.x} y={w.y} width={3} height={4} fill={w.c} opacity={0.85} />
            ))}
          </G>
        ))}
        {palms && (
          <>
            <Palm x={30} base={H} h={H * 0.62} />
            <Palm x={62} base={H} h={H * 0.48} flip={-1} />
            <Palm x={W - 40} base={H} h={H * 0.58} flip={-1} />
          </>
        )}
        <Rect x="0" y={H * 0.72} width={W} height={H * 0.28} fill="url(#fade)" />
      </Svg>
    </View>
  );
}

/** Stylised neon night map for Explore. */
export function NeonMap({ style }: { style?: StyleProp<ViewStyle> }) {
  const W = 360;
  const H = 440;
  const roads = useMemo(() => {
    const r = rng(3);
    const lines: string[] = [];
    for (let i = 0; i < 14; i++) {
      const y = r() * H;
      lines.push(`M-10,${y} C${W * 0.3},${y + (r() - 0.5) * 120} ${W * 0.7},${y + (r() - 0.5) * 120} ${W + 10},${y + (r() - 0.5) * 60}`);
    }
    for (let i = 0; i < 10; i++) {
      const x = r() * W;
      lines.push(`M${x},-10 C${x + (r() - 0.5) * 120},${H * 0.3} ${x + (r() - 0.5) * 120},${H * 0.7} ${x + (r() - 0.5) * 60},${H + 10}`);
    }
    return lines;
  }, []);
  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Rect x="0" y="0" width={W} height={H} fill="#0B1420" />
        <Path d={`M${W * 0.55},-10 C${W * 0.45},${H * 0.25} ${W * 0.75},${H * 0.45} ${W * 0.5},${H * 0.62} S${W * 0.6},${H * 0.9} ${W * 0.4},${H + 10} L${W + 10},${H + 10} L${W + 10},-10 Z`} fill="#0E3440" opacity={0.9} />
        <Path d={`M-10,${H * 0.5} C${W * 0.1},${H * 0.45} ${W * 0.2},${H * 0.6} ${W * 0.12},${H * 0.75} L-10,${H * 0.8} Z`} fill="#0F3A2C" opacity={0.8} />
        {roads.map((d, i) => (
          <Path key={i} d={d} stroke={i % 4 === 0 ? colors.pink : '#3A2A55'} strokeWidth={i % 4 === 0 ? 2.2 : 1.2} fill="none" opacity={i % 4 === 0 ? 0.85 : 0.9} />
        ))}
        {Array.from({ length: 40 }).map((_, i) => (
          <Line key={`g${i}`} x1={(i * 37) % W} y1={(i * 53) % H} x2={((i * 37) % W) + 14} y2={((i * 53) % H) + 6} stroke="#2A1F40" strokeWidth={1} />
        ))}
      </Svg>
    </View>
  );
}

/** Glowing run route drawn over a riverside skyline. */
export function RouteArt({ progress = 1, style }: { progress?: number; style?: StyleProp<ViewStyle> }) {
  const W = 360;
  const H = 420;
  const route = `M${W * 0.18},${H * 0.98} C${W * 0.3},${H * 0.85} ${W * 0.25},${H * 0.72} ${W * 0.42},${H * 0.66} S${W * 0.62},${H * 0.55} ${W * 0.55},${H * 0.45} S${W * 0.62},${H * 0.33} ${W * 0.66},${H * 0.3}`;
  const LEN = 520;
  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <SvgGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#6B1553" />
            <Stop offset="1" stopColor="#12071D" />
          </SvgGradient>
        </Defs>
        <Path d={`M${W},${H * 0.3} L${W},${H} L${W * 0.35},${H} C${W * 0.5},${H * 0.75} ${W * 0.7},${H * 0.5} ${W},${H * 0.3} Z`} fill="url(#water)" opacity={0.7} />
        <Path d={route} stroke={colors.pink} strokeWidth={14} opacity={0.18} fill="none" strokeLinecap="round" />
        <Path d={route} stroke={colors.pinkSoft} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={`${LEN * progress} ${LEN}`} />
        <Circle cx={W * 0.66} cy={H * 0.3} r={11} fill={colors.purple} stroke="#fff" strokeWidth={3} />
      </Svg>
    </View>
  );
}

/** Mini radar/minimap for the Running header. */
export function MiniMap({ size = 70 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2, borderColor: colors.cyan }}>
      <Svg width={size} height={size} viewBox="0 0 70 70">
        <Rect x="0" y="0" width="70" height="70" fill="#0B1420" />
        <Path d="M0,20 L70,30 M0,45 L70,40 M20,0 L28,70 M50,0 L44,70" stroke="#2A3A55" strokeWidth={1.5} />
        <Path d="M12,58 C22,48 30,40 34,32 S52,18 58,12" stroke={colors.pink} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Circle cx="58" cy="12" r="4" fill="#fff" />
      </Svg>
    </View>
  );
}

/** Crew-silhouette runners for feed/crew/banner art. */
export function RunnersArt({ height = 170, style, seed = 11 }: { height?: number; style?: StyleProp<ViewStyle>; seed?: number }) {
  return (
    <View style={[{ height, overflow: 'hidden' }, style]}>
      <CityBackdrop height={height} seed={seed} palms />
      <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {['🏃🏽‍♀️', '🏃🏻', '🏃🏾‍♀️', '🏃🏽'].map((e, i) => (
          <View key={i} style={{ transform: [{ scaleX: -1 }] }}>
            <SvgEmoji e={e} size={height * 0.22} />
          </View>
        ))}
      </View>
    </View>
  );
}

function SvgEmoji({ e, size }: { e: string; size: number }) {
  // Emoji placeholder; swap for brand illustrations later.
  return <Text style={{ fontSize: size }}>{e}</Text>;
}
