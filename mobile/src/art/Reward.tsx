import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { art } from './palette';
import type { RewardArtKind } from '@/types';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const INK = '#1A191A';
const GOLD_HI = '#FFF3B0';
const GOLD = art.yellow;
const GOLD_MID = art.amber;
const GOLD_LO = '#C9701A';

function useUid(): string {
  return React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

const f = (n: number) => n.toFixed(2);

function circ(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

function ell(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
}

function star(cx: number, cy: number, R: number, r: number, n = 5, rot = -90): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (180 / n) * i) * Math.PI) / 180;
    const rad = i % 2 === 0 ? R : r;
    d += `${i === 0 ? 'M' : 'L'}${f(cx + Math.cos(a) * rad)} ${f(cy + Math.sin(a) * rad)} `;
  }
  return d + 'Z';
}

function heart(cx: number, cy: number, s: number): string {
  const p = (x: number, y: number) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, 0.95)} C${p(-1.3, 0.1)} ${p(-1.15, -1)} ${p(-0.52, -1)} C${p(-0.2, -1)} ${p(0, -0.75)} ${p(0, -0.5)} C${p(0, -0.75)} ${p(0.2, -1)} ${p(0.52, -1)} C${p(1.15, -1)} ${p(1.3, 0.1)} ${p(0, 0.95)} Z`;
}

function flame(cx: number, top: number, s: number): string {
  const p = (x: number, y: number) => `${f(cx + x * s)} ${f(top + y * s)}`;
  return (
    `M${p(0, 0)} C${p(6, 18)} ${p(28, 28)} ${p(28, 54)} C${p(28, 76)} ${p(14, 90)} ${p(-2, 90)} ` +
    `C${p(-20, 90)} ${p(-30, 76)} ${p(-30, 60)} C${p(-30, 46)} ${p(-22, 38)} ${p(-18, 28)} ` +
    `C${p(-14, 40)} ${p(-10, 44)} ${p(-6, 44)} C${p(-10, 30)} ${p(-8, 14)} ${p(0, 0)} Z`
  );
}

/** 4-point sparkle */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.18;
  return `M${f(cx)} ${f(cy - r)} Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)} Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)} Z`;
}

function Sparkles({ pts, color = '#FFFFFF' }: { pts: [number, number, number][]; color?: string }) {
  return <Path d={pts.map(([x, y, r]) => sparkle(x, y, r)).join(' ')} fill={color} />;
}

/** flat fill + cel shade band + highlight + rim light + ink outline */
function Shaded({
  id,
  d,
  fill,
  shade,
  hi = '#FFFFFF',
  s = 1,
  rim,
}: {
  id: string;
  d: string;
  fill: string;
  shade: string;
  hi?: string;
  s?: number;
  rim?: string;
}) {
  return (
    <G>
      <Defs>
        <ClipPath id={id}>
          <Path d={d} />
        </ClipPath>
      </Defs>
      <Path d={d} fill={fill} />
      <G clipPath={`url(#${id})`}>
        <Path d={d} transform={`translate(${7 * s} ${6 * s})`} fill="none" stroke={shade} strokeOpacity={0.8} strokeWidth={13 * s} strokeLinejoin="round" />
        <Path d={d} transform={`translate(${-3 * s} ${-3 * s})`} fill="none" stroke={hi} strokeOpacity={0.45} strokeWidth={6 * s} strokeLinejoin="round" />
        {rim ? <Path d={d} transform="translate(2 2)" fill="none" stroke={rim} strokeWidth={3.4} strokeLinejoin="round" /> : null}
      </G>
      <Path d={d} fill="none" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
    </G>
  );
}

/* ------------------------------------------------------------------ */
/* drawings                                                            */
/* ------------------------------------------------------------------ */

const SHOE_UPPER = 'M18 76 L17 50 C17 42 23 37 31 39 L44 45 C49 39 53 35 59 34 L65 36 C71 45 81 52 93 57 C105 61 109 66 109 74 Z';
const SHOE_SOLE = 'M12 75 L110 71 C113 77 112 86 106 90 C102 92 98 92 94 92 L24 93 C16 93 12 89 12 82 Z';

