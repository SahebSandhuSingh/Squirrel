/* landmarks.test.ts — the pre-set visibility-gate helper (missingKeypoints). */
import { describe, it, expect } from 'vitest'
import { missingKeypoints, LANDMARK_NAMES } from '../landmarks'
import type { Landmark } from '../../types'

const MIN = 0.3

/** Build a 33-length landmark array, all fully visible, then apply overrides by index. */
function frame(overrides: Record<number, number> = {}): Landmark[] {
  return LANDMARK_NAMES.map((_, i) => ({
    x: 0, y: 0, z: 0, visibility: overrides[i] ?? 1,
  }))
}

describe('missingKeypoints', () => {
  it('returns [] when every required keypoint is visible', () => {
    expect(missingKeypoints(frame(), LANDMARK_NAMES, MIN)).toEqual([])
  })

  it('treats null / empty landmarks (no pose) as every required keypoint missing', () => {
    expect(missingKeypoints(null, LANDMARK_NAMES, MIN)).toEqual([...LANDMARK_NAMES])
    expect(missingKeypoints([], LANDMARK_NAMES, MIN)).toEqual([...LANDMARK_NAMES])
  })

  it('flags a required keypoint whose visibility is below the threshold', () => {
    const ankleIdx = LANDMARK_NAMES.indexOf('left_ankle')
    const missing = missingKeypoints(frame({ [ankleIdx]: 0.1 }), LANDMARK_NAMES, MIN)
    expect(missing).toEqual(['left_ankle'])
  })

  it('only considers the required subset, not all 33', () => {
    const required = ['left_knee', 'right_knee']
    const kneeIdx = LANDMARK_NAMES.indexOf('right_knee')
    // A face landmark is hidden, but it is not in `required` → still all-visible.
    const noseIdx = LANDMARK_NAMES.indexOf('nose')
    expect(missingKeypoints(frame({ [noseIdx]: 0 }), required, MIN)).toEqual([])
    expect(missingKeypoints(frame({ [kneeIdx]: 0 }), required, MIN)).toEqual(['right_knee'])
  })
})
