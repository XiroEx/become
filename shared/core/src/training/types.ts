// Type-only stand-ins for the webapp models the copied training modules
// reference, so a pure module never drags Mongoose, React or a browser API
// into `@become/core`.
//
// NP-058 / NP-017: the modules under `src/training/` are COPIES of the web's
// `webapp/lib/**` sources, laid out under the same relative paths so a
// re-copy is a straight file-for-file overwrite. See `src/training/index.ts`
// for the rule and `expo/README.md` ("Re-copying a training module after a
// web change") for the procedure. Nothing here may be "improved" on the
// native side: the drift test
// `webapp/tests/unit/nativeParity/trainingModules.test.ts` runs every copy
// against its web source over a fixture table and fails the moment the two
// disagree.
//
// Each type below is a hand mirror of the web declaration named above it. They
// are structural, so a caller holding the webapp's own type can pass it
// straight in.

/**
 * `FitnessGoal` from `webapp/models/User.ts`.
 *
 * `@become/core` already exports a `FitnessGoal` of its own from
 * `nutrition/tdee` with the same five members; this copy exists so
 * `dashboard/goalTile.ts` reads exactly like its web source and cannot drift
 * when either union changes independently. It is deliberately NOT re-exported
 * from the package barrel.
 */
export type FitnessGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'improve_performance'
  | 'general_health'

/**
 * `DraftExercise` from `webapp/lib/quickSession/types.ts` — one exercise in a
 * program-less session before it is logged.
 */
export interface DraftExercise {
  exerciseSlug: string
  name: string
  trackingType: string
  sets: number
  reps: string // e.g. "8-12" or "" for time-based
  rest?: string
  duration?: string // timed prescription for time-based tracking
  primaryMuscles?: string[]
  /** Catalog fields needed to log weight per-dumbbell/kettlebell rather than
   *  a barbell total — see workout/dumbbellWeight.ts. */
  equipment?: string[]
  laterality?: string
  movementPatterns?: string[]
  // Grouping — a superset or circuit, which can be made mid-session (see
  // workout/buildAsYouGo.ts). Consecutive exercises sharing a groupId are
  // interleaved by the live flow builder.
  groupId?: string
  groupType?: string
  groupLabel?: string
  groupRest?: string
  groupRounds?: number
  /** Added while the session was already running. */
  addedAdHoc?: boolean
}

/**
 * `StoredQuickSession` from `webapp/lib/quickSession/store.ts`, reduced to the
 * three fields `quickSession/naming.ts` reads. The web store itself is
 * `localStorage`-backed and does not travel; the native session store arrives
 * with NP-081.
 */
export interface StoredQuickSession {
  title: string
  /** Explicit lifecycle state. Automatic titles can sound meaningful, so the
   *  title text alone cannot tell whether the member chose a name. */
  needsName?: boolean
  /** Server log this repeat was copied from. */
  sourceSessionId?: string
}