const draw: Record<RewardArtKind, (uid: string) => React.ReactElement> = {
  outfit: (uid) => {
    const pants = 'M14 84 C14 81 16 80 19 80 H101 C104 80 106 81 106 84 V100 C106 103 104 104 101 104 H19 C16 104 14 103 14 100 Z';
    const body = 'M20 50 C20 47 22 46 25 46 H95 C98 46 100 47 100 50 V82 C100 85 98 86 95 86 H25 C22 86 20 85 20 82 Z';
    const hood = 'M34 48 C34 36 45 29 60 29 C75 29 86 36 86 48 L82 58 C73 63 47 63 38 58 Z';
    return (
      <G>
        <Shaded id={`${uid}p`} d={pants} fill={art.pink} shade={art.magenta} hi={art.pinkHi} s={0.5} rim={art.cyan} />
        <Path d="M14 94 H106" stroke="#FFFFFF" strokeWidth={2.6} />
        <Path d="M60 82 V104" stroke={INK} strokeWidth={1.6} strokeOpacity={0.4} />
        <Shaded id={`${uid}b`} d={body} fill={art.purple} shade="#5A575F" hi={art.violet} s={0.7} rim={art.pink} />
        <Path d="M20 55 H36 L40 86 M100 55 H84 L80 86" stroke={INK} strokeWidth={1.8} strokeOpacity={0.5} fill="none" />
        <Path d="M20 78 H37.5 L38.5 86 H25 C22 86 20 85 20 82 Z M100 78 H82.5 L81.5 86 H95 C98 86 100 85 100 82 Z" fill={art.pink} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M46 68 H74 L77 82 H43 Z" fill="none" stroke={INK} strokeWidth={1.8} strokeOpacity={0.55} strokeLinejoin="round" />
        <Shaded id={`${uid}h`} d={hood} fill={art.purple} shade="#5A575F" hi={art.violet} s={0.5} rim={art.pink} />
        <Path d="M42 46 C46 40 74 40 78 46 C73 53 47 53 42 46 Z" fill="#302E33" stroke={INK} strokeWidth={1.8} />
        <Path d="M54 51 L52 67 M66 51 L68 67" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <Path d="M54 51 L52 67 M66 51 L68 67" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
        <Path d="M50.3 66 h3.4 v5 h-3.4 Z M66.3 66 h3.4 v5 h-3.4 Z" fill={art.pink} stroke={INK} strokeWidth={1.2} />
        <Sparkles pts={[[100, 26, 9], [18, 34, 5.5], [108, 62, 4], [28, 18, 3.5]]} />
        <Sparkles pts={[[88, 14, 3.5]]} color={art.cyan} />
      </G>
    );
  },

  badge: (uid) => {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a0 = ((i * 30 - 6) * Math.PI) / 180;
      const a1 = ((i * 30 + 6) * Math.PI) / 180;
      rays += `M60 72 L${f(60 + Math.cos(a0) * 58)} ${f(72 + Math.sin(a0) * 58)} L${f(60 + Math.cos(a1) * 58)} ${f(72 + Math.sin(a1) * 58)} Z `;
    }
    return (
      <G>
        <Defs>
          <RadialGradient id={`${uid}r`} cx="0.5" cy="0.6" r="0.5">
            <Stop offset="0" stopColor={art.sunTop} stopOpacity={0.55} />
            <Stop offset="1" stopColor={art.sunTop} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={GOLD_HI} />
            <Stop offset="0.4" stopColor={GOLD} />
            <Stop offset="0.7" stopColor={GOLD_MID} />
            <Stop offset="1" stopColor={GOLD_HI} />
          </LinearGradient>
        </Defs>
        <Path d={rays} fill={`url(#${uid}r)`} />
        <Path d="M36 6 L52 50 L64 50 L50 6 Z" fill={art.pink} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M84 6 L68 50 L56 50 L70 6 Z" fill={art.cyan} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M42 6 L55 42 M78 6 L65 42" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={2} />
        <Shaded id={`${uid}m`} d={circ(60, 74, 29)} fill={`url(#${uid}g)`} shade={GOLD_LO} hi="#FFFBE6" rim={art.pink} />
        <Path d={circ(60, 74, 21)} fill={GOLD_MID} stroke={GOLD_LO} strokeWidth={2} />
        <Path d={circ(60, 76, 20)} fill="none" stroke="#000000" strokeOpacity={0.12} strokeWidth={3} />
        <Path d={star(60, 75, 14, 6)} fill={GOLD_HI} stroke={GOLD_LO} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d={star(60, 75, 6, 2.6)} fill="#FFFFFF" opacity={0.7} />
        <Sparkles pts={[[92, 52, 9], [26, 60, 6], [98, 90, 4.5], [30, 94, 3.5]]} />
      </G>
    );
  },

  stickers: (uid) => {
    const card = 'M-17 -21 H17 C20 -21 21 -20 21 -17 V17 C21 20 20 21 17 21 H-17 C-20 21 -21 20 -21 17 V-17 C-21 -20 -20 -21 -17 -21 Z';
    const one = (tx: number, ty: number, rot: number, bg: string, emblem: React.ReactElement, id: string) => (
      <G transform={`translate(${tx} ${ty}) rotate(${rot})`}>
        <Path d={card} transform="translate(2 4)" fill="#000000" stroke="#000000" strokeWidth={9} strokeLinejoin="round" opacity={0.35} />
        <Path d={card} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={9} strokeLinejoin="round" />
        <Shaded id={id} d={card} fill={bg} shade="#000000" s={0.45} />
        {emblem}
      </G>
    );
    return (
      <G>
        {one(34, 70, -20, art.cyan, <Path d={star(0, 1, 13, 5.5)} fill={art.yellow} stroke={INK} strokeWidth={2} strokeLinejoin="round" />, `${uid}a`)}
        {one(86, 70, 20, art.orange, <Path d={flame(1, -14, 0.3)} fill={art.yellow} stroke={INK} strokeWidth={2} strokeLinejoin="round" />, `${uid}b`)}
        {one(60, 58, 0, art.pink, <Path d={heart(0, 2, 14)} fill="#FFFFFF" stroke={INK} strokeWidth={2} strokeLinejoin="round" />, `${uid}c`)}
        <Path d="M50 44 Q50 40 55 39" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.9} />
        <Sparkles pts={[[98, 30, 8], [20, 36, 5], [60, 104, 4]]} />
        <Sparkles pts={[[30, 20, 3.5]]} color={art.cyan} />
      </G>
    );
  },

  trail: (uid) => (
    <G>
      <Defs>
        <LinearGradient id={`${uid}p`} x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor={art.pink} stopOpacity={1} />
          <Stop offset="1" stopColor={art.pink} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id={`${uid}c`} x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor={art.cyan} stopOpacity={1} />
          <Stop offset="1" stopColor={art.cyan} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {/* light trail */}
      <Path d="M58 66 C38 60 18 66 0 80 L0 96 C20 84 40 82 60 88 Z" fill={`url(#${uid}p)`} opacity={0.3} />
      <Path d="M60 70 C40 66 20 72 2 84 C20 76 40 76 60 80 Z" fill={`url(#${uid}p)`} />
      <Path d="M60 84 C42 82 24 88 6 98 C24 94 42 92 60 92 Z" fill={`url(#${uid}c)`} />
      <Path d="M58 75 C44 72 30 76 14 82" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.8} />
      <Path d="M58 88 C46 87 34 90 22 95" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.7} />
      <Path d={`${circ(20, 70, 1.6)} ${circ(30, 100, 1.3)} ${circ(10, 90, 1.1)}`} fill={art.pinkHi} />
      {/* sneaker */}
      <G transform="translate(38 20) scale(0.72) rotate(-10 60 70)">
        <Shaded id={`${uid}u`} d={SHOE_UPPER} fill={art.pink} shade={art.magenta} hi={art.pinkHi} rim={art.cyan} />
        <Path d="M18.5 46 C21 40 27 39 32 41 L43 46.5 C38 49 27 50 18.5 48 Z" fill="#2E1B0F" stroke={INK} strokeWidth={2} />
        <Path d="M28 67 L45 57 L44.5 62 L63 51 L52 67.5 L52.5 62.5 Z" fill={art.cyan} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M50 44 L57.5 39.5 M54 48.5 L61.5 44 M58.5 52 L66 47.5 M63.5 55 L71 51" stroke={INK} strokeWidth={4.6} strokeLinecap="round" />
        <Path d="M50 44 L57.5 39.5 M54 48.5 L61.5 44 M58.5 52 L66 47.5 M63.5 55 L71 51" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
        <Shaded id={`${uid}s`} d={SHOE_SOLE} fill="#F6F5F6" shade="#BAB9BB" s={0.5} rim={art.cyan} />
        <Path d="M14 80.5 L111.5 76.5" stroke={art.cyan} strokeWidth={2.6} />
      </G>
      <Sparkles pts={[[100, 28, 8], [30, 40, 4.5], [110, 96, 4]]} />
      <Sparkles pts={[[76, 18, 3.5]]} color={art.cyan} />
    </G>
  ),

  coins: (uid) => {
    const coins: React.ReactElement[] = [];
    for (let i = 0; i < 5; i++) {
      const y = 92 - i * 9;
      const x = 44 + (i % 2 === 0 ? 0 : 2);
      coins.push(
        <G key={i}>
          <Path d={`M${x - 24} ${y} v7 a24 8 0 0 0 48 0 v-7 Z`} fill={GOLD_MID} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <Path d={`M${x - 24} ${y + 3.5} a24 8 0 0 0 48 0`} fill="none" stroke={GOLD_LO} strokeWidth={1.4} strokeDasharray="2 2" />
          <Path d={ell(x, y, 24, 8)} fill={`url(#${uid}t)`} stroke={INK} strokeWidth={2} />
          <Path d={ell(x, y, 16, 5)} fill="none" stroke={GOLD_MID} strokeWidth={1.5} />
        </G>,
      );
    }
    return (
      <G>
        <Defs>
          <LinearGradient id={`${uid}t`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={GOLD_HI} />
            <Stop offset="0.6" stopColor={GOLD} />
            <Stop offset="1" stopColor={GOLD_MID} />
          </LinearGradient>
          <LinearGradient id={`${uid}f`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={GOLD_HI} />
            <Stop offset="0.45" stopColor={GOLD} />
            <Stop offset="1" stopColor={GOLD_MID} />
          </LinearGradient>
        </Defs>
        {coins}
        <Path d={ell(86, 76, 22, 24)} transform="translate(-4 0)" fill={GOLD_LO} stroke={INK} strokeWidth={2.2} />
        <Shaded id={`${uid}c`} d={ell(86, 76, 22, 24)} fill={`url(#${uid}f)`} shade={GOLD_MID} hi="#FFFBE6" s={0.6} rim={art.pink} />
        <Path d={ell(86, 76, 15.5, 17)} fill="none" stroke={GOLD_LO} strokeWidth={2} />
        <Path d={star(86, 77, 11, 4.6)} fill={GOLD_HI} stroke={GOLD_LO} strokeWidth={1.6} strokeLinejoin="round" />
        <Sparkles pts={[[98, 36, 9], [22, 34, 5], [108, 100, 4], [56, 22, 3.5]]} />
      </G>
    );
  },

  chest: (uid) => {
    const body = 'M18 62 H102 V98 C102 101.5 100 104 96 104 H24 C20 104 18 101.5 18 98 Z';
    const lid = 'M18 50 C18 32 34 22 60 22 C86 22 102 32 102 50 V54 H18 Z';
    return (
      <G>
        <Defs>
          <LinearGradient id={`${uid}l`} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={art.pink} stopOpacity={0.85} />
            <Stop offset="1" stopColor={art.pink} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${uid}gd`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={GOLD_HI} />
            <Stop offset="0.5" stopColor={GOLD} />
            <Stop offset="1" stopColor={GOLD_MID} />
          </LinearGradient>
        </Defs>
        {/* light beams */}
        <Path d="M32 58 L14 10 L38 6 L46 58 Z M53 58 L50 0 L70 0 L67 58 Z M74 58 L82 6 L106 10 L88 58 Z" fill={`url(#${uid}l)`} opacity={0.6} />
        <Path d="M22 60 C40 52 80 52 98 60 L98 64 H22 Z" fill={art.pinkHi} />
        <Path d="M30 58 C44 52 76 52 90 58" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.9} />
        <G transform="translate(0 -6) rotate(-6 18 54)">
          <Shaded id={`${uid}t`} d={lid} fill={art.purple} shade="#4E4C53" hi={art.violet} rim={art.pink} />
          <Path d="M30 27.5 V54 H38 V24.5 Z M82 24.5 V54 H90 V27.5 Z" fill={`url(#${uid}gd)`} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M18 48 H102 V54 H18 Z" fill={`url(#${uid}gd)`} stroke={INK} strokeWidth={1.8} />
        </G>
        <Shaded id={`${uid}b`} d={body} fill={art.purple} shade="#4E4C53" hi={art.violet} rim={art.pink} />
        <Path d="M30 62 H38 V104 H30 Z M82 62 H90 V104 H82 Z M18 62 H102 V68 H18 Z" fill={`url(#${uid}gd)`} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d="M52 64 H68 V80 C68 84 64 86 60 86 C56 86 52 84 52 80 Z" fill={`url(#${uid}gd)`} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <Path d={`${circ(60, 73, 2.6)} M58.8 74 h2.4 l0.8 6 h-4 Z`} fill={INK} />
        <Path d={`${circ(22, 66, 1.2)} ${circ(98, 66, 1.2)} ${circ(22, 99, 1.2)} ${circ(98, 99, 1.2)}`} fill={GOLD_LO} />
        <Sparkles pts={[[100, 18, 8], [18, 20, 5], [62, 10, 4], [110, 70, 3.5]]} />
        <Sparkles pts={[[40, 12, 3.5]]} color={art.cyan} />
      </G>
    );
  },
};

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export const RewardArt = React.memo(function RewardArt(props: { kind: RewardArtKind; size?: number; style?: StyleProp<ViewStyle> }) {
  const { kind, size = 96, style } = props;
  const uid = useUid();
  const Draw = draw[kind] ?? draw.chest;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" style={style}>
      <Defs>
        <RadialGradient id={`${uid}bg`} cx="0.5" cy="0.55" r="0.5">
          <Stop offset="0" stopColor={art.pink} stopOpacity={0.35} />
          <Stop offset="0.55" stopColor={art.purple} stopOpacity={0.14} />
          <Stop offset="1" stopColor={art.purple} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}sh`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={60} cy={62} rx={58} ry={56} fill={`url(#${uid}bg)`} />
      <Ellipse cx={60} cy={110} rx={40} ry={6} fill={`url(#${uid}sh)`} />
      {Draw(uid)}
    </Svg>
  );
});

export default RewardArt;
