// GET /api/workouts/exercise-suggestions?slugs=a,b,c
//
// Contextual, exercise-scoped suggestions for a workout session. The live
// workout fetches this once with the session's exercise slugs and shows each
// suggestion AT the exercise it belongs to — the right place for "add weight
// to lat pulldown", instead of the dashboard.
//
// Two layers, deduped by suggestion id (the precise one wins):
//  1. The precise double-progression source (per-set data → exact "+5 lb").
//  2. The coarse engine sources marked placement:'exercise' (progression
//     nudge / plateau warning), matched to the requested slugs.
// Dismissals + cooldowns apply exactly like the dashboard engine.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { ensureWorkoutSuggestionsRegistered } from '@/lib/suggestions/workout'
import { progressionNudgeSource } from '@/lib/suggestions/workout/progressionNudge'
import { runSuggestions, isDismissed } from '@/lib/suggestions/engine'
import { recentActivityFromProgress } from '@/lib/dashboardTiles/buildRotatorInput'
import type { Suggestion } from '@/lib/suggestions/types'

const MAX_SLUGS = 20

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  ensureWorkoutSuggestionsRegistered()

  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = auth.userId

  const raw = new URL(request.url).searchParams.get('slugs') ?? ''
  const slugs = Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, MAX_SLUGS)
  if (slugs.length === 0) return NextResponse.json({ suggestions: [] })
  const slugSet = new Set(slugs)

  await dbConnect()
  const progress = await UserProgress.findOne({ userId })
  const dismissed = progress?.dismissedSuggestions ?? []
  const now = new Date()

  const out: Suggestion[] = []
  const seen = new Set<string>()

  // 1. Precise per-exercise double-progression (exact suggested weight).
  const precise = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return await progressionNudgeSource.render({ userId, exerciseSlug: slug })
      } catch {
        return null
      }
    }),
  )
  for (const s of precise) {
    if (!s || seen.has(s.id) || isDismissed(s, dismissed, now)) continue
    seen.add(s.id)
    out.push(s)
  }

  // 2. Coarse engine sources scoped to an exercise in this session.
  const recentActivity = recentActivityFromProgress(progress, now)
  const engineSuggestions = await runSuggestions(userId, recentActivity, {
    now,
    dismissed,
  })
  for (const s of engineSuggestions) {
    if (s.placement !== 'exercise') continue
    const slug = String(s.sourceData?.exerciseSlug ?? '').toLowerCase()
    if (!slug || !slugSet.has(slug)) continue
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }

  return NextResponse.json({ suggestions: out })
}
