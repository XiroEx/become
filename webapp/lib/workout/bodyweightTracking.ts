// "Bodyweight" said three times, once where it counts.
//
// Jon, 8/25: "someone put body weight and after making it the exercise showed
// weights with it." The create form (components/workout/CustomExerciseFields)
// says "bodyweight" in three places and only one of them decides whether a set
// asks for a load:
//
//   1. Category → the "Bodyweight" chip (stored as category 'calisthenics')
//   2. Equipment → the 'bodyweight' value in the Advanced section
//   3. Tracking Type → 'reps_bodyweight', which is the one that matters
//
// A member who picks Bodyweight as the category, or as the equipment,
// reasonably thinks they are done — and the exercise is created with the
// default `reps_weight`, so Live and Track both put a weight box on a push-up.
//
// So: when the form carries a bodyweight signal and the member has NOT chosen a
// tracking type themselves, tracking follows the signal. The member's own
// choice always wins and is never inferred over — "Bodyweight" plus a load is a
// real combination (weighted pull-ups, a dip belt), and an exercise opened for
// EDIT already carries a saved answer, which is theirs by definition.
//
// What `reps_bodyweight` means downstream is untouched: it is still sets × reps
// with no weight field (lib/workout/tracking.ts, trackColumns, the Live and
// Track views). This module only decides when it gets picked for you.

import { DEFAULT_TRACKING, normalizeTracking, type TrackingType } from './tracking'

/** The create form's own category value for bodyweight work. */
export const BODYWEIGHT_CATEGORY = 'bodyweight'

/**
 * What that category resolves to once stored — see
 * CUSTOM_EXERCISE_CATEGORY_MAP in lib/customExerciseFields.ts. Saved documents
 * never carry the form's vocabulary, so the audit below has to recognise both.
 */
export const BODYWEIGHT_STORED_CATEGORY = 'calisthenics'

/** The Equipment enum value for bodyweight work. */
export const BODYWEIGHT_EQUIPMENT = 'bodyweight'

/** Sets × reps, no load. */
export const BODYWEIGHT_TRACKING: TrackingType = 'reps_bodyweight'

/** The two places other than the tracking picker where a form says bodyweight. */
export interface BodyweightSignalFields {
  category?: string | null
  equipment?: readonly string[] | null
}

/** Does this exercise call itself bodyweight anywhere but the tracking picker? */
export function saysBodyweight(fields: BodyweightSignalFields): boolean {
  const category = (fields.category ?? '').trim().toLowerCase()
  if (category === BODYWEIGHT_CATEGORY || category === BODYWEIGHT_STORED_CATEGORY) return true
  return (fields.equipment ?? []).some((item) => String(item).trim().toLowerCase() === BODYWEIGHT_EQUIPMENT)
}

export interface BodyweightInferenceOptions {
  /**
   * True once the member has picked a tracking type for themselves — in this
   * form session, or by opening an exercise that already has one. Nothing is
   * inferred over an explicit choice, on this edit or any later one.
   */
  trackingTypeExplicit?: boolean
}

/**
 * The tracking type a set of form values should carry.
 *
 * Only ever moves between the default (`reps_weight`) and `reps_bodyweight`:
 * the bodyweight signal cannot overrule a member who picked Time, and
 * un-picking Bodyweight hands back the default rather than leaving an inferred
 * `reps_bodyweight` behind on a barbell lift.
 */
export function bodyweightTrackingFor<T extends BodyweightSignalFields & { trackingType: string }>(
  values: T,
  options: BodyweightInferenceOptions = {},
): TrackingType | null {
  if (options.trackingTypeExplicit) return null
  const current = normalizeTracking(values.trackingType)
  if (saysBodyweight(values)) {
    return current === DEFAULT_TRACKING ? BODYWEIGHT_TRACKING : null
  }
  // Nothing says bodyweight any more, and the member never chose this — so it
  // was ours to set and ours to take back.
  return current === BODYWEIGHT_TRACKING ? DEFAULT_TRACKING : null
}

/**
 * The same values with the inferred tracking type applied. Returned unchanged
 * (same object) when there is nothing to infer, so callers can pass every form
 * change through this without churn.
 */
export function applyBodyweightTracking<T extends BodyweightSignalFields & { trackingType: string }>(
  values: T,
  options: BodyweightInferenceOptions = {},
): T {
  const inferred = bodyweightTrackingFor(values, options)
  return inferred === null ? values : { ...values, trackingType: inferred }
}

// ─── The report: exercises that say bodyweight but track weight ──────────────
//
// Everything created before this fix is still in the database, and a member may
// have MEANT it (weighted pull-ups). So they are listed, not migrated — see
// scripts/audit-bodyweight-tracking.ts for the runnable report.

/** One stored custom exercise, as the audit reads it. */
export interface AuditableCustomExercise {
  slug: string
  name?: string
  category?: string | null
  equipment?: readonly string[] | null
  trackingType?: string | null
  createdBy?: string | null
  createdAt?: Date | string | null
}

/** Says bodyweight (category or equipment) yet asks for a load. */
export function isBodyweightTrackingMismatch(exercise: AuditableCustomExercise): boolean {
  if (!saysBodyweight(exercise)) return false
  return normalizeTracking(exercise.trackingType) === DEFAULT_TRACKING
}

export interface BodyweightMismatch extends AuditableCustomExercise {
  /** Which of the two signals said bodyweight — both, when both did. */
  signals: Array<'category' | 'equipment'>
}

/** Every mismatched exercise in the given set, with the signal that flagged it. */
export function findBodyweightTrackingMismatches(
  exercises: readonly AuditableCustomExercise[],
): BodyweightMismatch[] {
  return exercises.filter(isBodyweightTrackingMismatch).map((exercise) => {
    const category = (exercise.category ?? '').trim().toLowerCase()
    const signals: Array<'category' | 'equipment'> = []
    if (category === BODYWEIGHT_CATEGORY || category === BODYWEIGHT_STORED_CATEGORY) signals.push('category')
    if ((exercise.equipment ?? []).some((item) => String(item).trim().toLowerCase() === BODYWEIGHT_EQUIPMENT)) {
      signals.push('equipment')
    }
    return { ...exercise, signals }
  })
}
