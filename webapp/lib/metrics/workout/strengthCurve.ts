// Strength-curve-per-exercise metric.
//
// Returns a per-session series of [date, weight, reps, e1RM] for one exercise
// slug across a date window. The session-level point is the user's *best*
// completed working set that day (highest e1RM; weight as tie-break).
//
// Pure + injectable: the data-source is passed in. The default implementation
// queries UserProgress.workoutLogs with Mongoose. Unit tests pass a fixture
// reader so they touch no I/O.
//
// Platform integration:
//   - `computeStrengthCurve()` is the rich helper (per-exercise, per-window).
//   - `STRENGTH_CURVE_METRIC` is a thin platform-shape adapter registered with
//     the metric registry. Tile gallery + dashboard rotator use that.
//     Because the platform's Metric.compute signature is (userId, window) and
//     has no exercise-slug input, the registered metric returns an empty
//     series by default; concrete per-exercise drilldowns call
//     computeStrengthCurve() directly.

import { epley1RM } from '../../exercisePRs'
import { registerMetric, resolveMetric } from '../registry'
import type { DataPoint, Metric } from '../types'

// ── Public types ────────────────────────────────────────────────────────────

export interface StrengthCurvePoint {
  /** Workout date (midnight UTC of the session). */
  t: Date
  /** Best set's weight at that session. */
  weight: number
  /** Reps at the best set. */
  reps: number
  /** Estimated 1RM via Epley: weight × (1 + reps/30). */
  e1RM: number
}

export interface RawSet {
  weight?: number | null
  reps?: number | null
  completed?: boolean
}

export interface RawExercise {
  exerciseSlug?: string | null
  sets?: RawSet[]
}

export interface RawWorkoutLog {
  date: Date
  exercises?: RawExercise[]
  completed?: boolean
}

export type WorkoutLogReader = (
  userId: string,
  from: Date,
  to: Date,
) => Promise<RawWorkoutLog[]>

export interface ComputeStrengthCurveArgs {
  userId: string
  exerciseSlug: string
  from: Date
  to: Date
  /** Test seam. Defaults to defaultWorkoutLogReader. */
  readWorkoutLogs?: WorkoutLogReader
}

// ── Pure aggregator ─────────────────────────────────────────────────────────

/**
 * Reduce a session's sets for one exercise to a single "best" set. Best = the
 * set with the highest Epley-1RM; weight is the tie-break.
 *
 * Returns null when no completed set with positive weight + positive reps
 * exists — bodyweight or all-failed sessions are intentionally dropped.
 */
export function bestSetForSession(sets: RawSet[]): StrengthCurvePoint | null {
  let best: StrengthCurvePoint | null = null
  for (const s of sets) {
    if (s.completed === false) continue
    const w = s.weight ?? 0
    const r = s.reps ?? 0
    if (w <= 0 || r <= 0) continue
    const e = epley1RM(w, r)
    if (
      !best ||
      e > best.e1RM ||
      (e === best.e1RM && w > best.weight)
    ) {
      best = { t: new Date(0), weight: w, reps: r, e1RM: e }
    }
  }
  return best
}

/**
 * Build a chronologically ordered StrengthCurvePoint[] from raw workout logs.
 * Filters by exerciseSlug (case-insensitive equality), drops sessions where
 * no completed weighted set exists, and sorts by date ascending.
 */
export function aggregateStrengthCurve(
  logs: RawWorkoutLog[],
  exerciseSlug: string,
): StrengthCurvePoint[] {
  const slug = exerciseSlug.toLowerCase()
  const out: StrengthCurvePoint[] = []
  for (const log of logs) {
    if (log.completed === false) continue
    const exercises = log.exercises || []
    // Merge sets across all matching exercise entries in the session (some
    // schedules log the same slug twice, e.g. across supersets).
    const allSets: RawSet[] = []
    for (const ex of exercises) {
      if ((ex.exerciseSlug || '').toLowerCase() !== slug) continue
      for (const s of ex.sets || []) allSets.push(s)
    }
    if (allSets.length === 0) continue
    const best = bestSetForSession(allSets)
    if (!best) continue
    out.push({ ...best, t: new Date(log.date) })
  }
  out.sort((a, b) => a.t.getTime() - b.t.getTime())
  return out
}

