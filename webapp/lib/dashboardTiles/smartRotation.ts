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

/* -------------------------------------------------------------------------- */
/* Adaptive engagement                                                        */
/* -------------------------------------------------------------------------- */

/** One key's tap history. `key` is `stat:<id>` / `metric:<id>`. */
export interface TileEngagement {
  key: string
  taps: number
  lastTapAt?: string | Date | null
}

// Tuning: a card the user keeps opening should lead, but never to the point of
// fully burying everything else (gentle nudge). Taps decay over ~45 days so the
// tile keeps adapting as habits change.
const ENGAGEMENT_MAX_BOOST = 0.5 // up to +50% relative score
const ENGAGEMENT_TAPS_FOR_HALF = 4 // ~4 recent taps → half of max boost
const ENGAGEMENT_DECAY_DAYS = 45
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Multiplicative score boost in [1 .. 1+ENGAGEMENT_MAX_BOOST] for a card's tap
 * history. Saturating (diminishing returns) so a single heavily-tapped card
 * can't dominate forever, and recency-decayed so stale taps fade. Pure +
 * deterministic given `now`.
 */
export function engagementBoost(
  eng: TileEngagement | undefined,
  now: Date,
): number {
  if (!eng || !eng.taps || eng.taps <= 0) return 1
  let effectiveTaps = eng.taps
  if (eng.lastTapAt) {
    const last = eng.lastTapAt instanceof Date ? eng.lastTapAt : new Date(eng.lastTapAt)
    const ageDays = Math.max(0, (now.getTime() - last.getTime()) / MS_PER_DAY)
    // Linear decay to zero influence by ENGAGEMENT_DECAY_DAYS.
    const decay = Math.max(0, 1 - ageDays / ENGAGEMENT_DECAY_DAYS)
    effectiveTaps = eng.taps * decay
  }
  if (effectiveTaps <= 0) return 1
  // Saturating curve: taps/(taps+k) → [0..1), scaled to MAX_BOOST.
  const frac = effectiveTaps / (effectiveTaps + ENGAGEMENT_TAPS_FOR_HALF)
  return 1 + ENGAGEMENT_MAX_BOOST * frac
}

/** Index engagement rows by key for O(1) lookup. */
export function indexEngagement(rows: TileEngagement[] | undefined): Map<string, TileEngagement> {
  const m = new Map<string, TileEngagement>()
  for (const r of rows ?? []) {
    if (r && typeof r.key === 'string') m.set(r.key, r)
  }
  return m
}

export interface RankedKeyInput {
  /** Stat tile ids available to rotate (already pinned ones excluded). */
  statIds: StatTileId[]
  /** Metric ids in relevance order (already pinned ones excluded). */
  metricIds: string[]
  ctx: DashboardTileContext
  /** Per-key tap history (adaptive boost). Omit for the non-adaptive baseline. */
  engagement?: TileEngagement[]
  /** Injected for testability; defaults to `new Date()` at call sites that have one. */
  now?: Date
}

/**
 * Produce the rotation order as a list of item keys (`stat:<id>` / `metric:<id>`)
 * sorted by relevance, descending. Base score = actionability (stats) or
 * incoming rank (metrics); then multiplied by an adaptive engagement boost so
 * cards the user actually opens drift toward the front over time. A genuinely
 * actionable stat can still lead, and the boost is bounded (gentle nudge) so no
 * card is ever fully buried. Deterministic for fixed inputs + `now`.
 */
export function rankedRotationKeys({ statIds, metricIds, ctx, engagement, now }: RankedKeyInput): string[] {
  const at = now ?? new Date(0) // callers pass a real `now`; epoch keeps it pure if omitted
  const engById = indexEngagement(engagement)
  const boost = (key: string) => engagementBoost(engById.get(key), at)

  const scored: Array<{ key: string; score: number; tie: number }> = []

  for (let i = 0; i < statIds.length; i++) {
    const key = `stat:${statIds[i]}`
    scored.push({ key, score: scoreStatTile(statIds[i], ctx) * boost(key), tie: i })
  }
  // Metric rank → score band [0.30 .. ~0.62]; index 0 highest.
  for (let i = 0; i < metricIds.length; i++) {
    const key = `metric:${metricIds[i]}`
    const base = Math.max(0.3, 0.62 - i * 0.04)
    scored.push({ key, score: base * boost(key), tie: 1000 + i })
  }

  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie))
  return scored.map((s) => s.key)
}
