import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SkeletonOverlay } from './Skeleton'
import { initialState } from '../engine/useEngine'
import { Q } from '../tokens'
import type { EngineState } from '../types'

function landmarks() {
  return Array.from({ length: 33 }, (_, i) => ({
    x: 0.4 + (i % 3) * 0.05, y: 0.2 + i * 0.02, z: 0, visibility: 0.95,
  }))
}

function overlay(state: Partial<EngineState>): string {
  const s = { ...initialState(), poseLandmarks: landmarks(), ...state } as EngineState
  return renderToStaticMarkup(<SkeletonOverlay s={s} solid />)
}

/* Each <line> is emitted in LIMBS order, so its index identifies the segment. */
function lineStrokes(markup: string): string[] {
  return [...markup.matchAll(/<line[^>]*stroke="([^"]+)"/g)].map((m) => m[1])
}

const SHOULDER_LINE = 0   // [lShoulder, rShoulder] — first entry in LIMBS
const L_UPPER_ARM = 1     // [lShoulder, lElbow]
const L_FOREARM = 2       // [lElbow, lWrist]
const R_UPPER_ARM = 3     // [rShoulder, rElbow]
const R_FOREARM = 4       // [rElbow, rWrist]
const L_TORSO_SIDE = 5    // [lShoulder, lHip]
const R_TORSO_SIDE = 6    // [rShoulder, rHip]
const HIP_LINE = 7        // [lHip, rHip]
const L_THIGH = 8         // [lHip, lKnee]
const L_SHIN = 9          // [lKnee, lAnkle]
const R_THIGH = 10        // [rHip, rKnee]
const R_SHIN = 11         // [rKnee, rAnkle]

describe('High Knee leg highlight', () => {
  it('reddens only the left leg when the left knee leaves its corridor', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'legs', flaggedSide: 'left', correctionSeverity: 'error' }),
    )
    expect(strokes[L_THIGH]).toBe(Q.red)
    expect(strokes[L_SHIN]).toBe(Q.red)
    expect(strokes[R_THIGH]).toBe(Q.green)
    expect(strokes[R_SHIN]).toBe(Q.green)
  })

  it('mirrors the corridor highlight for a right-leg fault', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'legs', flaggedSide: 'right', correctionSeverity: 'error' }),
    )
    expect(strokes[R_THIGH]).toBe(Q.red)
    expect(strokes[R_SHIN]).toBe(Q.red)
    expect(strokes[L_THIGH]).toBe(Q.green)
    expect(strokes[L_SHIN]).toBe(Q.green)
  })

  it('keeps the setup-readiness thigh lines green and reddens only knee-to-ankle', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'shins', flaggedSide: null, correctionSeverity: 'error' }),
    )
    expect(strokes[L_THIGH]).toBe(Q.green)
    expect(strokes[R_THIGH]).toBe(Q.green)
    expect(strokes[L_SHIN]).toBe(Q.red)
    expect(strokes[R_SHIN]).toBe(Q.red)
  })
})

describe('elbow-flare highlight', () => {
  it('reddens only the flaring arm and the torso side it drifted away from', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'elbows', flaggedSide: 'left', correctionSeverity: 'error' }),
    )

    // The gap that opened up: the arm that drifted, and the torso side it drifted away from.
    expect(strokes[L_UPPER_ARM]).toBe(Q.red)
    expect(strokes[L_FOREARM]).toBe(Q.red)
    expect(strokes[L_TORSO_SIDE]).toBe(Q.red)

    // The other arm did nothing wrong. The side-agnostic fallback would have reddened it.
    expect(strokes[R_UPPER_ARM]).toBe(Q.green)
    expect(strokes[R_FOREARM]).toBe(Q.green)
    expect(strokes[R_TORSO_SIDE]).toBe(Q.green)
    // A flare is not a lean or a shrug: the shoulder and hip lines are not at fault.
    expect(strokes[SHOULDER_LINE]).toBe(Q.green)
    expect(strokes[HIP_LINE]).toBe(Q.green)
  })

  it('mirrors for a right-side flare', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'elbows', flaggedSide: 'right', correctionSeverity: 'error' }),
    )
    expect(strokes[R_UPPER_ARM]).toBe(Q.red)
    expect(strokes[R_TORSO_SIDE]).toBe(Q.red)
    expect(strokes[L_UPPER_ARM]).toBe(Q.green)
    expect(strokes[L_TORSO_SIDE]).toBe(Q.green)
  })

  it('reddens both arms when both elbows flare', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'elbows', flaggedSide: 'both', correctionSeverity: 'error' }),
    )
    expect(strokes[L_UPPER_ARM]).toBe(Q.red)
    expect(strokes[R_UPPER_ARM]).toBe(Q.red)
    expect(strokes[L_TORSO_SIDE]).toBe(Q.red)
    expect(strokes[R_TORSO_SIDE]).toBe(Q.red)
  })

  it('falls back to both sides rather than guessing when no side is reported', () => {
    const strokes = lineStrokes(
      overlay({ flaggedJoint: 'elbows', flaggedSide: null, correctionSeverity: 'error' }),
    )
    expect(strokes[L_UPPER_ARM]).toBe(Q.red)
    expect(strokes[R_UPPER_ARM]).toBe(Q.red)
  })
})


