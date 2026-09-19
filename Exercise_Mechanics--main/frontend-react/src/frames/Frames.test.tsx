import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FormScoreMeter, LegRomMeter, LiftBar, TimerRing } from '../components/Hud'
import { initialState } from '../engine/useEngine'
import type { EngineState, WSSetup } from '../types'
import { F2_Gate } from './Frames'

function setupData(): WSSetup {
  return {
    phase: 'precheck',
    missing: [],
    conditions: [
      { template_id: 'standing_posture', status: 'passed', reason_id: null, cue: null, measurements: {} },
      { template_id: 'stance_width', status: 'passed', reason_id: null, cue: null, measurements: { ratio: 1 } },
    ],
    failures: [],
    dwell: { held_ms: 1000, required_ms: 2000 },
    capture: {
      valid_ms: 0,
      required_ms: 3000,
      progress: 0,
      frames_collected: 0,
      min_valid_samples: 45,
      observed_frames: 0,
      valid_coverage: 0,
      invalid_ms: 0,
      paused: false,
    },
    quality: null,
    validation_results: [],
    baseline_candidate_ready: false,
    baseline_ready: false,
    start: false,
    cue: null,
  }
}

function gate(state: EngineState): string {
  return renderToStaticMarkup(
    <F2_Gate
      s={state}
      cameraStarted
      onStartCamera={() => undefined}
      onRetryCamera={() => undefined}
      poseError={null}
    />,
  )
}

describe('Stage 8 setup rendering', () => {
  it('identifies missing body groups and renders every configured pre-check condition', () => {
    const missingSetup = { ...setupData(), missing: ['left_hip', 'right_ankle'] }
    const missing = gate({ ...initialState(), setup: missingSetup })
    expect(missing).toContain('Full body not visible')
    expect(missing).toContain('hips')
    expect(missing).toContain('ankles &amp; feet')

    const combined = gate({ ...initialState(), setup: setupData() })
    expect(combined).toContain('Standing posture')
    expect(combined).toContain('Stance width')
    expect(combined).toContain('Hold 1s of 2s')
  })

  it('renders paused capture percentage and the distinct START beat', () => {
    const captureSetup = {
      ...setupData(),
      phase: 'collecting' as const,
      failures: [{
        template_id: 'stance_width',
        status: 'failed' as const,
        reason_id: 'stance_too_narrow',
        cue: 'Stand shoulder-width with stable feet.',
        measurements: {},
      }],
      capture: {
        ...setupData().capture,
        valid_ms: 1500,
        progress: 0.5,
        frames_collected: 24,
        observed_frames: 30,
        valid_coverage: 0.8,
        invalid_ms: 300,
        paused: true,
      },
    }
    const capture = gate({ ...initialState(), prep: 'capture', setup: captureSetup })
    expect(capture).toContain('Baseline capture')
    expect(capture).toContain('50%')
    expect(capture).toContain('Capture paused')

    const readySetup = {
      ...setupData(),
      phase: 'ready' as const,
      baseline_candidate_ready: true,
      baseline_ready: true,
      start: true,
    }
    const start = gate({ ...initialState(), prep: 'start', setup: readySetup, baselineReady: true })
    expect(start).toContain('START')
  })

  it('shows previous-set knee-travel feedback without replacing setup checks', () => {
    const markup = gate({
      ...initialState(),
      setup: setupData(),
      setupNotice: {
        text: 'Right knee travelled lower. Match your knee-drive height.',
        status: 'asymmetric',
      },
    })
    expect(markup).toContain('Right knee travelled lower. Match your knee-drive height.')
    expect(markup).toContain('Setup check')
    expect(markup).toContain('role="status"')
  })
})

describe('Stage 8 score coverage rendering', () => {
  it('renders incomplete coverage as unavailable rather than a green score', () => {
    const state = {
      ...initialState(),
      formScore: 100,
      scoreCoverage: {
        active_rule_ids: ['depth', 'stance_width'],
        available_rule_ids: ['depth'],
        unavailable_rule_ids: ['stance_width'],
        ratio: 0.5,
        reliable: false,
      },
    }
    const markup = renderToStaticMarkup(<FormScoreMeter s={state} />)
    expect(markup).toContain('—')
    expect(markup).toContain('50% coverage')
    expect(markup).not.toContain('>100<')
  })
})

describe('High Knee timed HUD rendering', () => {
  it('renders the backend countdown and bilateral knee-drive ROM', () => {
    const state = {
      ...initialState(),
      targetMeasure: 'time' as const,
      targetDurationSeconds: 30,
      remainingTime: 18,
      currentRep: 10,
      fullRomCount: 8,
      shallowCount: 2,
      invalidCount: 1,
      romLegs: { left: 82, right: 64, leftAvailable: true, rightAvailable: true },
    }
    const timer = renderToStaticMarkup(<TimerRing s={state} elapsedSeconds={99} />)
    const left = renderToStaticMarkup(<LegRomMeter s={state} side="left" />)
    const right = renderToStaticMarkup(<LegRomMeter s={state} side="right" />)
    const lifts = renderToStaticMarkup(<LiftBar s={state} />)

    expect(timer).toContain('0:18')
    expect(timer).toContain('Remaining')
    expect(left).toContain('Left knee drive')
    expect(left).toContain('82%')
    expect(right).toContain('Right knee drive')
    expect(right).toContain('64%')
    expect(lifts).toContain('Counted lifts')
    expect(lifts).toContain('8 full · 1 invalid')
  })

  it('renders an unavailable leg as tracking rather than zero percent', () => {
    const state = {
      ...initialState(),
      targetMeasure: 'time' as const,
      romLegs: { left: 0, right: 70, leftAvailable: false, rightAvailable: true },
    }
    const left = renderToStaticMarkup(<LegRomMeter s={state} side="left" />)
    expect(left).toContain('Tracking')
    expect(left).not.toContain('>0%<')
  })
})
