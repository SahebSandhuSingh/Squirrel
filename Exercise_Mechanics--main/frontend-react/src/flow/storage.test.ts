import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExerciseCatalog, saveSession, type SessionExercise } from './storage'

const exercise: SessionExercise = {
  name: 'Squat',
  slug: 'squat',
  body_part: 'Lower Body',
  training_tag: 'Strength',
  measure: 'reps',
  sets: 3,
  value: 8,
  rest_seconds: 60,
}

afterEach(() => vi.unstubAllGlobals())

describe('saveSession', () => {
  it('posts the plan and returns the normalized persisted session', async () => {
    const created = {
      session_id: '20260715T120000-abcdef1234',
      exercise_id: 'squat',
      exercise_name: 'Squat',
      variant: null,
      sets: 3,
      target: { type: 'reps' as const, value: 8 },
      rest_seconds: 60,
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveSession('rig-user', [exercise])).resolves.toEqual(created)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/users/rig-user/sessions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ exercises: [exercise] })
  })

  it('surfaces a stable backend detail so the UI can offer retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'exercise is planned and unavailable: bicep_curl' }),
      { status: 409 },
    )))
    await expect(saveSession('rig-user', [{ ...exercise, slug: 'bicep_curl' }]))
      .rejects.toThrow('exercise is planned and unavailable: bicep_curl')
  })

  it('falls back to the HTTP status when the error body is not usable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })))
    await expect(saveSession('rig-user', [exercise])).rejects.toThrow('Could not create session (500)')
  })
})

describe('fetchExerciseCatalog', () => {
  it('loads enabled/planned lifecycle state from the backend authority', async () => {
    const entries = [
      { id: 'squat', view: 'front', status: 'enabled' },
      { id: 'plank', view: 'side', status: 'planned' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ exercises: entries }), { status: 200 })))
    await expect(fetchExerciseCatalog()).resolves.toEqual(entries)
  })
})
