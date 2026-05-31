// Weekly-volume-per-muscle metric.
//
// Tonnage = Σ (set.weight × set.reps) over all completed weighted sets in a
// session, attributed to muscles:
//   - 1.0× to each primary muscle of the exercise
//   - 0.5× to each secondary muscle
// Weeks are bucketed by ISO week (Monday-start, UTC). Bodyweight-only and
// incomplete sets are dropped — they contribute zero load.
//
// Pure + injectable: the workout-log reader and the exercise-muscle resolver
// are both passed in (defaults wire Mongoose). Unit tests inject fixture
// readers/resolvers and never touch I/O.
//
// Platform integration:
//   - `computeWeeklyVolumeByMuscle({userId, weeks})` is the rich helper.
//   - `WEEKLY_VOLUME_BY_MUSCLE_METRIC` is the platform-shape adapter,
//     registered under id 'workout.weekly-volume-by-muscle'. Its compute
//     returns one DataPoint per (week, muscle) — t=weekStart, value=volume,
//     label=muscle — which a stacked-bar tile can group.

import { registerMetric, resolveMetric } from '../registry'
import type { DataPoint, Metric } from '../types'
import type { MuscleGroup } from '../../../models/Exercise'

// ── Public types ────────────────────────────────────────────────────────────

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

export type MuscleVolume = Partial<Record<MuscleGroup, number>>

export interface WeeklyVolumeBucket {
  /** Monday 00:00:00 UTC of the ISO week. */
  weekStart: Date
  muscles: MuscleVolume
}

export interface ExerciseMuscles {
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
}

export type WorkoutLogReader = (
  userId: string,
  from: Date,
  to: Date,
) => Promise<RawWorkoutLog[]>

export type ExerciseMusclesResolver = (
  slugs: string[],
) => Promise<Map<string, ExerciseMuscles>>

export interface ComputeWeeklyVolumeArgs {
  userId: string
  weeks: number
  /** Anchor for "now" in tests; defaults to undefined (caller must inject
   *  via readWorkoutLogs window — see defaultWorkoutLogReader). */
  now?: Date
  readWorkoutLogs?: WorkoutLogReader
  resolveExerciseMuscles?: ExerciseMusclesResolver
}

// ── ISO week helpers ────────────────────────────────────────────────────────

/**
 * Monday 00:00:00 UTC of the ISO week containing `d`. ISO weeks start Monday;
 * Sunday belongs to the *previous* week. All math is done in UTC so DST shifts
 * cannot move a workout into a different week.
 */
export function isoWeekStart(d: Date): Date {
  const utc = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
  ))
  const dow = utc.getUTCDay() // 0=Sun..6=Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  utc.setUTCDate(utc.getUTCDate() - daysFromMonday)
  return utc
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Inclusive iteration of N consecutive ISO weeks ending at the week of `end`. */
export function lastNWeekStarts(end: Date, n: number): Date[] {
  const lastStart = isoWeekStart(end)
  const out: Date[] = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(lastStart.getTime() - i * 7 * MS_PER_DAY))
  }
  return out
}

// ── Pure aggregator ─────────────────────────────────────────────────────────

/**
 * Bucket a flat list of raw logs into the weekly muscle-volume shape.
 * Pure — no I/O, no clock.
 */
export function aggregateWeeklyVolumeByMuscle(
  logs: RawWorkoutLog[],
  resolver: Map<string, ExerciseMuscles>,
  weekStarts: Date[],
): WeeklyVolumeBucket[] {
  const buckets: WeeklyVolumeBucket[] = weekStarts.map(weekStart => ({
    weekStart: new Date(weekStart),
    muscles: {},
  }))
  const indexByStart = new Map<number, WeeklyVolumeBucket>()
  for (const b of buckets) indexByStart.set(b.weekStart.getTime(), b)

  for (const log of logs) {
    if (log.completed === false) continue
    const wkStart = isoWeekStart(new Date(log.date))
    const bucket = indexByStart.get(wkStart.getTime())
    if (!bucket) continue // outside the rolling window

    for (const ex of log.exercises || []) {
      const slug = (ex.exerciseSlug || '').toLowerCase()
      if (!slug) continue
      const muscles = resolver.get(slug)
      if (!muscles) continue
      const { primary, secondary } = muscles

      let totalTonnage = 0
      for (const s of ex.sets || []) {
        if (s.completed === false) continue
        const w = s.weight ?? 0
        const r = s.reps ?? 0
        if (w <= 0 || r <= 0) continue
        totalTonnage += w * r
      }
      if (totalTonnage <= 0) continue

      for (const m of primary) {
        bucket.muscles[m] = (bucket.muscles[m] ?? 0) + totalTonnage
      }
      for (const m of secondary) {
        bucket.muscles[m] = (bucket.muscles[m] ?? 0) + totalTonnage * 0.5
      }
    }
  }

  return buckets
}

