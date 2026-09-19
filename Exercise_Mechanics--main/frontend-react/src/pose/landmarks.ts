/* landmarks.ts — the canonical MediaPipe BlazePose 33-landmark name list (index order),
   matching the backend's expectation, plus the pre-set visibility-gate helper.

   This is the SINGLE source for the index→name mapping: usePose sends keypoints keyed by
   these names, and the F2 gate maps a required-keypoint name back to its landmark index to
   read live visibility. Keep this list in sync with backend calibration.LANDMARK_NAMES and
   biomechanics/exercises/keypoints.ALL_LANDMARKS. */
import type { Landmark } from '../types'

export const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner',
  'right_eye', 'right_eye_outer', 'left_ear', 'right_ear', 'mouth_left',
  'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index',
  'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel',
  'right_heel', 'left_foot_index', 'right_foot_index',
] as const

const NAME_TO_INDEX: Record<string, number> = Object.fromEntries(
  LANDMARK_NAMES.map((name, i) => [name, i]),
)

/** The pre-set gate config the backend serves (GET /api/exercises/{ex}/keypoints):
 *  the required-keypoint list, the rule-critical subset, and the two visibility
 *  floors (defined once in backend config.py, so gate and rules can't drift). */
export type GateConfig = {
  required: readonly string[]
  critical: readonly string[]
  minV: number          // base "in frame" floor (VISIBILITY_MIN)
  criticalMinV: number  // stricter "safe to compute" floor for critical joints (CONFIDENCE_MIN)
}

/** Required landmarks NOT visible in this frame (in `required` order), two-tier. A
 *  landmark is "visible" when present with visibility ≥ its floor: `criticalMinV` for
 *  names in `critical` (the joints the rules compute on), else `minV`. Empty array ⇒
 *  all visible. `landmarks` null/empty (no pose) ⇒ every required keypoint is missing.
 *  `critical` omitted ⇒ single-tier (every keypoint uses `minV`). */
export function missingKeypoints(
  landmarks: Landmark[] | null,
  required: readonly string[],
  minV: number,
  critical: readonly string[] = [],
  criticalMinV: number = minV,
): string[] {
  if (!landmarks || landmarks.length === 0) return [...required]
  const crit = new Set(critical)
  return required.filter((name) => {
    const idx = NAME_TO_INDEX[name]
    const lm = idx != null ? landmarks[idx] : undefined
    const floor = crit.has(name) ? criticalMinV : minV
    return !lm || (lm.visibility ?? 0) < floor
  })
}
