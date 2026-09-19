import { describe, expect, it } from 'vitest'

import { parseTimedCoreContract } from './timedContract'
import type { WSTimedCoreContract, WSTimedTrainContract } from './timedContract'
import { parseServerMessage } from './protocol'
import {
  completedWorkoutDurationSeconds,
  foldTrain,
  initialState,
} from './useEngine'

function timedContract(): WSTimedCoreContract {
  return {
    set: {
      movement_type: 'time',
      target_duration_ms: 30_000,
      elapsed_ms: 12_400,
      remaining_ms: 17_600,
      complete: false,
    },
    movement: {
      detected_cycles: 12,
      counted_lifts: 10,
      full_lifts: 8,
      shallow_lifts: 2,
      invalid_lifts: 2,
      left_lifts: 5,
      right_lifts: 5,
    },
    events: {
      lift_cycles: [
        {
          lift_id: 7,
          side: 'left',
          classification: 'full_rom',
          peak_progress: 0.9,
          started_t_ms: 1_000,
          completed_t_ms: 1_400,
        },
        {
          lift_id: 8,
          side: 'right',
          classification: 'shallow',
          peak_progress: 0.55,
          started_t_ms: 1_050,
          completed_t_ms: 1_400,
        },
      ],
      set_completed: false,
    },
  }
}

function timedTrainContract(): WSTimedTrainContract {
  const core = timedContract()
  return {
    tracking: {
      available: true,
      left_available: true,
      right_available: true,
      unavailable_rule_ids: [],
    },
    phase: 'active',
    ...core,
    movement: {
      ...core.movement,
      current_cadence_spm: 112.5,
      average_cadence_spm: 96.8,
      peak_cadence_spm: 120,
      alternation_breaks: 0,
      last_counted_side: 'right',
      left_phase: 'setup',
      right_phase: 'descent',
      left_current_peak: null,
      right_current_peak: 0.55,
    },
    rom: {
      rule_id: 'knee_drive_rom',
      full_rom_gate: 0.75,
      left_available: true,
      right_available: true,
      left_progress_raw: 0.4,
      right_progress_raw: 0.55,
      left_progress_display: 0.4,
      right_progress_display: 0.55,
      left_percent: 40,
      right_percent: 55,
      left_full_rom: false,
      right_full_rom: false,
      left_current_peak: null,
      right_current_peak: 0.55,
      coaching: 'Drive each knee to hip height.',
    },
    active_rule_ids: ['knee_drive_rom'],
    issues: [],
    cue: null,
    score: {
      score: 86.5,
      rom_factor: 0.865,
      form_factor: 1,
      penalty: 0,
      quality: 'reliable',
    },
    last_lift_score: {
      lift_id: 8,
      side: 'right',
      classification: 'shallow',
      score: 73.3,
      rom_factor: 0.733333,
      form_factor: 1,
      penalty: 0,
      quality: 'reliable',
    },
    monitors: {
      left_right_asymmetry: {
        status: 'asymmetric',
        has_asymmetry: true,
        left_samples: 5,
        right_samples: 5,
        left_median_travel: 0.92,
        right_median_travel: 0.70,
        travel_gap: 0.22,
        max_travel_gap: 0.15,
        lower_side: 'right',
        feedback: 'Right knee travelled lower. Match your knee-drive height.',
      },
    },
    score_coverage: {
      tracking_invalid_cycles: 0,
      penalty_rule_ids: [],
      available_penalty_rule_ids: [],
      unavailable_penalty_rule_ids: [],
      reliable: true,
    },
  }
}