/**
 * Collect the distinct exerciseSlugs referenced in a list of logs. Used to
 * batch the muscle lookup so the resolver runs once per phase.
 */
export function collectExerciseSlugs(logs: RawWorkoutLog[]): string[] {
  const set = new Set<string>()
  for (const log of logs) {
    for (const ex of log.exercises || []) {
      const slug = (ex.exerciseSlug || '').toLowerCase()
      if (slug) set.add(slug)
    }
  }
  return [...set]
}

// ── Default readers ────────────────────────────────────────────────────────

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

export const defaultExerciseMusclesResolver: ExerciseMusclesResolver = async (
  slugs,
) => {
  const out = new Map<string, ExerciseMuscles>()
  if (slugs.length === 0) return out
  const Exercise = (await import('../../../models/Exercise')).default
  const docs = await Exercise
    .find(
      { slug: { $in: slugs } },
      { slug: 1, primaryMuscles: 1, secondaryMuscles: 1 },
    )
    .lean<Array<{ slug: string; primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] }>>()
  for (const d of docs) {
    out.set(d.slug.toLowerCase(), {
      primary: d.primaryMuscles || [],
      secondary: d.secondaryMuscles || [],
    })
  }
  return out
}

// ── Rich public compute ─────────────────────────────────────────────────────

export async function computeWeeklyVolumeByMuscle(
  args: ComputeWeeklyVolumeArgs,
): Promise<WeeklyVolumeBucket[]> {
  const readLogs = args.readWorkoutLogs ?? defaultWorkoutLogReader
  const resolveMuscles = args.resolveExerciseMuscles ?? defaultExerciseMusclesResolver

  const now = args.now ?? new Date()
  const weekStarts = lastNWeekStarts(now, args.weeks)
  const from = weekStarts[0]
  const to = new Date(weekStarts[weekStarts.length - 1].getTime() + 7 * MS_PER_DAY - 1)

  const logs = await readLogs(args.userId, from, to)
  const slugs = collectExerciseSlugs(logs)
  const muscleMap = await resolveMuscles(slugs)
  return aggregateWeeklyVolumeByMuscle(logs, muscleMap, weekStarts)
}

// ── Platform-shape Metric adapter ───────────────────────────────────────────

/**
 * Adapter. The platform Metric.compute returns DataPoint[], so we flatten
 * the rich buckets into one point per (week, muscle) pair: t=weekStart,
 * value=volume, label=muscle slug. A stacked-bar tile can group by t and
 * stack by label.
 */
export const WEEKLY_VOLUME_BY_MUSCLE_METRIC: Metric = {
  id: 'workout.weekly-volume-by-muscle',
  label: 'Weekly volume by muscle',
  unit: 'lb',
  domain: 'workout',
  trendDirection: 'up-good',
  compute: async (userId, window): Promise<DataPoint[]> => {
    if (!userId) return []
    const weekCount = Math.max(
      1,
      Math.min(
        12,
        Math.ceil(
          (window.end.getTime() - window.start.getTime() + 1) /
            (7 * MS_PER_DAY),
        ),
      ),
    )
    const buckets = await computeWeeklyVolumeByMuscle({
      userId,
      weeks: weekCount,
      now: window.end,
    })
    return bucketsToDataPoints(buckets)
  },
}

let registered = false
export function ensureWeeklyVolumeByMuscleRegistered(): void {
  if (registered && resolveMetric(WEEKLY_VOLUME_BY_MUSCLE_METRIC.id)) return
  if (resolveMetric(WEEKLY_VOLUME_BY_MUSCLE_METRIC.id)) {
    registered = true
    return
  }
  registerMetric(WEEKLY_VOLUME_BY_MUSCLE_METRIC)
  registered = true
}

export function __resetWeeklyVolumeRegistrationForTest(): void {
  registered = false
}

/** Flatten a rich bucket list to platform-shape DataPoints. Useful for the
 *  dev fixture + any future place that wants the stacked-bar series. */
export function bucketsToDataPoints(buckets: WeeklyVolumeBucket[]): DataPoint[] {
  const out: DataPoint[] = []
  for (const b of buckets) {
    for (const [muscle, value] of Object.entries(b.muscles)) {
      if (value === undefined || value === 0) continue
      out.push({ t: new Date(b.weekStart), value, label: muscle })
    }
  }
  return out
}
