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
import { runSuggestions } from '@/lib/suggestions/engine'
import {
  buildRotatorInputFromProgress,
  recentActivityFromProgress,
  updateLastShown,
} from '@/lib/dashboardTiles/buildRotatorInput'
import { pickTopNTiles, candidateId } from '@/lib/dashboardTiles/rotator'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await dbConnect()

  const [progress, user] = await Promise.all([
    UserProgress.findOne({ userId: auth.userId }),
    User.findById(auth.userId).select('profile').lean<{
      profile?: { primaryGoal?: string }
    }>(),
  ])

  const now = new Date()
  const recentActivity = recentActivityFromProgress(progress, now)
  const suggestions = await runSuggestions(auth.userId, recentActivity, {
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
    now: now.toISOString(),
  })
}
