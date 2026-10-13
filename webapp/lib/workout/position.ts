// Where you are in a workout — shared between the Live view and the Track view.
//
// The two views are one workout seen two ways, and flipping between them used
// to throw away your place: Live rebuilt its flow from scratch and started at
// set 1, so a member three sets into an exercise came back to the top and
// re-logged over work they had already done.
//
// Progress (the reps and weights) was already shared. This is the other half:
// the exercise and set you were standing on.
//
// The storage wrapper is deliberately thin and total — a missing, stale or
// corrupt entry just means "no opinion", and the caller falls back to the first
// incomplete set, which is what it did before.

export interface WorkoutPosition {
  exerciseIndex: number
  setIndex: number
  /** Epoch ms, so a position from a workout two days ago is ignored. */
  at: number
}

/** Positions older than this are treated as no position at all. */
export const POSITION_MAX_AGE_MS = 12 * 60 * 60 * 1000

const key = (scope: string) => `workout_pos_${scope}`

/** The storage scope for a quick session. */
export function quickScope(sessionId: string): string {
  return `quick:${sessionId}`
}

/** The storage scope for a program workout day. */
export function programScope(programId: string, day: string): string {
  return `program:${programId}:${day}`
}

export function writePosition(scope: string, exerciseIndex: number, setIndex: number, now = Date.now()): void {
  if (!scope || typeof window === 'undefined') return
  if (!Number.isFinite(exerciseIndex) || !Number.isFinite(setIndex)) return
  try {
    localStorage.setItem(key(scope), JSON.stringify({ exerciseIndex, setIndex, at: now } satisfies WorkoutPosition))
  } catch {
    /* storage full or disabled — the fallback is the first incomplete set */
  }
}

export function readPosition(scope: string, now = Date.now()): WorkoutPosition | null {
  if (!scope || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key(scope))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<WorkoutPosition>
    if (typeof p?.exerciseIndex !== 'number' || typeof p?.setIndex !== 'number') return null
    if (typeof p.at !== 'number' || now - p.at > POSITION_MAX_AGE_MS) return null
    return { exerciseIndex: p.exerciseIndex, setIndex: p.setIndex, at: p.at }
  } catch {
    return null
  }
}

export function clearPosition(scope: string): void {
  if (!scope || typeof window === 'undefined') return
  try { localStorage.removeItem(key(scope)) } catch { /* ignore */ }
}

interface StepLike { exerciseIndex: number; setIndex: number }
interface SetLike { completed?: boolean }

/**
 * Which step to open on.
 *
 * The remembered position wins — that is the whole point of remembering it, and
 * it is what makes flipping Track↔Live feel like one workout. It is only
 * overruled when the step no longer exists (the workout changed underneath it),
 * in which case we fall back to the first set that still needs doing, and then
 * to the last step of the workout.
 */
export function resolveStartStep(
  flow: StepLike[],
  data: SetLike[][],
  saved?: WorkoutPosition | null,
): number {
  if (flow.length === 0) return 0
  if (saved) {
    const at = flow.findIndex(s => s.exerciseIndex === saved.exerciseIndex && s.setIndex === saved.setIndex)
    if (at !== -1) return at
  }
  for (let i = 0; i < flow.length; i++) {
    const step = flow[i]!
    if (!data[step.exerciseIndex]?.[step.setIndex]?.completed) return i
  }
  return flow.length - 1
}
