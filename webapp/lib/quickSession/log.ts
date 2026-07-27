// Shared "log or plan a quick session without playing it" helper — used by the
// generated-session overview AND the manual SessionBuilder, so both surfaces can
// backfill a past workout (performedAt in the past → logged done) or plan a
// future one (future date → saved as planned, startable later). Client-side.

import type { DraftExercise } from './types'

export function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const firstInt = (s?: string): number | undefined => {
  const m = s ? String(s).match(/\d+/) : null
  return m ? parseInt(m[0], 10) : undefined
}

// Turn the planned exercises into log entries: every planned set carries its
// prescribed reps (or duration). `done` marks the sets completed — true when
// logging a past/today session, false when planning a future one.
export function buildLoggedExercises(exercises: DraftExercise[], done: boolean) {
  return exercises.map((ex) => {
    const nSets = Math.max(1, Number(ex.sets) || 1)
    const reps = firstInt(ex.reps)
    const durSec = firstInt(ex.duration)
    return {
      name: ex.name,
      ...(ex.exerciseSlug && { exerciseSlug: ex.exerciseSlug }),
      sets: Array.from({ length: nSets }, (_, i) => ({
        setNumber: i + 1,
        ...(reps != null && { reps }),
        ...(durSec != null && { duration: durSec }),
        completed: done,
      })),
    }
  })
}

export interface QuickLogInput {
  sessionId: string
  title: string
  focus?: string
  exercises: DraftExercise[]
  /** YYYY-MM-DD. Past/today → logged done; future → planned. */
  date: string
}

/** POST the session to /api/workouts. Returns { done } (was it logged as done
 *  vs planned). Throws with a readable message on failure. */
export async function logQuickSession(input: QuickLogInput): Promise<{ done: boolean }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const done = input.date <= localDateStr()
  const exercises = buildLoggedExercises(input.exercises, done)
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0)
  const res = await fetch('/api/workouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({
      kind: 'quick',
      sessionId: input.sessionId,
      title: input.title,
      ...(input.focus && { focus: input.focus }),
      exercises,
      completed: done,
      ...(done && { duration: Math.max(1, Math.round(totalSets * 1.5)) }),
      performedAt: input.date,
      tz: new Date().getTimezoneOffset(),
    }),
  })
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({} as { error?: string })))?.error || 'Failed to save session')
  }
  return { done }
}