describe('lateral-torso-lean highlight', () => {
  it('reddens the torso quadrilateral and nothing hanging off it', () => {
    const strokes = lineStrokes(overlay({ flaggedJoint: 'trunk', correctionSeverity: 'error' }))

    // The fault is the shoulder line's angle over the hip line, so the whole torso is at fault.
    expect(strokes[SHOULDER_LINE]).toBe(Q.red)
    expect(strokes[L_TORSO_SIDE]).toBe(Q.red)
    expect(strokes[R_TORSO_SIDE]).toBe(Q.red)
    expect(strokes[HIP_LINE]).toBe(Q.red)

    // Arms and legs hang off those same four joints. Without a specific-limb entry the fallback
    // would redden them too, blaming the limbs for a fault measured across the torso.
    expect(strokes[L_UPPER_ARM]).toBe(Q.green)
    expect(strokes[R_UPPER_ARM]).toBe(Q.green)
    expect(strokes[L_FOREARM]).toBe(Q.green)
    expect(strokes[L_THIGH]).toBe(Q.green)
    expect(strokes[R_THIGH]).toBe(Q.green)
  })

  it('ignores a reported side: a lean is read across the torso, not on one side', () => {
    const left = lineStrokes(
      overlay({ flaggedJoint: 'trunk', flaggedSide: 'left', correctionSeverity: 'error' }),
    )
    const right = lineStrokes(
      overlay({ flaggedJoint: 'trunk', flaggedSide: 'right', correctionSeverity: 'error' }),
    )
    expect(left).toEqual(right)
    expect(left[L_TORSO_SIDE]).toBe(Q.red)
    expect(left[R_TORSO_SIDE]).toBe(Q.red)
  })

  it('is side-agnostic: leaning left and leaning right render identically', () => {
    // The backend reports which side the lean is toward, but the highlight is the shared torso, so
    // nothing in the rendering distinguishes them. Verifying side attribution needs the capture.
    const strokes = lineStrokes(overlay({ flaggedJoint: 'trunk', correctionSeverity: 'error' }))
    expect(strokes[SHOULDER_LINE]).toBe(Q.red)
    expect(strokes[HIP_LINE]).toBe(Q.red)
  })
})

describe('shoulder-elevation highlight', () => {
  it('reddens the line between the shoulders and nothing hanging off it', () => {
    const strokes = lineStrokes(overlay({ flaggedJoint: 'shoulders', correctionSeverity: 'error' }))

    expect(strokes[SHOULDER_LINE]).toBe(Q.red)
    // A shrug is measured BETWEEN the shoulders; the arms and torso are not at fault.
    expect(strokes[L_UPPER_ARM]).toBe(Q.green)
    expect(strokes[L_TORSO_SIDE]).toBe(Q.green)
  })

  it('is side-agnostic: one shoulder rising still reddens the whole connecting line', () => {
    // The backend reports which side rose, but the highlight is deliberately the shared line, so
    // the rendering is identical either way.
    const strokes = lineStrokes(overlay({ flaggedJoint: 'shoulders', correctionSeverity: 'error' }))
    expect(strokes[SHOULDER_LINE]).toBe(Q.red)
  })

  it('leaves the skeleton green when no fault is active', () => {
    const strokes = lineStrokes(overlay({ flaggedJoint: null, correctionSeverity: null }))
    expect(strokes.every((stroke) => stroke === Q.green)).toBe(true)
  })

  it('keeps the squat groups colouring every limb touching a flagged joint', () => {
    // Groups without a specific-limb entry must behave exactly as before this change.
    const strokes = lineStrokes(overlay({ flaggedJoint: 'hips', correctionSeverity: 'error' }))
    const L_HIP_KNEE = 8, HIP_LINE = 7
    expect(strokes[HIP_LINE]).toBe(Q.red)
    expect(strokes[L_HIP_KNEE]).toBe(Q.red)
    expect(strokes[SHOULDER_LINE]).toBe(Q.green)
  })
})

describe('curl-ROM highlight', () => {
  it('highlights both wrists and forearms without blaming the upper arms', () => {
    const strokes = lineStrokes(overlay({ flaggedJoint: 'wrists', correctionSeverity: 'warning' }))

    expect(strokes[L_FOREARM]).toBe(Q.amber)
    expect(strokes[R_FOREARM]).toBe(Q.amber)
    expect(strokes[L_UPPER_ARM]).toBe(Q.green)
    expect(strokes[SHOULDER_LINE]).toBe(Q.green)
  })
})

/* Superseded 2026-07-20. This block previously asserted that a flare reddened BOTH arms and left
   the torso sides green — the side-agnostic fallback. A flare is one-sided and is the elbow leaving
   its corridor beside the torso, so the highlight now follows the reported side and includes the
   torso side the elbow drifted away from. See the `elbow-flare highlight` block above. */