describe('timed core contract', () => {
  it('accepts a timed set with two same-frame lift events', () => {
    expect(parseTimedCoreContract(timedContract())).toEqual(timedContract())
  })

  it('rejects repetition fields in place of the timed discriminator', () => {
    const value = timedContract()
    const invalid = {
      ...value,
      set: { target_reps: 10, completed_reps: 4, complete: false },
    }
    expect(parseTimedCoreContract(invalid)).toBeNull()
  })

  it('rejects contradictory counters', () => {
    const value = timedContract()
    value.movement.counted_lifts = 9
    expect(parseTimedCoreContract(value)).toBeNull()
  })

  it('rejects a timer whose remaining value or completion event disagrees', () => {
    const badRemaining = timedContract()
    badRemaining.set.remaining_ms = 17_599
    expect(parseTimedCoreContract(badRemaining)).toBeNull()

    const badCompletion = timedContract()
    badCompletion.events.set_completed = true
    expect(parseTimedCoreContract(badCompletion)).toBeNull()
  })

  it('accepts exactly one completed-set event at the duration boundary', () => {
    const value = timedContract()
    value.set.elapsed_ms = 30_000
    value.set.remaining_ms = 0
    value.set.complete = true
    value.events.set_completed = true
    expect(parseTimedCoreContract(value)).not.toBeNull()
    value.events.set_completed = false
    expect(parseTimedCoreContract(value)).not.toBeNull()
  })

  it('uses the completed backend set target instead of a drifting browser wall clock', () => {
    const value = timedTrainContract()
    value.set.elapsed_ms = 30_000
    value.set.remaining_ms = 0
    value.set.complete = true
    value.events.set_completed = true
    value.phase = 'complete'
    const parsed = parseServerMessage({ v: 1, type: 'train.status', data: value })
    if (!parsed || parsed.type !== 'train.status') {
      throw new Error('completed timed status did not parse')
    }

    const next = foldTrain({
      ...initialState(),
      view: 'F3',
      targetMeasure: 'time',
      targetDurationSeconds: 30,
    }, parsed.data)

    expect(next.log.timedSets).toHaveLength(1)
    expect(next.log.timedSets[0].asymmetry.status).toBe('asymmetric')
    expect(next.setupNotice).toEqual({
      text: 'Right knee travelled lower. Match your knee-drive height.',
      status: 'asymmetric',
    })
    expect(completedWorkoutDurationSeconds(next, 21)).toBe(30)
    expect(completedWorkoutDurationSeconds(next, 35)).toBe(30)
  })

  it('rejects duplicate lift ids in one frame', () => {
    const value = timedContract()
    value.events.lift_cycles[1].lift_id = 7
    expect(parseTimedCoreContract(value)).toBeNull()
  })

  it('flows through the V1 envelope parser and timed reducer branch', () => {
    const value = timedTrainContract()
    const parsed = parseServerMessage({ v: 1, type: 'train.status', data: value })
    expect(parsed?.type).toBe('train.status')
    if (!parsed || parsed.type !== 'train.status') throw new Error('timed status did not parse')

    const next = foldTrain({
      ...initialState(),
      view: 'F3',
      targetMeasure: 'time',
      targetDurationSeconds: 30,
    }, parsed.data)
    expect(next.elapsedTime).toBe(12)
    expect(next.currentRep).toBe(10)
    expect(next.attemptCount).toBe(12)
    expect(next.phase).toBe('active')
    expect(next.remainingTime).toBe(18)
    expect(next.romLegs).toEqual({ left: 40, right: 55, leftAvailable: true, rightAvailable: true })
    expect(next.currentCadenceSpm).toBe(112.5)
    expect(next.formScore).toBe(73.3)
  })

  it('shows the latest lift score while preserving the cumulative score for the set summary', () => {
    const value = timedTrainContract()
    value.score.score = 85
    value.score.form_factor = 0.85
    value.score.penalty = 0.15
    if (!value.last_lift_score) throw new Error('latest lift fixture is missing')
    value.last_lift_score.score = 100
    value.last_lift_score.rom_factor = 1
    value.last_lift_score.classification = 'full_rom'
    value.set.elapsed_ms = 30_000
    value.set.remaining_ms = 0
    value.set.complete = true
    value.events.set_completed = true
    value.phase = 'complete'

    const parsed = parseServerMessage({ v: 1, type: 'train.status', data: value })
    if (!parsed || parsed.type !== 'train.status') throw new Error('timed status did not parse')
    const next = foldTrain({
      ...initialState(),
      view: 'F3',
      targetMeasure: 'time',
      targetDurationSeconds: 30,
    }, parsed.data)

    expect(next.formScore).toBe(100)
    expect(next.log.timedSets.at(-1)?.score).toBe(85)
  })

  it('renders a timed knee-corridor fault as a red side-specific leg', () => {
    const value = timedTrainContract()
    value.active_rule_ids = ['knee_tracking_corridor', 'knee_drive_rom']
    value.issues = [{
      id: 'knee_tracking_corridor',
      label: 'Knee tracking',
      tier: 'high',
      side: 'left',
      state: 'not_ok',
      skeleton_color: 'red',
    }]
    value.cue = {
      rule_id: 'knee_tracking_corridor',
      text: 'Drive your knee straight ahead.',
      coaching: '',
    }
    const parsed = parseServerMessage({ v: 1, type: 'train.status', data: value })
    if (!parsed || parsed.type !== 'train.status') throw new Error('timed status did not parse')
    const next = foldTrain({
      ...initialState(), view: 'F3', targetMeasure: 'time', targetDurationSeconds: 30,
    }, parsed.data)

    expect(next.correctionSeverity).toBe('error')
    expect(next.flaggedJoint).toBe('legs')
    expect(next.flaggedSide).toBe('left')
  })

  it('renders a timed lateral-lean fault as a red torso', () => {
    const value = timedTrainContract()
    value.active_rule_ids = ['lateral_torso_lean', 'knee_drive_rom']
    value.issues = [{
      id: 'lateral_torso_lean',
      label: 'Lateral torso lean',
      tier: 'high',
      side: 'right',
      state: 'not_ok',
      skeleton_color: 'red',
    }]
    value.cue = {
      rule_id: 'lateral_torso_lean',
      text: 'Stay tall and centered.',
      coaching: '',
    }
    const parsed = parseServerMessage({ v: 1, type: 'train.status', data: value })
    if (!parsed || parsed.type !== 'train.status') throw new Error('timed status did not parse')
    const next = foldTrain({
      ...initialState(), view: 'F3', targetMeasure: 'time', targetDurationSeconds: 30,
    }, parsed.data)

    expect(next.correctionSeverity).toBe('error')
    expect(next.flaggedJoint).toBe('trunk')
  })

  it('does not apply an amber skeleton fallback to a coaching-only timed cue', () => {
    const value = timedTrainContract()
    value.cue = {
      rule_id: 'knee_drive_rom',
      text: 'Drive each knee toward hip height.',
      coaching: '',
    }
    value.issues = []
    const parsed = parseServerMessage({ v: 1, type: 'train.status', data: value })
    if (!parsed || parsed.type !== 'train.status') throw new Error('timed status did not parse')
    const next = foldTrain({
      ...initialState(), view: 'F3', targetMeasure: 'time', targetDurationSeconds: 30,
    }, parsed.data)

    expect(next.cue?.severity).toBe('neutral')
    expect(next.correctionSeverity).toBe('neutral')
    expect(next.flaggedJoint).toBeNull()
    expect(next.flaggedSide).toBeNull()
  })

  it('rejects a live timed status without bilateral ROM instead of displaying zero', () => {
    const value = timedTrainContract()
    delete (value as Partial<typeof value>).rom
    expect(parseServerMessage({ v: 1, type: 'train.status', data: value })).toBeNull()
  })

  it('rejects a live timed status without the latest-lift score contract', () => {
    const value = timedTrainContract()
    delete (value as Partial<typeof value>).last_lift_score
    expect(parseServerMessage({ v: 1, type: 'train.status', data: value })).toBeNull()
  })

  it('rejects contradictory asymmetry monitor output', () => {
    const value = timedTrainContract()
    value.monitors.left_right_asymmetry.status = 'balanced'
    expect(parseServerMessage({ v: 1, type: 'train.status', data: value })).toBeNull()
  })
})
