/* charts.tsx — hand-rolled SVG analytics for the session report.
   No charting library. Every chart renders at its MEASURED pixel width (via useMeasure)
   so strokes and labels stay crisp 1:1 instead of being scaled up from a fixed viewBox.
   Themed to the FitSync tokens (Q quality scale, #5B7CFF accent, Barlow). */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Q } from '../../tokens'

const ACCENT = '#22D3EE'   // V2 blue→cyan accent (was indigo #5B7CFF)
const GRID = 'rgba(255,255,255,0.07)'
const INK = 'rgba(237,239,244,0.6)'
const FAINT = 'rgba(237,239,244,0.34)'
const numStyle = { fontFamily: 'var(--num)', fontVariantNumeric: 'tabular-nums' } as const
const lblStyle = { fontFamily: 'var(--ui)' } as const

/* form-score → quality colour (shared with the live HUD scale). */
export function scoreColor(v: number): string {
  return v >= 80 ? Q.green : v >= 65 ? Q.amber : Q.red
}

/* ── measure container width so SVGs render at real pixels (crisp, never stretched) ── */
function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)))
    ro.observe(el)
    setW(Math.round(el.clientWidth))
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
function Measured({ height, children }: { height: number; children: (w: number) => ReactNode }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  return <div ref={ref} style={{ width: '100%', height }}>{w > 8 ? children(w) : null}</div>
}

/* Catmull-Rom → cubic-bezier smoothing for a premium line. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : ''
  const t = 0.16
  const d = [`M ${pts[0][0]} ${pts[0][1]}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)]
    d.push(`C ${x1 + (x2 - x0) * t} ${y1 + (y2 - y0) * t} ${x2 - (x3 - x1) * t} ${y2 - (y3 - y1) * t} ${x2} ${y2}`)
  }
  return d.join(' ')
}

/* ---------- Score ring (hero metric, Whoop-style) ---------- */
export function ScoreRing(
  { value, size = 128, stroke = 11, sublabel }:
  { value: number | null; size?: number; stroke?: number; sublabel?: string },
) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  const col = value == null ? FAINT : scoreColor(value)
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block', filter: value == null ? 'none' : `drop-shadow(0 0 9px ${col}55)` }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ ...numStyle, fontWeight: 600, fontSize: size * 0.34, color: value == null ? '#9aa0ad' : '#EDEFF4', lineHeight: 1 }}>
            {value == null ? '—' : Math.round(value)}
          </div>
          {sublabel && <div style={{ ...lblStyle, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: FAINT, marginTop: 4 }}>{sublabel}</div>}
        </div>
      </div>
    </div>
  )
}

