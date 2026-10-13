// Shared per-set progress for a quick session, so the Track (form) view and the
// Live view hand progress off to each other with NO data loss when the user flips
// the Track|Live tab. Keyed by sessionId in localStorage; both views read it on
// mount and write it on every change. This is the quick-session analogue of the
// server-persisted resume that program workouts get (programs share via the
// /api/workouts log keyed by programId+day; quick sessions have no such GET, so we
// share client-side).

const KEY = (id: string) => `qs_progress_${id}`

export interface QuickSetProgress {
  reps?: string
  weight?: string
  duration?: string
  distance?: string
  /** mph — cardio work is a speed, not a load. */
  speed?: string
  completed: boolean
}
export interface QuickExerciseProgress {
  name: string
  exerciseSlug?: string
  sets: QuickSetProgress[]
}
export interface QuickProgressDraft {
  savedAt: number
  exercises: QuickExerciseProgress[]
}

export function readQuickProgress(sessionId: string): QuickProgressDraft | null {
  if (!sessionId || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY(sessionId))
    return raw ? (JSON.parse(raw) as QuickProgressDraft) : null
  } catch {
    return null
  }
}

export function writeQuickProgress(sessionId: string, exercises: QuickExerciseProgress[]): void {
  if (!sessionId || typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY(sessionId), JSON.stringify({ savedAt: Date.now(), exercises }))
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearQuickProgress(sessionId: string): void {
  if (!sessionId || typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY(sessionId))
  } catch {
    /* ignore */
  }
}
