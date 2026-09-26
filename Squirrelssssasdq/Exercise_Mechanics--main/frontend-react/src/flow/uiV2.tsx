/* uiV2.tsx — shared atoms for the V2 flat entry screens (landing / onboarding /
   returning): near-black flat surfaces, white pill CTAs, Space Grotesk display,
   JetBrains Mono readouts. The pose-keypoint "node" is the brand motif — it is
   the logomark, the headline full stop and every live/status dot. Green is
   status-only (live, tracked, active step), never a button color. The older
   flow screens (modes, workspace, coach) keep the ui.tsx atoms untouched. */
import type { CSSProperties, ReactNode } from 'react'

/* Primary = white pill with near-black text (the CTA); ghost = hairline pill. */
export function PillButton(
  { children, onClick, disabled, type = 'button', variant = 'primary', small, style }:
  { children: ReactNode; onClick?: () => void; disabled?: boolean
    type?: 'button' | 'submit'; variant?: 'primary' | 'ghost'; small?: boolean; style?: CSSProperties },
) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={`v2-btn v2-btn--${variant}${small ? ' v2-btn--sm' : ''}`}
      style={style}
    >
      {children}
    </button>
  )
}

/* Quiet pill-shaped text button (nav links, "← Back"). */
export function NavLink({ children, onClick, style }: { children: ReactNode; onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} className="v2-navlink" style={style}>
      {children}
    </button>
  )
}

/* Mono uppercase kicker. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="v2-eyebrow">{children}</span>
}

/* The keypoint-node full stop that ends V2 headlines. Sized in em so it scales
   with whatever heading it terminates. `pulse` fires a one-time expanding ring
   after the headline settles — a rep being registered. */
export function NodePeriod({ pulse }: { pulse?: boolean }) {
  return <span className={`v2-period${pulse ? ' v2-period--pulse' : ''}`} aria-hidden />
}

/* The brand: the name set as the logotype — thin geometric caps, wide air
   between letters. No mark; the word is the logo. */
export function Wordmark({ size = 15 }: { size?: number }) {
  return <span className="v2-wordmark" style={{ fontSize: size }}>Exercise Mechanics</span>
}
