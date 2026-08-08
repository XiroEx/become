import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Exercise from '@/models/Exercise'
import { verifyAuth } from '@/lib/auth'
import { mapPlannedLog, type RawLog } from '@/lib/quickSession/planned'
import type { TrackingType } from '@/models/Exercise'

// GET /api/workouts/planned — upcoming PLANNED quick sessions: future-dated,
// incomplete, kind:'quick' workout logs. Returns each with a reconstructed
// DraftSession-shaped exercise list so the client can stash + start it (under
// the same sessionId, so finishing it consumes the plan).

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const up = await UserProgress.findOne({ userId: auth.userId })
      .select('workoutLogs')
      .lean<{ workoutLogs?: RawLog[] } | null>()

    const logs = up?.workoutLogs ?? []
    const slugs = [...new Set(
      logs
        .filter((log) => log.kind === 'quick' && !log.completed && !!log.sessionId && new Date(log.date).getTime() > Date.now())
        .flatMap((log) => (log.exercises ?? []).map((exercise) => exercise.exerciseSlug).filter((slug): slug is string => Boolean(slug))),
    )]
    const catalogExercises = slugs.length > 0
      ? await Exercise.find({ slug: { $in: slugs } })
          .select('slug trackingType')
          .lean<{ slug: string; trackingType: TrackingType }[]>()
      : []
    const trackingTypesBySlug = new Map(
      catalogExercises.map((exercise) => [exercise.slug, exercise.trackingType]),
    )

    const now = Date.now()
    const planned = logs
      .filter((log) => log.kind === 'quick' && !log.completed && !!log.sessionId && new Date(log.date).getTime() > now)
      .map((log) => mapPlannedLog(log, trackingTypesBySlug))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return NextResponse.json({ planned })
  } catch (error) {
    console.error('Error fetching planned sessions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