/* ---------- Segmented quality bar (good / borderline / poor) ---------- */
export function QualityBar({ good, borderline, poor, height = 8 }: { good: number; borderline: number; poor: number; height?: number }) {
  const seg = (n: number, col: string) => (n > 0 ? <div style={{ flex: n, background: col }} /> : null)
  const empty = good + borderline + poor === 0
  return (
    <div style={{ display: 'flex', height, borderRadius: height / 2, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
      {!empty && <>{seg(good, Q.green)}{seg(borderline, Q.amber)}{seg(poor, Q.red)}</>}
    </div>
  )
}

/* ---------- Form score per rep (the primary trend) ----------
   Smooth area+line, 0/50/100 gridlines, a tinted ≥80 "good zone", set dividers with
   labels, and quality-coloured rep markers. Crisp at the measured pixel width. */
type RepPoint = { rep: number; score: number; set: number; time_s?: number | null }
export function FormLine({ data, height = 260 }: { data: RepPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <Measured height={height}>
      {(W) => {
        const padL = 38, padR = 18, padT = 22, padB = 30
        const plotW = W - padL - padR, plotH = height - padT - padB
        const n = data.length
        const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
        const y = (v: number) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH
        const pts = data.map((d, i) => [x(i), y(d.score)] as [number, number])
        const line = smoothPath(pts)
        const area = n ? `${line} L ${x(n - 1)} ${padT + plotH} L ${padL} ${padT + plotH} Z` : ''
        const step = Math.max(1, Math.ceil(n / 12))
        // set dividers at the boundary between consecutive reps of different sets
        const dividers: { x: number; set: number; mid: number }[] = []
        const setFirst: Record<number, number> = {}
        data.forEach((d, i) => { if (!(d.set in setFirst)) setFirst[d.set] = i })
        const setIds = Object.keys(setFirst).map(Number).sort((a, b) => a - b)
        setIds.forEach((s, k) => {
          const startI = setFirst[s]
          const endI = k + 1 < setIds.length ? setFirst[setIds[k + 1]] - 1 : n - 1
          if (k > 0) dividers.push({ x: (x(startI) + x(startI - 1)) / 2, set: s, mid: (x(startI) + x(endI)) / 2 })
          else dividers.push({ x: -1, set: s, mid: (x(startI) + x(endI)) / 2 })
        })
        return (
          <svg width={W} height={height} style={{ display: 'block' }}>
            <defs>
              <linearGradient id="flArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.34} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            {/* good zone ≥80 */}
            <rect x={padL} y={y(100)} width={plotW} height={y(80) - y(100)} fill={Q.green} opacity={0.05} />
            <line x1={padL} x2={W - padR} y1={y(80)} y2={y(80)} stroke={`${Q.green}40`} strokeWidth={1} strokeDasharray="3 4" />
            {/* y gridlines */}
            {[0, 50, 100].map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 8} y={y(t) + 3.5} fill={FAINT} fontSize={10} textAnchor="end" style={numStyle}>{t}</text>
              </g>
            ))}
            {/* set dividers + labels */}
            {dividers.map((d, i) => (
              <g key={i}>
                {d.x > 0 && <line x1={d.x} x2={d.x} y1={padT - 6} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="2 5" />}
                <text x={d.mid} y={padT - 9} fill={FAINT} fontSize={9.5} textAnchor="middle" style={{ ...lblStyle, letterSpacing: '.14em', textTransform: 'uppercase' }}>Set {d.set}</text>
              </g>
            ))}
            {n > 0 && <path d={area} fill="url(#flArea)" />}
            {n > 1 && <path d={line} fill="none" stroke={ACCENT} strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 4px 10px ${ACCENT}40)` }} />}
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d.score)} r={hover === i ? (n > 24 ? 4.5 : 6) : (n > 24 ? 3 : 4.2)}
                fill={scoreColor(d.score)} stroke="#0A0C12" strokeWidth={2} style={{ transition: 'r .12s' }} />
            ))}
            {data.map((d, i) => (i % step === 0 || i === n - 1)
              ? <text key={`l${i}`} x={x(i)} y={height - 9} fill={INK} fontSize={10} textAnchor="middle" style={numStyle}>{d.rep}</text>
              : null)}
            {/* hover hit bands (transparent) — reveal the rep's score tooltip */}
            {data.map((_, i) => {
              const band = n <= 1 ? plotW : plotW / (n - 1)
              return (
                <rect key={`hit${i}`} x={x(i) - band / 2} y={padT} width={band} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))} />
              )
            })}
            {/* tooltip */}
            {hover != null && hover < n && (() => {
              const d = data[hover]; const px = x(hover); const py = y(d.score)
              const hasTime = d.time_s != null
              const bw = 76, bh = hasTime ? 52 : 40
              const bx = Math.max(padL, Math.min(W - padR - bw, px - bw / 2))
              const by = Math.max(2, py - bh - 12)
              const col = scoreColor(d.score)
              return (
                <g pointerEvents="none">
                  <line x1={px} x2={px} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="2 3" />
                  <circle cx={px} cy={py} r={7} fill="none" stroke={col} strokeWidth={2} />
                  <rect x={bx} y={by} width={bw} height={bh} rx={9} fill="rgba(14,16,21,0.97)" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
                  <text x={bx + bw / 2} y={by + 19} fill={col} fontSize={17} fontWeight={700} textAnchor="middle" style={numStyle}>{d.score}</text>
                  <text x={bx + bw / 2} y={by + 32} fill={INK} fontSize={10} textAnchor="middle" style={{ ...lblStyle, letterSpacing: '.06em' }}>REP {d.rep}</text>
                  {hasTime && <text x={bx + bw / 2} y={by + 45} fill={FAINT} fontSize={10.5} textAnchor="middle" style={numStyle}>{d.time_s}s</text>}
                </g>
              )
            })()}
          </svg>
        )
      }}
    </Measured>
  )
}

/* ---------- Depth (ROM) achieved per rep (vertical bars + target line) ----------
   rom = the rep's peak depth as a percent (100 = hips level with knees). Bars at/above the
   `target` depth gate are green (full rep); below it are amber (shallow). y-axis auto-scales
   past 100 for below-parallel (ATG) reps. */
type RomDatum = { rep: number; set: number; rom: number }
export function RomBars(
  { data, target, height = 220 }:
  { data: RomDatum[]; target?: number; height?: number },
) {
  return (
    <Measured height={height}>
      {(W) => {
        const padL = 34, padR = 16, padT = 22, padB = 30
        const plotW = W - padL - padR, plotH = height - padT - padB
        const n = data.length || 1
        const maxRom = data.reduce((m, d) => Math.max(m, d.rom), 0)
        const yMax = Math.max(100, Math.ceil((Math.max(maxRom, target ?? 0) + 5) / 10) * 10)
        const slot = plotW / n
        const bw = Math.min(46, slot * 0.6)
        const y = (v: number) => padT + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH
        const ticks = yMax > 100 ? [0, 50, 100, yMax] : [0, 50, 100]
        const step = Math.max(1, Math.ceil(data.length / 14))
        return (
          <svg width={W} height={height} style={{ display: 'block' }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 8} y={y(t) + 3.5} fill={FAINT} fontSize={10} textAnchor="end" style={numStyle}>{t}</text>
              </g>
            ))}
            {/* target depth gate — reps below this are shallow */}
            {target != null && (
              <g>
                <line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke={`${Q.green}66`} strokeWidth={1} strokeDasharray="3 4" />
                <text x={W - padR} y={y(target) - 5} fill={`${Q.green}cc`} fontSize={9.5} textAnchor="end" style={{ ...lblStyle, letterSpacing: '.08em' }}>TARGET {target}</text>
              </g>
            )}
            {data.map((d, i) => {
              const cx = padL + slot * i + slot / 2
              const ok = target == null || d.rom >= target
              const col = ok ? Q.green : Q.amber
              const top = y(d.rom)
              return (
                <g key={i}>
                  <rect x={cx - bw / 2} y={top} width={bw} height={padT + plotH - top} rx={5} fill={col} opacity={0.9} />
                  {data.length <= 12 && <text x={cx} y={top - 6} fill="#EDEFF4" fontSize={11} textAnchor="middle" style={numStyle}>{d.rom}</text>}
                  {(i % step === 0 || i === data.length - 1) && (
                    <text x={cx} y={height - 9} fill={INK} fontSize={10} textAnchor="middle" style={numStyle}>{d.rep}</text>
                  )}
                </g>
              )
            })}
          </svg>
        )
      }}
    </Measured>
  )
}

/* ---------- Average form score per set (vertical bars) ----------
   Doubles as the detail page's SET SELECTOR: when `onSelect` is given, bars are clickable;
   the selected set is highlighted and the rest dim. `selected = null` ⇒ all sets active. */
export function SetBars(
  { data, height = 220, selected = null, onSelect }:
  { data: { set: number; score: number; reps: number; time_s?: number | null }[]; height?: number; selected?: number | null; onSelect?: (set: number) => void },
) {
  return (
    <Measured height={height}>
      {(W) => {
        const padL = 34, padR = 14, padT = 24, padB = 34
        const plotW = W - padL - padR, plotH = height - padT - padB
        const n = data.length || 1
        const slot = plotW / n
        const bw = Math.min(74, slot * 0.5)
        const y = (v: number) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH
        const interactive = !!onSelect
        return (
          <svg width={W} height={height} style={{ display: 'block' }}>
            {[0, 50, 100].map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 8} y={y(t) + 3.5} fill={FAINT} fontSize={10} textAnchor="end" style={numStyle}>{t}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = padL + slot * i + slot / 2
              const col = scoreColor(d.score)
              const top = y(d.score)
              const active = selected == null || selected === d.set
              const isSel = selected === d.set
              return (
                <g key={i} onClick={interactive ? () => onSelect!(d.set) : undefined}
                  style={{ cursor: interactive ? 'pointer' : 'default', opacity: active ? 1 : 0.38, transition: 'opacity .2s' }}>
                  <rect x={cx - bw / 2} y={padT} width={bw} height={plotH} rx={7}
                    fill={isSel ? `${col}1f` : 'rgba(255,255,255,0.04)'} stroke={isSel ? `${col}cc` : 'none'} strokeWidth={1.5} />
                  <rect x={cx - bw / 2} y={top} width={bw} height={padT + plotH - top} rx={7} fill={col} opacity={0.92} />
                  <text x={cx} y={top - 8} fill="#EDEFF4" fontSize={13} textAnchor="middle" style={numStyle}>{d.score}</text>
                  <text x={cx} y={height - 16} fill={isSel ? col : INK} fontSize={11} fontWeight={isSel ? 700 : 400} textAnchor="middle" style={lblStyle}>Set {d.set}</text>
                  <text x={cx} y={height - 4} fill={FAINT} fontSize={9.5} textAnchor="middle" style={lblStyle}>
                    {d.reps} reps{d.time_s != null ? ` · ${d.time_s}s` : ''}
                  </text>
                  {/* full-slot hit area for easy clicking */}
                  {interactive && <rect x={padL + slot * i} y={0} width={slot} height={height} fill="transparent" />}
                </g>
              )
            })}
          </svg>
        )
      }}
    </Measured>
  )
}

/* ---------- Trend line: a metric across sessions (form score over time) ---------- */
export function TrendLine({ data, height = 240, target = 80 }: { data: { label: string; value: number }[]; height?: number; target?: number }) {
  return (
    <Measured height={height}>
      {(W) => {
        const padL = 38, padR = 18, padT = 20, padB = 30
        const plotW = W - padL - padR, plotH = height - padT - padB
        const n = data.length
        const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
        const y = (v: number) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH
        const pts = data.map((d, i) => [x(i), y(d.value)] as [number, number])
        const line = smoothPath(pts)
        const area = n ? `${line} L ${x(n - 1)} ${padT + plotH} L ${padL} ${padT + plotH} Z` : ''
        const step = Math.max(1, Math.ceil(n / 8))
        return (
          <svg width={W} height={height} style={{ display: 'block' }}>
            <defs>
              <linearGradient id="trArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <rect x={padL} y={y(100)} width={plotW} height={y(target) - y(100)} fill={Q.green} opacity={0.05} />
            <line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke={`${Q.green}40`} strokeWidth={1} strokeDasharray="3 4" />
            {[0, 50, 100].map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 8} y={y(t) + 3.5} fill={FAINT} fontSize={10} textAnchor="end" style={numStyle}>{t}</text>
              </g>
            ))}
            {n > 0 && <path d={area} fill="url(#trArea)" />}
            {n > 1 && <path d={line} fill="none" stroke={ACCENT} strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 4px 10px ${ACCENT}40)` }} />}
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(d.value)} r={n > 20 ? 3.2 : 4.4} fill={scoreColor(d.value)} stroke="#0A0C12" strokeWidth={2} />
            ))}
            {data.map((d, i) => (i % step === 0 || i === n - 1)
              ? <text key={`l${i}`} x={x(i)} y={height - 9} fill={INK} fontSize={10} textAnchor="middle" style={lblStyle}>{d.label}</text>
              : null)}
          </svg>
        )
      }}
    </Measured>
  )
}

