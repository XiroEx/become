// Consistency-heatmap metric.
//
// GitHub-style daily activity grid. For each day in the last N weeks (aligned
// to ISO weeks, Monday-start, UTC) emits a cell:
//   { date, workoutCount, totalSets }
// Days with no workout are filled with zero cells so the grid is dense — the
// renderer can lay out a contiguous 7×N matrix without gap logic.
//
// Pure + injectable: the workout-log reader is passed in; the default queries
// UserProgress.workoutLogs via Mongoose. Tests inject fixtures and never touch
// I/O. Reuses isoWeekStart / lastNWeekStarts from the weekly-volume metric so
// week alignment is identical across the two grid-shaped metrics.

import { registerMetric, resolveMetric } from '../registry'
import type { DataPoint, Metric } from '../types'
import {
  isoWeekStart,
  lastNWeekStarts,
  type RawWorkoutLog,
  type WorkoutLogReader,
} from './weeklyVolumeByMuscle'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ── Public types ────────────────────────────────────────────────────────────

export interface HeatmapCell {
  /** Midnight UTC of the day. */
  date: Date
  /** Number of completed workout sessions logged that day. */
  workoutCount: number
  /** Total completed sets across those sessions. */
  totalSets: number
}

export interface ComputeConsistencyHeatmapArgs {
  userId: string
  weeks: number
  now?: Date
  readWorkoutLogs?: WorkoutLogReader
}

// ── Day key helper ──────────────────────────────────────────────────────────

/** Midnight UTC of the calendar day containing `d`. */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Count completed sets in a single workout log. A set counts when it is not
 * explicitly incomplete. (Unlike the volume metric, we count bodyweight sets
 * too — consistency is about showing up, not load.)
 */
export function countCompletedSets(log: RawWorkoutLog): number {
  let n = 0
  for (const ex of log.exercises || []) {
    for (const s of ex.sets || []) {
      if (s.completed === false) continue
      n++
    }
  }
  return n
}

// ── Pure aggregator ─────────────────────────────────────────────────────────

/**
 * Build a dense daily-cell grid spanning [first weekStart … last weekStart + 6
 * days], one cell per calendar day, gap-filled with zeros. Workouts with
 * completed===false are ignored. Multiple sessions on the same day aggregate
 * (workoutCount sums, totalSets sums). Logs outside the window are dropped.
 */
export function aggregateConsistencyHeatmap(
  logs: RawWorkoutLog[],
  weekStarts: Date[],
): HeatmapCell[] {
  if (weekStarts.length === 0) return []

  const firstDay = utcDayStart(weekStarts[0])
  const lastWeekStart = utcDayStart(weekStarts[weekStarts.length - 1])
  const lastDay = new Date(lastWeekStart.getTime() + 6 * MS_PER_DAY)

  // Pre-build dense cells for every day in range.
  const cells: HeatmapCell[] = []
  const indexByDay = new Map<number, HeatmapCell>()
  for (let t = firstDay.getTime(); t <= lastDay.getTime(); t += MS_PER_DAY) {
    const cell: HeatmapCell = { date: new Date(t), workoutCount: 0, totalSets: 0 }
    cells.push(cell)
    indexByDay.set(t, cell)
  }

  for (const log of logs) {
    if (log.completed === false) continue
    const dayStart = utcDayStart(new Date(log.date))
    const cell = indexByDay.get(dayStart.getTime())
    if (!cell) continue // outside the window
    cell.workoutCount += 1
    cell.totalSets += countCompletedSets(log)
  }

  return cells
}

// ── Rich public compute ─────────────────────────────────────────────────────

export async function computeConsistencyHeatmap(
  args: ComputeConsistencyHeatmapArgs,
): Promise<HeatmapCell[]> {
  const reader = args.readWorkoutLogs ?? defaultWorkoutLogReader
  const now = args.now ?? new Date()
  const weekStarts = lastNWeekStarts(now, args.weeks)
  if (weekStarts.length === 0) return []
  const from = utcDayStart(weekStarts[0])
  const to = new Date(utcDayStart(weekStarts[weekStarts.length - 1]).getTime() + 7 * MS_PER_DAY - 1)
  const logs = await reader(args.userId, from, to)
  return aggregateConsistencyHeatmap(logs, weekStarts)
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
 * Adapter. Emits one DataPoint per day — t=date, value=workoutCount,
 * label="{totalSets}". The HeatmapTile groups these into a 7×N calendar grid.
 * Defaults to a 12-week window when invoked through the platform signature.
 */
export const CONSISTENCY_HEATMAP_METRIC: Metric = {
  id: 'workout.consistency-heatmap',
  label: 'Workout consistency',
  unit: 'workouts',
  domain: 'workout',
  trendDirection: 'up-good',
  compute: async (userId, window): Promise<DataPoint[]> => {
    if (!userId) return []
    // Derive a week count from the window; fall back to 12 weeks.
    const span = window.end.getTime() - window.start.getTime()
    const weeks = Math.max(1, Math.ceil(span / (7 * MS_PER_DAY)))
    const cells = await computeConsistencyHeatmap({ userId, weeks, now: window.end })
    return cellsToDataPoints(cells)
  },
}

let registered = false
export function ensureConsistencyHeatmapRegistered(): void {
  if (registered && resolveMetric(CONSISTENCY_HEATMAP_METRIC.id)) return
  if (resolveMetric(CONSISTENCY_HEATMAP_METRIC.id)) {
    registered = true
    return
  }
  registerMetric(CONSISTENCY_HEATMAP_METRIC)
  registered = true
}

export function __resetConsistencyHeatmapRegistrationForTest(): void {
  registered = false
}

/** Flatten cells to platform DataPoints. value=workoutCount; label carries
 *  totalSets for the tile's tooltip. */
export function cellsToDataPoints(cells: HeatmapCell[]): DataPoint[] {
  return cells.map(c => ({
    t: new Date(c.date),
    value: c.workoutCount,
    label: String(c.totalSets),
  }))
}

// Re-export for callers that want week alignment without importing the volume module.
export { isoWeekStart, lastNWeekStarts }
