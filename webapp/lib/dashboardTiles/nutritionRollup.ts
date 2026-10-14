import type { PipelineStage } from 'mongoose'
import type { NutritionDay } from '@/lib/suggestions/nutrition'

/**
 * Number of days to include in the nutrition rollup window, widened by one day
 * (15 days instead of 14) so a shifted local bucket at the timezone edge is
 * never clipped by the `$gte: since` timestamp filter.
 */
export const NUTRITION_ROLLUP_DAYS = 15

export function computeNutritionRollupSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - NUTRITION_ROLLUP_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Builds the MongoDB aggregation pipeline for the 14-day nutrition rollup.
 *
 * Requirements:
 * 1. Buckets by the CALLER'S local day using `tzOffsetMinutes` (minutes WEST of UTC).
 *    Instant is shifted via `{ $subtract: ['$loggedAt', tzOffsetMinutes * 60000] }`,
 *    matching `localDateKey` semantics, so an evening meal (e.g. 8pm in New York)
 *    lands on the member's local day, not tomorrow's UTC day.
 * 2. Untimed meal logs (`untimed: true`) are excluded from the rollup: as documented
 *    in `webapp/models/MealLog.ts`, while `loggedAt` is populated for untimed logs,
 *    its clock reading is not meaningful (the day view positions them by tag anchor).
 *    Bucketing them on a shifted clock instant could push them across local day boundaries
 *    incorrectly (e.g. late-night logging for the prior day). To ensure suggestions are
 *    never influenced by meaningless clock readings, untimed logs are excluded from this
 *    14-day rollup (`untimed: { $ne: true }`).
 */
export function buildNutritionRollupPipeline(
  userId: unknown,
  since: Date,
  tzOffsetMinutes: number,
): PipelineStage[] {
  return [
    {
      $match: {
        user: userId,
        loggedAt: { $gte: since },
        // Untimed meal logs (untimed: true) are excluded from the suggestion rollup.
        // As documented in webapp/models/MealLog.ts, while `loggedAt` is populated for
        // untimed logs, its clock reading is not meaningful (the day view positions
        // them by tag anchor). Bucketing them on a shifted clock instant could push
        // them across local day boundaries incorrectly (e.g. late-night logging for the
        // prior day). To ensure suggestions are never influenced by meaningless clock readings,
        // untimed logs are excluded from this 14-day rollup.
        untimed: { $ne: true },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $subtract: ['$loggedAt', tzOffsetMinutes * 60_000] },
          },
        },
        calories: { $sum: '$totalNutrition.calories' },
        protein: { $sum: '$totalNutrition.protein' },
        logCount: { $sum: 1 },
      },
    },
  ]
}

/**
 * Maps aggregation group rows back to NutritionDay domain objects,
 * anchoring each day's date at noon-UTC (`T12:00:00Z`).
 */
export function mapRollupRowsToNutritionDays(
  rows: Array<{ _id: string; calories?: number | null; protein?: number | null; logCount?: number | null }>,
): NutritionDay[] {
  return rows.map((r) => ({
    date: new Date(`${r._id}T12:00:00Z`),
    calories: r.calories ?? 0,
    protein: r.protein ?? 0,
    logCount: r.logCount ?? 0,
  }))
}

/**
 * In-memory simulation of the MongoDB aggregation pipeline logic, allowing unit tests
 * to verify local-day bucketing, untimed log exclusion, and noon-UTC anchoring without
 * requiring a live MongoDB server.
 */
export function simulateNutritionRollup(
  logs: Array<{
    user?: unknown
    loggedAt: Date | string
    untimed?: boolean
    totalNutrition?: { calories?: number; protein?: number }
  }>,
  tzOffsetMinutes: number,
  since?: Date,
): NutritionDay[] {
  const buckets = new Map<string, { calories: number; protein: number; logCount: number }>()

  for (const log of logs) {
    const at = log.loggedAt instanceof Date ? log.loggedAt : new Date(log.loggedAt)
    if (Number.isNaN(at.getTime())) continue
    if (since && at.getTime() < since.getTime()) continue
    // Untimed logs are excluded from the rollup
    if (log.untimed === true) continue

    // Bucket on shifted instant: $subtract: ['$loggedAt', tzOffsetMinutes * 60000]
    const shifted = new Date(at.getTime() - tzOffsetMinutes * 60_000)
    const y = shifted.getUTCFullYear()
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
    const d = String(shifted.getUTCDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`

    const current = buckets.get(key) ?? { calories: 0, protein: 0, logCount: 0 }
    current.calories += log.totalNutrition?.calories ?? 0
    current.protein += log.totalNutrition?.protein ?? 0
    current.logCount += 1
    buckets.set(key, current)
  }

  const rows = Array.from(buckets.entries()).map(([id, b]) => ({
    _id: id,
    calories: b.calories,
    protein: b.protein,
    logCount: b.logCount,
  }))

  return mapRollupRowsToNutritionDays(rows)
}
