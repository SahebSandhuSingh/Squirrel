import { describe, it, expect } from 'vitest'
import { OneEuro, PoseFilter } from '../oneEuro'

const FPS = 1 / 30

describe('OneEuro filter', () => {
  it('passes the first sample through unchanged', () => {
    expect(new OneEuro().filter(0.42, 0)).toBe(0.42)
  })

  it('reduces jitter around a still value', () => {
    const f = new OneEuro(1.0, 2.0, 1.0)   // explicit params — test the algorithm, not the shipped tuning
    let t = 0
    for (let i = 0; i < 30; i++) { f.filter(0.5, t); t += FPS }   // settle
    let maxDev = 0
    for (let i = 0; i < 30; i++) {
      const noisy = 0.5 + (i % 2 === 0 ? 0.02 : -0.02)            // ±0.02 jitter
      maxDev = Math.max(maxDev, Math.abs(f.filter(noisy, t) - 0.5))
      t += FPS
    }
    expect(maxDev).toBeLessThan(0.02)      // output swing is under the ±0.02 input (smoother)
  })

  it('tracks a moving signal with low lag', () => {
    const f = new OneEuro(1.0, 2.0, 1.0)
    let t = 0, x = 0, out = 0
    for (let i = 0; i < 60; i++) { x += 0.01; out = f.filter(x, t); t += FPS }  // ramp 0.3/s
    expect(Math.abs(out - x)).toBeLessThan(0.05)
  })

  it('reset() makes the next sample pass through again', () => {
    const f = new OneEuro()
    f.filter(0.1, 0); f.filter(0.2, FPS)
    f.reset()
    expect(f.filter(0.9, 2)).toBe(0.9)
  })
})

describe('PoseFilter', () => {
  it('smooths x/y/z, leaves visibility untouched, keeps array length', () => {
    const pf = new PoseFilter(2, { minCutoff: 1.0, beta: 2.0, dCutoff: 1.0 })
    const lms = [
      { x: 0.5, y: 0.5, z: 0.1, visibility: 0.9 },
      { x: 0.2, y: 0.3, z: 0.0, visibility: 0.8 },
    ]
    const out = pf.filter(lms, 0)
    expect(out).toHaveLength(2)
    expect(out[0].visibility).toBe(0.9)   // confidence passes through
    expect(out[0].x).toBe(0.5)            // first sample = passthrough
    expect(out[1].y).toBe(0.3)
  })
})
