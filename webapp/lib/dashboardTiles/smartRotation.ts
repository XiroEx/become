// Smart-rotation ordering for the dashboard smart tile.
//
// Pure + node-safe (no React/DOM). Decides the ORDER cards rotate through so
// the smart tile leads with what's most worth the user's attention right now,
// instead of a fixed linear cycle. Two inputs:
//   - stat actionability: scored here from live dashboard context (e.g. mood
//     not logged today, weight gone stale, streak at risk, behind weekly goal).
//   - metric relevance: the /api/dashboard/tiles API already returns metrics in
//     rotator-scored order, so their array index IS their rank.
//
// Multiple smart tiles stagger via a startIndex offset (see SmartRotatingTile)
// so two side-by-side tiles never show the same card.

import type { DashboardTileContext } from '@/lib/dashboardTiles'
import type { StatTileId } from '@/lib/dashboardLayout/defaults'

/** Actionability score for a stat tile in [0..1]; higher = surface sooner. */
export function scoreStatTile(id: StatTileId, ctx: DashboardTileContext): number {
  const { data, streakData, nutritionData, weeklyAvailability, todaysMood } = ctx
  switch (id) {
    case 'mood':
      // Nudge hardest when today's mood isn't logged yet.
      return todaysMood == null ? 0.95 : 0.35
    case 'weight': {
      const entries = data.weightData
      if (entries.length === 0) return 0.9 // never logged — prompt first weigh-in
      // Stale weigh-ins climb in priority (rough: based on count as a proxy for
      // cadence isn't reliable, so treat "has data" as moderate and let mood/
      // streak lead). Kept simple + deterministic.
      return 0.45
    }
    case 'streak': {
      const days = streakData?.streakDays ?? data.stats.streakDays ?? 0
      if (days > 0 && streakData && !streakData.activityToday) return 0.9 // at risk today
      if (days === 0) return 0.55 // encourage starting one
      return 0.4
    }
    case 'weekly': {
      const done = data.stats.thisWeekWorkouts
      const goal = weeklyAvailability > 0 ? weeklyAvailability : 0
      if (goal > 0 && done < goal) return 0.6 // behind pace
      return 0.4
    }
    case 'calories': {
      const cal = nutritionData?.calories
      if (!cal || !cal.goal) return 0.3
      return cal.consumed > cal.goal ? 0.7 : 0.5 // over budget is worth flagging
    }
    case 'water': {
      const w = nutritionData?.water
      if (!w || !w.goal) return 0.3
      return w.current < w.goal ? 0.5 : 0.35
    }
    case 'goal':
      return 0.4
    case 'workouts':
      return 0.3
    default:
      return 0.35
  }
}

export interface RankedKeyInput {
  /** Stat tile ids available to rotate (already pinned ones excluded). */
  statIds: StatTileId[]
  /** Metric ids in relevance order (already pinned ones excluded). */
  metricIds: string[]
  ctx: DashboardTileContext
}

/**
 * Produce the rotation order as a list of item keys (`stat:<id>` / `metric:<id>`)
 * sorted by relevance, descending. Stats are scored by actionability; metrics
 * are scored from their incoming rank (top metric ~0.62 decaying), so a
 * genuinely actionable stat can lead but metrics keep their relative order.
 * Deterministic for fixed inputs.
 */
export function rankedRotationKeys({ statIds, metricIds, ctx }: RankedKeyInput): string[] {
  const scored: Array<{ key: string; score: number; tie: number }> = []

  for (let i = 0; i < statIds.length; i++) {
    scored.push({ key: `stat:${statIds[i]}`, score: scoreStatTile(statIds[i], ctx), tie: i })
  }
  // Metric rank → score band [0.30 .. ~0.62]; index 0 highest.
  for (let i = 0; i < metricIds.length; i++) {
    const score = Math.max(0.3, 0.62 - i * 0.04)
    scored.push({ key: `metric:${metricIds[i]}`, score, tie: 1000 + i })
  }

  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie))
  return scored.map((s) => s.key)
}