/* ---------- Generic accent bars across a series (e.g. reps / volume per session) ---------- */
export function SeriesBars({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) {
  return (
    <Measured height={height}>
      {(W) => {
        const padL = 30, padR = 14, padT = 22, padB = 30
        const plotW = W - padL - padR, plotH = height - padT - padB
        const n = data.length || 1
        const top = Math.max(1, ...data.map((d) => d.value))
        const slot = plotW / n
        const bw = Math.min(56, slot * 0.5)
        const y = (v: number) => padT + plotH - (v / top) * plotH
        return (
          <svg width={W} height={height} style={{ display: 'block' }}>
            <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke={GRID} strokeWidth={1} />
            {data.map((d, i) => {
              const cx = padL + slot * i + slot / 2
              const t = y(d.value)
              return (
                <g key={i}>
                  <rect x={cx - bw / 2} y={t} width={bw} height={padT + plotH - t} rx={6} fill={ACCENT} opacity={0.9} />
                  <text x={cx} y={t - 7} fill="#EDEFF4" fontSize={11.5} textAnchor="middle" style={numStyle}>{d.value}</text>
                  <text x={cx} y={height - 9} fill={INK} fontSize={10} textAnchor="middle" style={lblStyle}>{d.label}</text>
                </g>
              )
            })}
          </svg>
        )
      }}
    </Measured>
  )
}

/* ---------- Donut (rep-quality split) with center total + legend ----------
   Drawn with the stroke-dasharray technique (each segment is an arc of one stroked
   circle) — robust and gap-friendly, unlike hand-rolled wedge paths. */
type Seg = { label: string; value: number; color: string }
export function Donut({ data, centerNum, centerLabel }: { data: Seg[]; centerNum: ReactNode; centerLabel: string }) {
  const size = 168, cx = size / 2, cy = size / 2, sw = 22
  const r = (size - sw) / 2 - 3
  const circ = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const gap = data.length > 1 ? 2 : 0 // small px gap between segments
  let acc = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: 'none', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
          {data.map((d, i) => {
            const len = (d.value / total) * circ
            const seg = (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw}
                strokeDasharray={`${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}`}
                strokeDashoffset={-acc} strokeLinecap="butt" />
            )
            acc += len
            return seg
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ ...numStyle, fontWeight: 600, fontSize: 34, color: '#EDEFF4', lineHeight: 1 }}>{centerNum}</div>
            <div style={{ ...lblStyle, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: FAINT, marginTop: 3 }}>{centerLabel}</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0, flex: 1 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: 4, background: d.color, flex: 'none' }} />
            <span style={{ ...lblStyle, fontSize: 13, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span style={{ ...numStyle, fontSize: 13, color: '#EDEFF4', marginLeft: 'auto' }}>{d.value}</span>
            <span style={{ ...numStyle, fontSize: 11.5, color: FAINT, width: 38, textAlign: 'right' }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
        {data.length === 0 && <span style={{ ...lblStyle, fontSize: 13, color: FAINT }}>No reps recorded.</span>}
      </div>
    </div>
  )
}

/* ---------- Ranked faults: share-of-points-lost bar + flagged count + avg score ---------- */
type Fault = { issue_name: string; penalty_share: number; flagged_reps: number; avg_score: number; color: string }
export function FaultRanked({ data }: { data: Fault[] }) {
  if (!data.length) return <div style={{ ...lblStyle, fontSize: 13, color: FAINT, padding: '20px 2px' }}>Nothing flagged — clean movement. 💪</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: 'var(--v2-disp)', fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--v2-ink)' }}>{d.issue_name}</span>
            <span style={{ fontFamily: 'var(--v2-mono)', fontSize: 11.5, color: 'var(--v2-mute)', whiteSpace: 'nowrap' }}>
              <b style={{ color: 'var(--v2-ink)', fontWeight: 600 }}>{Math.round(d.penalty_share * 100)}%</b> · {d.flagged_reps} rep{d.flagged_reps === 1 ? '' : 's'} · avg {d.avg_score}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(3, d.penalty_share * 100)}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #3B82F6, #22D3EE)', transition: 'width .6s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* score 0–100 → a solid PASTEL red→amber→green fill (fixed lightness so dark text always reads).
   50 and below = red; 100 = green. */
