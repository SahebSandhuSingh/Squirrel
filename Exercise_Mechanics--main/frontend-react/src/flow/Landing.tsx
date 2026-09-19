/* Landing.tsx — a two-screen scroll story. Screen 1 is only the name: FitSync,
   huge, centre stage (no corner brand here — the name IS the screen). Scrolling
   pins the name in place while the pitch slides up over it; the name recedes
   (scales down + fades, driven directly by scroll progress) and the pitch —
   "Book a coach, or become one." + actions — rises in staggered once reached.
   Snap scrolling lands cleanly on either screen; the bottom hint auto-scrolls.
   Entry choice: new here → onboarding; existing user → the returning page
   (only offered when a profile is cached on this device). */
import { useRef, useState } from 'react'
import { NodePeriod, PillButton } from './uiV2'

export function Landing(
  { onNew, onExisting, hasProfiles }:
  { onNew: () => void; onExisting: () => void; hasProfiles: boolean },
) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)          // scroll progress: 0 = name, 1 = pitch
  const [pitchIn, setPitchIn] = useState(false) // pitch entrance fires once

  const onScroll = () => {
    const el = boardRef.current
    if (!el) return
    const prog = Math.min(1, Math.max(0, el.scrollTop / el.clientHeight))
    setP(prog)
    if (prog > 0.45) setPitchIn(true)
  }

  const toPitch = () =>
    boardRef.current?.scrollTo({ top: boardRef.current.clientHeight, behavior: 'smooth' })

  return (
    <div className="v2 v2-scroll" ref={boardRef} onScroll={onScroll}>
      {/* Screen 1 — the name. Sticky, so the pitch slides over it as it recedes. */}
      <section className="v2-sec-full v2-intro">
        <div
          className="v2-intro__inner"
          style={{ opacity: 1 - p * 1.35, transform: `scale(${1 - 0.3 * p}) translateY(${-48 * p}px)` }}
        >
          <h1 className="v2-intro__word">Exercise Mechanics</h1>
          <p className="v2-intro__tag">The live fitness marketplace</p>
        </div>

        <button type="button" className="v2-intro__hint" onClick={toPitch} style={{ opacity: 1 - p * 2.2 }}>
          Scroll
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </section>

      {/* Screen 2 — the pitch. */}
      <section className={`v2-sec-full v2-pitch${pitchIn ? ' is-in' : ''}`}>
        <h2 className="v2-h1 v2-pitch__h">
          Book a coach,<br />or become one<NodePeriod />
        </h2>
        <div className="v2-pitch__cta">
          <PillButton onClick={onNew}>Join Exercise Mechanics</PillButton>
          {hasProfiles && <PillButton variant="ghost" onClick={onExisting}>Login</PillButton>}
        </div>
      </section>
    </div>
  )
}
