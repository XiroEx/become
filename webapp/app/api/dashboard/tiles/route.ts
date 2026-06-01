// GET /api/dashboard/tiles
//
// Returns the rotator-picked dashboard tiles for the authenticated user.
// Mixes metric tiles (LineTile/BarTile/Number/Heatmap/MuscleMap) and
// suggestion cards into a single ordered list, with pinned IDs first.
//
// Side effects: persists tileLastShownAt for the IDs we returned, so the
// rotator's recencySinceLastShown calculation decays correctly on the
// next request.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { ensureWorkoutMetricsRegistered } from '@/lib/metrics/workout'
import { resolveMetric } from '@/lib/metrics/registry'
import { ensureWorkoutSuggestionsRegistered } from '@/lib/suggestions/workout'
import { runSuggestions } from '@/lib/suggestions/engine'
import {
  buildRotatorInputFromProgress,
  recentActivityFromProgress,
  updateLastShown,
} from '@/lib/dashboardTiles/buildRotatorInput'
import { pickTopNTiles, candidateId } from '@/lib/dashboardTiles/rotator'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  ensureWorkoutMetricsRegistered()
  ensureWorkoutSuggestionsRegistered()

  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = auth.userId

  await dbConnect()

  const [progress, user] = await Promise.all([
    UserProgress.findOne({ userId }),
    User.findById(userId).select('profile').lean<{
      profile?: { primaryGoal?: string }
    }>(),
  ])

  const now = new Date()
  const recentActivity = recentActivityFromProgress(progress, now)
  const suggestions = await runSuggestions(userId, recentActivity, {
    now,
    dismissed: progress?.dismissedSuggestions ?? [],
  })

  const input = buildRotatorInputFromProgress(
    progress,
    suggestions,
    user?.profile?.primaryGoal,
    now,
  )
  const picked = pickTopNTiles(input)
  const servedIds = picked.map(candidateId)
  const metricSummaries = await Promise.all(
    picked
      .filter((tile) => tile.kind === 'metric')
      .map(async (tile) => {
        if (tile.kind !== 'metric') return null
        const metric = resolveMetric(tile.tileId)
        if (!metric) return null
        try {
          const data = await metric.compute(userId, {
            start: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
            end: now,
          })
          const latest = data[data.length - 1] ?? null
          return {
            id: metric.id,
            label: metric.label,
            unit: metric.unit,
            domain: metric.domain,
            trendDirection: metric.trendDirection,
            latest,
            data,
          }
        } catch (error) {
          return {
            id: metric.id,
            label: metric.label,
            unit: metric.unit,
            domain: metric.domain,
            trendDirection: metric.trendDirection,
            latest: null,
            data: [],
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
  )

  // Persist tileLastShownAt for served ids. We only write when there's
  // actually something to record.
  if (progress && servedIds.length > 0) {
    progress.tileLastShownAt = updateLastShown(
      progress.tileLastShownAt,
      servedIds,
      now,
    )
    await progress.save()
  }

  return NextResponse.json({
    tiles: picked,
    metrics: metricSummaries.filter((metric) => metric !== null),
    suggestions,
    // Adaptive smart-tile signal: per-key tap history drives the relevance boost.
    engagement: (progress?.tileEngagement ?? []).map((e: { key: string; taps: number; lastTapAt?: Date | null }) => ({
      key: e.key,
      taps: e.taps,
      lastTapAt: e.lastTapAt ?? null,
    })),
    now: now.toISOString(),
  })
}
