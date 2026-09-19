/* tokens.tsx — Foundations (quality color scale, type hierarchy), icon set, shared atoms.
   Defined ONCE here and reused by every component/frame. Ported verbatim in look from the
   design prototype's tokens.jsx; typed for TS. */
import type { CSSProperties, ReactNode } from 'react'

/* ---- Quality Color Scale (single source of truth) ---- */
export const Q = {
  red: '#FF4D5E',
  amber: '#FFB02E',
  green: '#35D98A',
  neutral: '#EDEFF4',
  dim: 'rgba(237,239,244,0.45)',
} as const

export type QualityToken =
  | 'good' | 'green' | 'success' | 'achieved'
  | 'amber' | 'warning' | 'caution' | 'near'
  | 'poor' | 'red' | 'error' | 'fail'
  | 'missed' | 'neutral' | string | null | undefined

/* Form-score → quality bucket. The SINGLE 50/80 source of truth, shared by the rep number and
   the rep ticks so their colours can never drift apart: <50 poor · 50–79 amber · ≥80 good. */
export function formBand(score: number): 'good' | 'amber' | 'poor' {
  return score < 50 ? 'poor' : score < 80 ? 'amber' : 'good'
}

/* Map any quality token -> color. Keeps the scale consistent across
   skeleton joints, cues, rep ticks, ROM, form score, summary. */
export function qColor(token: QualityToken): string {
  switch (token) {
    case 'good': case 'green': case 'success': case 'achieved': return Q.green
    case 'amber': case 'warning': case 'caution': case 'near': return Q.amber
    case 'poor': case 'red': case 'error': case 'fail': return Q.red
    default: return Q.neutral // pending / inactive / neutral
  }
}

/* Type Hierarchy — reusable inline style fragments */
export const TYPE: Record<'hero' | 'label' | 'body' | 'caption', CSSProperties> = {
  hero: { fontFamily: 'var(--num)', fontWeight: 600, lineHeight: 0.92, fontVariantNumeric: 'tabular-nums', letterSpacing: '.01em' },
  label: { fontFamily: 'var(--ui)', textTransform: 'uppercase', letterSpacing: '.16em', fontWeight: 600 },
  body: { fontFamily: 'var(--ui)', fontWeight: 500 },
  caption: { fontFamily: 'var(--ui)', fontWeight: 500, letterSpacing: '.02em' },
}

/* ---- Icon set (inline SVG; never rely on color alone) ---- */
type IcoProps = {
  d?: string
  paths?: ReactNode
  size?: number
  stroke?: string
  sw?: number
  fill?: string
  style?: CSSProperties
}
export function Ico({ d, paths, size = 18, stroke = 'currentColor', sw = 2, fill = 'none', style }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d ? <path d={d} /> : null}
      {paths}
    </svg>
  )
}

type IconFn = (p: Omit<IcoProps, 'd' | 'paths'>) => ReactNode
export const Icon: Record<string, IconFn> = {
  check: (p) => <Ico {...p} d="M20 6 9 17l-5-5" />,
  x: (p) => <Ico {...p} paths={<><path d="M18 6 6 18" /><path d="M6 6l12 12" /></>} />,
  alert: (p) => <Ico {...p} paths={<><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>} />,
  info: (p) => <Ico {...p} paths={<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>} />,
  pause: (p) => <Ico {...p} paths={<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>} />,
  play: (p) => <Ico {...p} fill="currentColor" stroke="none" d="M7 4.5v15l13-7.5z" />,
  restart: (p) => <Ico {...p} paths={<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v4h4" /></>} />,
  skip: (p) => <Ico {...p} paths={<><path d="M5 4l10 8-10 8z" /><path d="M19 5v14" /></>} />,
  power: (p) => <Ico {...p} paths={<><path d="M12 3v9" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></>} />,
  camera: (p) => <Ico {...p} paths={<><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="12.5" r="3.2" /></>} />,
  sun: (p) => <Ico {...p} paths={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></>} />,
  frame: (p) => <Ico {...p} paths={<><path d="M3 8V5a2 2 0 0 1 2-2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /></>} />,
  bolt: (p) => <Ico {...p} fill="currentColor" stroke="none" d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  volume: (p) => <Ico {...p} paths={<><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M17 8a5 5 0 0 1 0 8" /></>} />,
  chevD: (p) => <Ico {...p} d="M6 9l6 6 6-6" />,
  chevU: (p) => <Ico {...p} d="M18 15l-6-6-6 6" />,
  dumbbell: (p) => <Ico {...p} paths={<><path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" /></>} />,
  target: (p) => <Ico {...p} paths={<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".6" fill="currentColor" /></>} />,
  arrowL: (p) => <Ico {...p} paths={<><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>} />,
}

/* ---- Small shared atoms ---- */

/* Uppercase HUD label */
export function L({ children, style, color = 'var(--ink-dim)' }: { children: ReactNode; style?: CSSProperties; color?: string }) {
  return <span style={{ ...TYPE.label, fontSize: 12, color, ...style }}>{children}</span>
}

/* Circular progress ring used by Timer (C8) and Form Score (C7). */
export function Ring({
  size = 92, stroke = 8, progress = 0, color = Q.neutral,
  track = 'rgba(255,255,255,0.14)', dim = false, children, glow = false,
}: {
  size?: number; stroke?: number; progress?: number; color?: string
  track?: string; dim?: boolean; children?: ReactNode; glow?: boolean
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div style={{ position: 'relative', width: size, height: size, opacity: dim ? 0.4 : 1, transition: 'opacity .35s' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block', filter: glow ? `drop-shadow(0 0 6px ${color}66)` : 'none' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset .4s ease, stroke .35s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

/* Frosted HUD surface */
export function Glass({ children, style, pad = 14, radius = 16 }: { children: ReactNode; style?: CSSProperties; pad?: number; radius?: number }) {
  return (
    <div style={{
      background: 'rgba(12,14,18,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: radius, padding: pad, ...style,
    }}>{children}</div>
  )
}

export function fmtClock(sec: number): string {
  sec = Math.max(0, Math.round(sec))
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