export function inferTrackedStrengthExercise(
  logs: RawWorkoutLog[],
): string | null {
  const counts = new Map<string, { count: number; volume: number }>()
  for (const log of logs) {
    if (log.completed === false) continue
    for (const ex of log.exercises || []) {
      const slug = (ex.exerciseSlug || '').toLowerCase()
      if (!slug) continue
      let volume = 0
      for (const s of ex.sets || []) {
        if (s.completed === false) continue
        const w = s.weight ?? 0
        const r = s.reps ?? 0
        if (w > 0 && r > 0) volume += w * r
      }
      if (volume <= 0) continue
      const current = counts.get(slug) ?? { count: 0, volume: 0 }
      current.count += 1
      current.volume += volume
      counts.set(slug, current)
    }
  }

  let best: { slug: string; count: number; volume: number } | null = null
  for (const [slug, stats] of counts) {
    if (
      !best ||
      stats.count > best.count ||
      (stats.count === best.count && stats.volume > best.volume)
    ) {
      best = { slug, ...stats }
    }
  }
  return best?.slug ?? null
}

// ── Default reader (Mongoose) ───────────────────────────────────────────────

/**
 * Default reader: lean query of UserProgress.workoutLogs scoped to the window.
 * Defers model resolution to avoid import-time mongoose touches in tests.
 */
export const defaultWorkoutLogReader: WorkoutLogReader = async (
  userId,
  from,
  to,
) => {
  // Resolve UserProgress at call time so test paths that never call the
  // reader don't drag the Mongoose model graph into their import chain.
  const UserProgress = (await import('../../../models/UserProgress')).default
  const doc = await UserProgress
    .findOne({ userId }, { workoutLogs: 1 })
    .lean<{ workoutLogs: RawWorkoutLog[] } | null>()
  if (!doc) return []
  return (doc.workoutLogs || []).filter(l => {
    const d = new Date(l.date).getTime()
    return d >= from.getTime() && d <= to.getTime()
  })
}

// ── Rich public compute ────────────────────────────────────────────────────

export async function computeStrengthCurve(
  args: ComputeStrengthCurveArgs,
): Promise<StrengthCurvePoint[]> {
  const reader = args.readWorkoutLogs ?? defaultWorkoutLogReader
  const logs = await reader(args.userId, args.from, args.to)
  return aggregateStrengthCurve(logs, args.exerciseSlug)
}

// ── Platform-shape Metric adapter ───────────────────────────────────────────

/**
 * Adapts the rich strength-curve helper to the platform's Metric.compute
 * signature. The platform shape has no exerciseSlug input, so the registered
 * metric returns an empty series; per-exercise drilldown pages call
 * computeStrengthCurve() directly. The metric is still registered so the
 * platform recognises it (for tile customization, suggestion-engine feature
 * lookup, etc.) and so future per-user "primary tracked lift" inference can
 * be plugged in without changing the public id.
 */
export const STRENGTH_CURVE_METRIC: Metric = {
  id: 'workout.strength-curve',
  label: 'Strength curve',
  unit: 'lb',
  domain: 'workout',
  trendDirection: 'up-good',
  compute: async (userId, window): Promise<DataPoint[]> => {
    if (!userId) return []
    const logs = await defaultWorkoutLogReader(userId, window.start, window.end)
    const exerciseSlug = inferTrackedStrengthExercise(logs)
    if (!exerciseSlug) return []
    return aggregateStrengthCurve(logs, exerciseSlug).map((point) => ({
      t: point.t,
      value: Math.round(point.e1RM * 10) / 10,
      label: `${exerciseSlug}:${point.weight}x${point.reps}`,
    }))
  },
}

let registered = false
export function ensureStrengthCurveRegistered(): void {
  if (registered && resolveMetric(STRENGTH_CURVE_METRIC.id)) return
  if (resolveMetric(STRENGTH_CURVE_METRIC.id)) {
    registered = true
    return
  }
  registerMetric(STRENGTH_CURVE_METRIC)
  registered = true
}

/**
 * Test-only: drop the registration flag so a subsequent test can re-register
 * after clearing the global registry.
 */
export function __resetStrengthCurveRegistrationForTest(): void {
  registered = false
}
