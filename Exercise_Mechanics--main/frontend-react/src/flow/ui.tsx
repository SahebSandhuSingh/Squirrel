/* ui.tsx — shared premium atoms for the pre-coach flow screens (landing, onboarding,
   welcome, modes). Reuses the global tokens (fonts via --num/--ui, accent --accent,
   quality scale Q) so the onboarding flow is visually one product with the HUD.
   Pseudo-state styling (focus/hover) lives in index.html as .fs-* classes. */
import type { CSSProperties, ReactNode } from 'react'
import { TYPE } from '../tokens'

export const ACCENT = '#5B7CFF'

/* Full-board screen surface: deep gradient + accent floor-glow, centered column.
   Every flow screen sits on this so they share one backdrop. */
export function Screen({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="fs-screen"
      style={{
        position: 'absolute', inset: 0, color: 'var(--q-neutral)',
        background:
          'radial-gradient(900px 520px at 50% 116%, rgba(91,124,255,0.20), transparent 62%),' +
          'linear-gradient(180deg, #0A0C12 0%, #070809 100%)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* FitSync logomark — a pulse/activity line inside a ring (fitness + "sync"). */
export function Mark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="21" stroke={ACCENT} strokeWidth="2.5" opacity="0.5" />
      <path
        d="M9 24h7l3.5-9 5 18 3.5-9H39"
        stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 6px ${ACCENT}aa)` }}
      />
    </svg>
  )
}

/* Wordmark — "FitSync" with the Sync in accent. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span style={{ ...TYPE.label, fontSize: size, letterSpacing: '.10em', color: 'var(--q-neutral)' }}>
      PLEX<span style={{ color: ACCENT }}>GO</span>
    </span>
  )
}

export function PrimaryButton(
  { children, onClick, disabled, type = 'button', full, style }:
  { children: ReactNode; onClick?: () => void; disabled?: boolean
    type?: 'button' | 'submit'; full?: boolean; style?: CSSProperties },
) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className="fs-btn fs-btn-primary"
      style={{ ...TYPE.body, width: full ? '100%' : undefined, ...style }}
    >
      {children}
    </button>
  )
}

export function GhostButton(
  { children, onClick, full, style }:
  { children: ReactNode; onClick?: () => void; full?: boolean; style?: CSSProperties },
) {
  return (
    <button
      type="button" onClick={onClick}
      className="fs-btn fs-btn-ghost"
      style={{ ...TYPE.body, width: full ? '100%' : undefined, ...style }}
    >
      {children}
    </button>
  )
}

/* Quiet text link (e.g. "Not you? Start over"). */
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="fs-link" style={{ ...TYPE.body }}>
      {children}
    </button>
  )
}