function heatFill(v: number): string {
  const t = Math.max(0, Math.min(1, (v - 50) / 50))
  return `hsl(${t * 140}, 50%, 66%)`
}

/* ---------- Heatmap: rule × phase, crisp at measured width ---------- */
export function Heatmap(
  { rows, cols, value, rowLabel, height }:
  { rows: string[]; cols: string[]; value: (row: string, col: string) => number | null; rowLabel: (row: string) => string; height?: number },
) {
  const rh = 46, headH = 26, labelW = 168
  const H = height ?? headH + rows.length * rh
  return (
    <Measured height={H}>
      {(W) => {
        const cellW = (W - labelW) / Math.max(1, cols.length)
        return (
          <svg width={W} height={H} style={{ display: 'block' }}>
            {cols.map((c, j) => (
              <text key={c} x={labelW + j * cellW + cellW / 2} y={15} fill={INK} fontSize={10.5} textAnchor="middle"
                style={{ ...lblStyle, textTransform: 'uppercase', letterSpacing: '.1em' }}>{c}</text>
            ))}
            {rows.map((row, i) => {
              const yy = headH + i * rh
              return (
                <g key={row}>
                  <text x={0} y={yy + rh / 2 + 4} fill="#EDEFF4" fontSize={13} style={lblStyle}>{rowLabel(row)}</text>
                  {cols.map((c, j) => {
                    const v = value(row, c)
                    const x = labelW + j * cellW
                    const filled = v != null
                    return (
                      <g key={c}>
                        <rect x={x + 4} y={yy + 4} width={cellW - 8} height={rh - 8} rx={9}
                          fill={filled ? heatFill(v as number) : 'rgba(255,255,255,0.035)'}
                          stroke={filled ? 'none' : GRID} strokeWidth={1} />
                        <text x={x + cellW / 2} y={yy + rh / 2 + 4.5} fill={filled ? '#08110C' : FAINT} fontSize={13} fontWeight={filled ? 600 : 400} textAnchor="middle" style={numStyle}>
                          {v == null ? '—' : v}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        )
      }}
    </Measured>
  )
}
