/* Stage.tsx — the fixed 1280×720 landscape "board" auto-scaled to fit its container.
   Extracted from App so every screen (landing, onboarding, welcome, modes) and the
   pose-coach itself render inside the identical device frame, for one consistent look.
   Children are laid out in 1280×720 coordinate space; the board scales as a whole. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Stage({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const fit = () => {
      const pad = immersive ? 0 : 48
      const w = el.clientWidth - pad, h = el.clientHeight - pad
      // Immersive coach fills the container (cover) on desktop; on touch devices it uses
      // contain instead, so an ultra-wide phone-landscape viewport shows the FULL HUD (form
      // score/timer at the board's top edge) rather than cropping it off. Non-immersive is
      // always contain. On a 16:9 desktop window cover==contain, so desktop is unchanged.
      const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
      const ratio = immersive
        ? (coarse ? Math.min(w / 1280, h / 720) : Math.max(w / 1280, h / 720))
        : Math.min(w / 1280, h / 720)
      setScale(Math.max(0.2, ratio))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [immersive])

  return (
    <div className="app-shell">
      <div className={`stage${immersive ? ' stage--immersive' : ''}`} ref={stageRef}>
        <div className="board-scale" style={{ width: 1280 * scale, height: 720 * scale }}>
          <div className="board" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
