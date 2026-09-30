// Where you are in a workout — shared pure logic for step resolution, scope, and age rules.
// Storage-backed methods (writePosition, readPosition, clearPosition) remain web-only (localStorage);
// native position storage is implemented via AsyncStorage in NP-081.

export interface WorkoutPosition {
  exerciseIndex: number
  setIndex: number
  /** Epoch ms, so a position from a workout two days ago is ignored. */
  at: number
}

/** Positions older than this are treated as no position at all. */
export const POSITION_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** The storage scope for a quick session. */
export function quickScope(sessionId: string): string {
  return `quick:${sessionId}`
}

/** The storage scope for a program workout day. */
export function programScope(programId: string, day: string): string {
  return `program:${programId}:${day}`
}

export interface StepLike {
  exerciseIndex: number
  setIndex: number
}

export interface SetLike {
  completed?: boolean
}

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
