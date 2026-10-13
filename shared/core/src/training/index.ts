/**
 * Training, streak and dashboard logic — copies of the web's pure modules
 * (NP-058, applying NP-017/NP-207).
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Every file under `src/training/` is a COPY of a file under `webapp/lib/`,
 * at the SAME relative path, so a re-copy is a file-for-file overwrite:
 *
 *   webapp/lib/workoutUtils.ts          → src/training/workoutUtils.ts
 *   webapp/lib/workout/tracking.ts      → src/training/workout/tracking.ts
 *   webapp/lib/streaks/tile.ts          → src/training/streaks/tile.ts
 *   …and so on for every file listed below.
 *
 * A copy is NEVER edited here. A behaviour change lands on the web first and
 * is re-copied (expo/README.md, "Re-copying a training module"), and
 * `webapp/tests/unit/nativeParity/trainingModules.test.ts` — which webapp CI
 * always runs — drives each copy and its web source over the same fixture
 * table and fails until the two agree again.
 *
 * The webapp does not import these yet: RedRun builds `webapp/` alone and the
 * published `@become/core` is a manual step, so the web keeps its own module
 * and the drift test holds the two identical until redsync publishes and the
 * webapp switches over. `expo/` imports them from `@become/core` today.
 *
 * ── Three aliased names ─────────────────────────────────────────────────────
 * `@become/core` already exports a `WeightUnit`, a `NutritionDirection` and a
 * `kgToUnit` from `bodyUnits` / `nutrition/tdee`. The goal tile has its own of
 * each — and its own `KG_PER_LB`, which is NOT `1 / LBS_PER_KG` to the last
 * digit — so reconciling them would change what the tile prints. They are
 * re-exported under `goalTile`-scoped names instead.
 */

export * from './workoutUtils'
export * from './workout/tracking'
export * from './workout/durationUnit'
export * from './workout/equipmentVariant'
export * from './workout/dumbbellWeight'
export * from './workout/buildAsYouGo'
export * from './workout/position'
export * from './quickSession/naming'
export * from './quickSession/log'
export * from './streaks/pillars'
export * from './streaks/tile'
export * from './dashboardLayout/types'
export * from './dashboardLayout/defaults'
export * from './videoTrim'
export * from './videoFraming'

export {
  GOAL_LABELS,
  goalLabel,
  formatWeight,
  formatWeightDelta,
  holdBand,
  describeGoal,
  kgToUnit as goalTileKgToUnit,
  type GoalTileInputs,
  type GoalTileView,
  type WeightUnit as GoalTileWeightUnit,
  type NutritionDirection as GoalTileNutritionDirection,
} from './dashboard/goalTile'

// The type-only mirrors of the webapp models these copies reference.
// `FitnessGoal` is deliberately not among them: `@become/core` already exports
// one from `nutrition/tdee` with the same five members.
export type { DraftExercise, StoredQuickSession } from './types'
