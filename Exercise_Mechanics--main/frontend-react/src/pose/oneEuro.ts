/* oneEuro.ts — One Euro filter for live pose-landmark smoothing.

   Applied to the raw MediaPipe landmarks each frame BEFORE keypoints are sent to the backend
   (and before the skeleton render), so the whole pipeline — rules + rep-counter FSM + overlay —
   consumes one jitter-filtered signal. The backend's own depth EMA was removed to avoid
   double-smoothing (two filters in series just add lag).

   One Euro (not a fixed-α EMA) is adaptive: it smooths hard when the landmark is ~still (kills
   the jitter that was false-firing rules like shoulder symmetry) but raises its cutoff when the
   landmark moves fast (keeps the descent/turnaround responsive, so rep timing isn't lagged).
   Reference: Casiez, Roussel & Vogel, "1€ Filter" (CHI 2012).

   Tuning (MIN_CUTOFF / BETA) is over NORMALIZED landmark coords (0..1). Lag is dominated by BETA:
   the cutoff during motion is MIN_CUTOFF + BETA·speed, and normalized speeds are small (~0.3–1.0/s),
   so BETA must be LARGE to raise the cutoff enough to track a fast descent without lag. MIN_CUTOFF
   sets the smoothing floor when ~still.

   Live-tunable WITHOUT a rebuild (read once at filter construction → reload to apply):
     • URL query:     ?euro_beta=20&euro_mincut=1.5     (and optionally &euro_dcut=1)
     • or localStorage: fitsync_euro_beta = '20', fitsync_euro_mincut = '1.5'
   Precedence: query → localStorage → default. To effectively DISABLE smoothing, set a huge
   MIN_CUTOFF (e.g. ?euro_mincut=1000). */

export const MIN_CUTOFF = 1.5   // Hz — baseline cutoff (smoothing floor when ~still)
export const BETA = 15.0        // speed coefficient (higher → tracks fast motion with less lag)
export const D_CUTOFF = 1.0     // Hz — cutoff for the derivative estimate

/** Resolve params: URL query → localStorage → default. Read once at PoseFilter construction. */
export function resolveOneEuroParams(): { minCutoff: number; beta: number; dCutoff: number } {
  const read = (queryKey: string, storageKey: string, fallback: number): number => {
    try {
      const raw = new URLSearchParams(location.search).get(queryKey) ?? localStorage.getItem(storageKey)
      if (raw != null) { const n = parseFloat(raw); if (Number.isFinite(n) && n > 0) return n }
    } catch { /* SSR / private mode — fall through */ }
    return fallback
  }
  return {
    minCutoff: read('euro_mincut', 'fitsync_euro_mincut', MIN_CUTOFF),
    beta:      read('euro_beta', 'fitsync_euro_beta', BETA),
    dCutoff:   read('euro_dcut', 'fitsync_euro_dcut', D_CUTOFF),
  }
}

class LowPass {
  private hasPrev = false
  private prevRaw = 0
  private prevFiltered = 0

  filter(x: number, alpha: number): number {
    const y = this.hasPrev ? alpha * x + (1 - alpha) * this.prevFiltered : x
    this.hasPrev = true
    this.prevRaw = x
    this.prevFiltered = y
    return y
  }

  get initialized(): boolean { return this.hasPrev }
  get lastRaw(): number { return this.prevRaw }
  reset(): void { this.hasPrev = false }
}

/** One Euro filter over a single scalar signal. */
export class OneEuro {
  private xf = new LowPass()
  private dxf = new LowPass()
  private lastTimeS: number | null = null
  private minCutoff: number
  private beta: number
  private dCutoff: number

  constructor(minCutoff = MIN_CUTOFF, beta = BETA, dCutoff = D_CUTOFF) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /** `timeS` is a monotonic timestamp in seconds. */
  filter(value: number, timeS: number): number {
    if (this.lastTimeS === null) {
      this.lastTimeS = timeS
      return this.xf.filter(value, 1)   // passthrough on the first sample
    }
    const dt = Math.max(1e-3, timeS - this.lastTimeS)
    this.lastTimeS = timeS

    const dRaw = this.xf.initialized ? (value - this.xf.lastRaw) / dt : 0
    const edx = this.dxf.filter(dRaw, this.alpha(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.xf.filter(value, this.alpha(cutoff, dt))
  }

  reset(): void {
    this.xf.reset()
    this.dxf.reset()
    this.lastTimeS = null
  }
}

/** A bank of One Euro filters over a pose's landmarks — independent x/y/z per landmark index.
 *  Visibility (v) is left untouched: it's a confidence used for gating, not a coordinate. */
export class PoseFilter {
  private fx: OneEuro[]
  private fy: OneEuro[]
  private fz: OneEuro[]

  constructor(count = 33, params = resolveOneEuroParams()) {
    const { minCutoff, beta, dCutoff } = params
    if (typeof console !== 'undefined') {
      console.info(`[oneEuro] min_cutoff=${minCutoff} beta=${beta} d_cutoff=${dCutoff} (tune via ?euro_beta=…&euro_mincut=…)`)
    }
    const mk = (): OneEuro[] => Array.from({ length: count }, () => new OneEuro(minCutoff, beta, dCutoff))
    this.fx = mk()
    this.fy = mk()
    this.fz = mk()
  }

  /** Smooth landmark coordinates. `timeMs` is the frame timestamp in ms. Returns new objects;
   *  `visibility` (and any other fields) pass through untouched. */
  filter<T extends { x: number; y: number; z?: number }>(landmarks: T[], timeMs: number): T[] {
    const t = timeMs / 1000
    return landmarks.map((lm, i) => ({
      ...lm,
      x: this.fx[i].filter(lm.x, t),
      y: this.fy[i].filter(lm.y, t),
      z: this.fz[i].filter(lm.z ?? 0, t),
    }))
  }

  /** Drop all state — call on a tracking dropout so a gap doesn't carry stale values. */
  reset(): void {
    this.fx.forEach((f) => f.reset())
    this.fy.forEach((f) => f.reset())
    this.fz.forEach((f) => f.reset())
  }
}
