// Rep-trend-per-exercise metric.
//
// For one exercise slug, returns the weekly average reps per set performed at
// the user's *modal working weight* — the single weight value the user used
// for the most sets across the window. Holding weight fixed isolates a
// reps-dropping-at-same-weight regression (a fatigue / overreaching signal)
// from ordinary load progression, which the strength-curve metric already
// covers.
//
// "Modal working weight" is computed across the whole window so the weekly
// series is comparable week-to-week (a per-week mode would let the reference
// weight drift). Only sets at that weight count toward each week's average.
//
// Pure + injectable: the workout-log reader is passed in; the default queries
// UserProgress.workoutLogs via Mongoose. Reuses isoWeekStart / lastNWeekStarts
// from the volume metric so week alignment matches the other weekly metrics.

import { registerMetric, resolveMetric } from '../registry'
import type { DataPoint, Metric } from '../types'
import {
  isoWeekStart,
  lastNWeekStarts,
  type RawSet,
  type RawWorkoutLog,
  type WorkoutLogReader,
} from './weeklyVolumeByMuscle'
import { inferTrackedStrengthExercise } from './strengthCurve'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ── Public types ────────────────────────────────────────────────────────────

export interface RepTrendPoint {
  /** Monday 00:00:00 UTC of the ISO week. */
  weekStart: Date
  /** Average reps per qualifying set that week (at the modal working weight). */
  avgReps: number
  /** Number of qualifying sets that week. 0 when the user didn't train this
   *  exercise at the working weight that week. */
  setCount: number
}

export interface ComputeRepTrendArgs {
  userId: string
  exerciseSlug: string
  weeks: number
  now?: Date
  /** Override the modal-weight inference (e.g. pin to a known working weight). */
  workingWeight?: number
  readWorkoutLogs?: WorkoutLogReader
}

// ── Set collection ──────────────────────────────────────────────────────────

interface QualifyingSet {
  weight: number
  reps: number
  weekStart: number
}

/**
 * Collect all completed weighted sets for one slug across the logs, tagged
 * with their ISO-week start. Bodyweight (weight<=0), zero-rep, and incomplete
 * sets are dropped — they have no defined "working weight".
 */
export function collectQualifyingSets(
  logs: RawWorkoutLog[],
  exerciseSlug: string,
): QualifyingSet[] {
  const slug = exerciseSlug.toLowerCase()
  const out: QualifyingSet[] = []
  for (const log of logs) {
    if (log.completed === false) continue
    const wk = isoWeekStart(new Date(log.date)).getTime()
    for (const ex of log.exercises || []) {
      if ((ex.exerciseSlug || '').toLowerCase() !== slug) continue
      for (const s of ex.sets || []) {
        if (s.completed === false) continue
        const w = s.weight ?? 0
        const r = s.reps ?? 0
        if (w <= 0 || r <= 0) continue
        out.push({ weight: w, reps: r, weekStart: wk })
      }
    }
  }
  return out
}

/**
 * Modal working weight = the weight value with the most qualifying sets across
 * the window. Tie-break: the heavier weight wins (more likely the real working
 * set vs. a warmup). Returns null when there are no qualifying sets.
 */
export function modalWorkingWeight(sets: QualifyingSet[]): number | null {
  if (sets.length === 0) return null
  const counts = new Map<number, number>()
  for (const s of sets) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1)
  let bestWeight: number | null = null
  let bestCount = -1
  for (const [weight, count] of counts) {
    if (count > bestCount || (count === bestCount && weight > (bestWeight ?? -Infinity))) {
      bestWeight = weight
      bestCount = count
    }
  }
  return bestWeight
}

// ── Pure aggregator ─────────────────────────────────────────────────────────

/**
 * Build the weekly rep-trend series. One bucket per week in `weekStarts`
 * (dense, gap-filled with setCount 0 / avgReps 0). Only sets at
 * `workingWeight` count. avgReps is rounded to 2 decimals.
 */
