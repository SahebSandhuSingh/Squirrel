/* config.ts — centralized client-side thresholds and magic constants.
   Previously these literals were scattered/duplicated across useEngine.ts, Skeleton.tsx,
   Frames.tsx, Hud.tsx. Centralizing them removes the duplication and makes the eventual
   move to server config (a future GET /workout endpoint, handoff Milestone D) a one-file
   change. Nothing here is per-session state — these are static tunables. */

/** Below this hip/knee tracking confidence the UI holds-and-dims (handoff §A; mirrors the
 *  backend CONFIDENCE_MIN intent). */
export const CONF_FLOOR = 0.45

/** Interim form/symmetry score bounds + neutral defaults (derived heuristic, not a real
 *  backend metric — see engine/dummy.ts). */
export const FORM_SCORE_FLOOR = 40
export const SYMMETRY_FLOOR = 60
export const FORM_DEFAULT = 92
export const SYMMETRY_DEFAULT = 96

/** Seconds added to the between-sets rest countdown each time the user taps "Extend". */
export const REST_EXTEND_S = 30

/** WebSocket reconnect backoff + send backpressure cap. */
export const WS_RECONNECT_MS = 2000
export const WS_BACKPRESSURE_CAP = 1 << 16

/** Deterministic confirmation beat after the backend has validated and persisted setup. */
export const START_SPLASH_MS = 900

/** A landmark is "visible enough to draw" above this MediaPipe visibility. */
export const LANDMARK_VIS_FLOOR = 0.3

/** Calibration draws the skeleton at the stricter backend floor (CONFIDENCE_MIN = 0.5) so it
 *  matches the "x/33 body visible" count — no phantom limbs to off-frame, low-confidence joints. */
export const CALIB_VIS_FLOOR = 0.5

/** WS stream-guard bounds: a sane absolute cap on qualified reps, and the max plausible
 *  per-frame increment. The backend completes at most one rep per frame, so a jump
 *  larger than this signals a corrupt/malicious frame (P0-E). */
export const MAX_REP_COUNT = 1000
export const MAX_REP_INCREMENT = 1

/** Rate-limit for malformed-WS warnings so a bad stream can't flood the console (P0-E/P1-E2). */
export const WS_WARN_THROTTLE_MS = 2000
