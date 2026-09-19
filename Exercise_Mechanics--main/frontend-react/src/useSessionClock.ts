/* useSessionClock.ts — the SINGLE source of truth for the F3 elapsed timer.
   The reducer (foldFrame) must NOT read or compute wall time — doing so would make it
   non-deterministic and untestable. Instead this hook owns a wall clock that:
     • starts when the workout becomes active (F1→F3),
     • accumulates only ACTIVE time (paused spans are excluded),
     • resets when the app returns to F1.
   It exposes `elapsedSeconds` for display (passed explicitly into TimerRing) and a
   `getElapsedSeconds()` so the final value can be injected into the END action without
   any component reading the clock through reducer state. */
import { useCallback, useEffect, useRef, useState } from 'react'

interface SessionClockArgs {
  /** True once the workout is on F3 (running or paused). False on F1/F5. */
  running: boolean
  /** True while paused (F3 pause overlay). Paused time is excluded from elapsed. */
  paused: boolean
}

export interface SessionClock {
  /** Live elapsed active seconds (updates ~4×/s while active). */
  elapsedSeconds: number
  /** Imperative read of the current elapsed active seconds (no re-render). */
  getElapsedSeconds: () => number
}

const TICK_MS = 250

export function useSessionClock({ running, paused }: SessionClockArgs): SessionClock {
  // accumulatedMs: active time banked from completed spans (frozen at each pause).
  // spanStartMs:   performance.now() when the current active span began (null if not active).
  const accumulatedRef = useRef(0)
  const spanStartRef = useRef<number | null>(null)
  const [displayMs, setDisplayMs] = useState(0)

  // Imperative read — never reads refs during render (lint-safe; used by the END injection).
  const getElapsedSeconds = useCallback((): number => {
    const span = spanStartRef.current != null ? performance.now() - spanStartRef.current : 0
    return (accumulatedRef.current + span) / 1000
  }, [])

  // React to running/paused transitions: open/close the active span and reset on stop.
  // Ref-only (no setState) — the interval below owns all re-renders. On pause the last ticked
  // value is already the correct frozen value; on stop (→F1/F5) we reset the banked total and
  // the interval cleanup leaves the display, which the next active session re-baselines.
  useEffect(() => {
    const active = running && !paused
    if (active) {
      if (spanStartRef.current == null) spanStartRef.current = performance.now()
    } else {
      if (spanStartRef.current != null) {
        accumulatedRef.current += performance.now() - spanStartRef.current
        spanStartRef.current = null
      }
      if (!running) accumulatedRef.current = 0 // returning to F1/F5 fully resets the clock
    }
  }, [running, paused])

  // Display tick — the ONLY place that drives re-renders (no synchronous setState in an effect
  // body). While active it refreshes ~4×/s; while paused/stopped it idles. A short leading tick
  // (16ms) makes the first paint after start/resume effectively immediate without a sync setState.
  useEffect(() => {
    if (!running || paused) return
    const lead = setTimeout(() => setDisplayMs(getElapsedSeconds() * 1000), 16)
    const id = setInterval(() => setDisplayMs(getElapsedSeconds() * 1000), TICK_MS)
    return () => { clearTimeout(lead); clearInterval(id) }
  }, [running, paused, getElapsedSeconds])

  // When the session stops (→ F1/F5) reset the display to 0 for the next session.
  useEffect(() => {
    if (!running) setDisplayMs(0)
  }, [running])

  return { elapsedSeconds: displayMs / 1000, getElapsedSeconds }
}