export function aggregateRepTrend(
  sets: QualifyingSet[],
  workingWeight: number,
  weekStarts: Date[],
): RepTrendPoint[] {
  const buckets: RepTrendPoint[] = weekStarts.map(weekStart => ({
    weekStart: new Date(weekStart),
    avgReps: 0,
    setCount: 0,
  }))
  const totalsByWeek = new Map<number, { reps: number; count: number }>()
  for (const b of buckets) totalsByWeek.set(b.weekStart.getTime(), { reps: 0, count: 0 })

  for (const s of sets) {
    if (s.weight !== workingWeight) continue
    const acc = totalsByWeek.get(s.weekStart)
    if (!acc) continue // outside the window
    acc.reps += s.reps
    acc.count += 1
  }

  for (const b of buckets) {
    const acc = totalsByWeek.get(b.weekStart.getTime())!
    b.setCount = acc.count
    b.avgReps = acc.count > 0 ? Math.round((acc.reps / acc.count) * 100) / 100 : 0
  }

  return buckets
}

// ── Rich public compute ─────────────────────────────────────────────────────

export async function computeRepTrend(
  args: ComputeRepTrendArgs,
): Promise<RepTrendPoint[]> {
  const reader = args.readWorkoutLogs ?? defaultWorkoutLogReader
  const now = args.now ?? new Date()
  const weekStarts = lastNWeekStarts(now, args.weeks)
  if (weekStarts.length === 0) return []
  const from = weekStarts[0]
  const to = new Date(weekStarts[weekStarts.length - 1].getTime() + 7 * MS_PER_DAY - 1)

  const logs = await reader(args.userId, from, to)
  const sets = collectQualifyingSets(logs, args.exerciseSlug)
  const workingWeight = args.workingWeight ?? modalWorkingWeight(sets)
  if (workingWeight == null) {
    // No working weight to anchor on — return a dense zero series.
    return weekStarts.map(weekStart => ({ weekStart: new Date(weekStart), avgReps: 0, setCount: 0 }))
  }
  return aggregateRepTrend(sets, workingWeight, weekStarts)
}

// ── Default reader (Mongoose) ───────────────────────────────────────────────

export const defaultWorkoutLogReader: WorkoutLogReader = async (
  userId,
  from,
  to,
) => {
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

// ── Platform-shape Metric adapter ───────────────────────────────────────────

/**
 * Adapter. Like the strength-curve adapter, the platform Metric.compute has no
 * exercise-slug input, so this infers the user's most-trained exercise and
 * returns its rep trend over the window. value=avgReps, label=setCount.
 * Per-exercise drilldowns call computeRepTrend() directly.
 */
export const REP_TREND_METRIC: Metric = {
  id: 'workout.rep-trend',
  label: 'Rep trend',
  unit: 'reps',
  domain: 'workout',
  trendDirection: 'up-good',
  compute: async (userId, window): Promise<DataPoint[]> => {
    if (!userId) return []
    const logs = await defaultWorkoutLogReader(userId, window.start, window.end)
    const exerciseSlug = inferTrackedStrengthExercise(logs)
    if (!exerciseSlug) return []
    const span = window.end.getTime() - window.start.getTime()
    const weeks = Math.max(1, Math.ceil(span / (7 * MS_PER_DAY)))
    const series = await computeRepTrend({ userId, exerciseSlug, weeks, now: window.end })
    return pointsToDataPoints(series)
  },
}

let registered = false
export function ensureRepTrendRegistered(): void {
  if (registered && resolveMetric(REP_TREND_METRIC.id)) return
  if (resolveMetric(REP_TREND_METRIC.id)) {
    registered = true
    return
  }
  registerMetric(REP_TREND_METRIC)
  registered = true
}

export function __resetRepTrendRegistrationForTest(): void {
  registered = false
}

/** Flatten the weekly rep-trend series to platform DataPoints. value=avgReps;
 *  label carries setCount for the tile's tooltip. */
export function pointsToDataPoints(points: RepTrendPoint[]): DataPoint[] {
  return points.map(p => ({
    t: new Date(p.weekStart),
    value: p.avgReps,
    label: String(p.setCount),
  }))
}
