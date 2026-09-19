/* adapter.ts — the one live-pose → EngineState mapping still needed under the new flow.
   (deriveCue / deriveSymmetry / deriveCalibration were part of the old single-/ws contract and
   are gone: cues now come straight from /ws/train, and there is no calibration phase.) */

/* Tracking confidence during the ACTIVE phase, from live landmark visibility of the joints the
   rep counter gates on. Exercise-specific: squat gates on hips+knees; a bicep curl on
   shoulders+elbows+wrists. Drives the low-confidence hold-and-dim rule. */
const CONF_JOINTS: Record<string, number[]> = {
  squat: [23, 24, 25, 26],              // left/right hip, left/right knee
  bicep_curl: [11, 12, 13, 14, 15, 16], // shoulders, elbows, wrists
  high_knee: [11, 12, 23, 24, 25, 26, 27, 28], // shoulders, hips, knees, ankles
}

export function liveTrackingConfidence(
  landmarks: { visibility: number }[] | null,
  motion: string = 'squat',
): number {
  const idx = CONF_JOINTS[motion] ?? CONF_JOINTS.squat
  if (!landmarks || landmarks.length <= Math.max(...idx)) return 0
  const vis = idx.map((i) => landmarks[i]?.visibility ?? 0)
  return Math.min(...vis)
}
