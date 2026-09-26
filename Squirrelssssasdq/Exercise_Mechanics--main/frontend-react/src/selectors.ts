/* selectors.ts — shared derived-state helpers read by multiple components.
   Previously isDimmed() was copy-pasted identically in Frames.tsx and Hud.tsx. */
import type { EngineState } from './types'
import { CONF_FLOOR } from './config'

/** Low-confidence or disconnected ⇒ the HUD holds its last values and dims them
 *  (never zero, never jump — handoff §A). */
export function isDimmed(s: EngineState): boolean {
  return s.trackingConfidence < CONF_FLOOR || s.disconnected
}
