/* demoSession.ts — provisioning for the demo-first entry (see App.tsx DEMO_PUSHUP).

   The normal flow reaches a live set through the landing page, a profile choice and the Solo
   workout builder. A demo has already made all three of those decisions, so this makes them
   non-interactively and produces exactly what the Solo builder produces: a persisted session id
   and the normalized WorkoutConfig the coach runs on. Nothing downstream is stubbed — the same
   setup gate, baseline capture, rules and scoring run afterwards.

   Kept apart from the component so it can be tested without a DOM. */
import type { WorkoutConfig } from '../types'
import {
  createUser, loadUser, loadUsers, saveSession, saveUser,
  type CachedUser, type SessionExercise,
} from './storage'

/* One set of five: enough to watch depth, body line and the camera monitor all do their thing
   without the demo turning into a workout. */
export const DEMO_PUSHUP_EXERCISE: SessionExercise = {
  name: 'Push-up',
  slug: 'pushup',
  body_part: 'Upper Body',
  training_tag: 'Strength',
  measure: 'reps',
  sets: 1,
  value: 5,
  rest_seconds: 60,
}

/* Placeholder anthropometrics. Nothing in the push-up pipeline reads height or weight — the
   baseline is captured per set from the user's own body — but POST /api/users requires a complete
   profile, so these exist to satisfy that contract, not to describe anyone. */
export const DEMO_PROFILE = {
  first_name: 'Demo',
  last_name: 'User',
  gender: 'unspecified',
  height_cm: 175,
  weight_kg: 70,
  date_of_birth: '1995-01-01',
  mobile: '0000000000',
  email: 'demo@example.invalid',
}

/* Reuse an identity that already exists on this device before minting one: a demo that created a
   fresh user per reload would litter data/users/ and throw away the saved baseline each time. */
export async function demoUser(): Promise<CachedUser> {
  const active = loadUser()
  if (active) return active
  const [first] = loadUsers()
  if (first) { saveUser(first); return first }
  const created = await createUser(DEMO_PROFILE)
  saveUser(created)
  return created
}

export type DemoSession = { user: CachedUser; sessionId: string; workout: WorkoutConfig }

export async function startPushUpDemo(): Promise<DemoSession> {
  const user = await demoUser()
  const created = await saveSession(user.user_id, [DEMO_PUSHUP_EXERCISE])
  // The persisted normalized plan is authoritative, exactly as it is for a Solo-built session:
  // the backend may clamp or canonicalize what was asked for, and the coach must run on what was
  // actually stored rather than on what the client sent.
  return {
    user,
    sessionId: created.session_id,
    workout: {
      exerciseId: created.exercise_id,
      exerciseName: created.exercise_name,
      variant: created.variant ?? undefined,
      sets: created.sets,
      measure: created.target.type,
      reps: created.target.type === 'reps' ? created.target.value : 0,
      durationSeconds: created.target.type === 'time' ? created.target.value_ms / 1000 : 0,
      restSeconds: created.rest_seconds,
    },
  }
}
