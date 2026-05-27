// Persists the per-workout PR update. Sits between the API route and Mongoose:
// the route hands it a tiny store interface (read/write the user's exercisePRs)
// and the actual gating + try/catch lives here, where it can be unit-tested
// with a fake store. Keeps lib/exercisePRs.ts strictly pure (no IO).
import {
  updatePRsForWorkout,
  type IExercisePR,
  type IPRExerciseCandidate,
  type WorkoutPRUpdateResult,
} from './exercisePRs'

export interface ExercisePRStore {
  readCurrentPRs(userId: string): Promise<IExercisePR[]>
  writePRs(userId: string, prs: IExercisePR[]): Promise<void>
}

export interface MaybePersistOpts {
  store: ExercisePRStore
  userId: string
  exercises: IPRExerciseCandidate[]
  date: Date
  programId?: string
  completed: boolean
  wasAlreadyComplete: boolean
}

// Returns the list of newly-broken PRs to surface back to the client, or [] if
// gating skipped the write or the store threw. A throw in the store is logged
// and swallowed so a PR-bookkeeping hiccup never blocks the underlying workout
// save the user came here to do.
export async function maybePersistWorkoutPRs(
  opts: MaybePersistOpts,
): Promise<WorkoutPRUpdateResult['newPRsAchieved']> {
  if (!opts.completed || opts.wasAlreadyComplete) return []
  try {
    const currentPRs = await opts.store.readCurrentPRs(opts.userId)
    const result = updatePRsForWorkout(currentPRs, opts.exercises, opts.date, opts.programId)
    await opts.store.writePRs(opts.userId, result.prs)
    return result.newPRsAchieved
  } catch (err) {
    console.error('Error updating exercise PRs:', err)
    return []
  }
}
