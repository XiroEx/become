// Workout-domain metric registration entrypoint.
//
// Call ensureWorkoutMetricsRegistered() from any server-side entrypoint that
// needs the workout metric set available in the global registry — the
// dashboard rotator, the dev gallery, integration tests, etc. Idempotent.

import { ensureStrengthCurveRegistered } from './strengthCurve'
import { ensureWeeklyVolumeByMuscleRegistered } from './weeklyVolumeByMuscle'
import { ensurePrsTimelineRegistered } from './prsTimeline'

let initialized = false

export function ensureWorkoutMetricsRegistered(): void {
  if (initialized) return
  ensureStrengthCurveRegistered()
  ensureWeeklyVolumeByMuscleRegistered()
  ensurePrsTimelineRegistered()
  initialized = true
}

export {
  computeStrengthCurve,
  aggregateStrengthCurve,
  inferTrackedStrengthExercise,
  bestSetForSession,
  STRENGTH_CURVE_METRIC,
  type StrengthCurvePoint,
  type ComputeStrengthCurveArgs,
} from './strengthCurve'

export {
  computeWeeklyVolumeByMuscle,
  aggregateWeeklyVolumeByMuscle,
  isoWeekStart,
  lastNWeekStarts,
  collectExerciseSlugs,
  bucketsToDataPoints,
  WEEKLY_VOLUME_BY_MUSCLE_METRIC,
  type WeeklyVolumeBucket,
  type ComputeWeeklyVolumeArgs,
  type ExerciseMuscles,
  type MuscleVolume,
} from './weeklyVolumeByMuscle'

export {
  computePrsTimeline,
  buildPrsTimeline,
  eventsToDataPoints,
  valueForDimension,
  PRS_TIMELINE_METRIC,
  type PrsTimelineEvent,
  type ComputePrsTimelineArgs,
  type ExercisePRsReader,
} from './prsTimeline'
