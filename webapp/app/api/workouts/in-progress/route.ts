import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { readTzOffset, localDateKey, localDayWindowForKey } from '@/lib/dayWindow'

/**
 * The workout the member is in the middle of RIGHT NOW, if any.
 *
 * The dashboard's "get back into the workout" pill used to derive this from the
 * program enrolment: read /api/programs/active, take the first in-progress
 * program, then ask /api/workouts for that program's `currentDay`. Two ways that
 * misses a workout that is genuinely open:
 *
 *   1. NO ACTIVE ENROLMENT. A member can have an open workout log for a program
 *      they are not currently enrolled in — abandoned enrolment, a program
 *      started from the library, a log written before the enrolment was cleared.
 *      The old path bailed at step one and never looked at the log at all. This
 *      is what was reported: an open "Day 1" log for program_jon_don_split with
 *      an empty activePrograms array, and no pill.
 *   2. WRONG DAY. It queried the enrolment's `currentDay`, so a workout started
 *      for any other day was invisible even with a healthy enrolment.
 *
 * The open LOG is the source of truth for "you are mid-workout", so this asks it
 * directly. Scoped to the member's local day, because a log left open from last
 * week is stale, not resumable.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const progress = await UserProgress.findOne({ userId: auth.userId })
      .select('workoutLogs')
      .lean<{ workoutLogs?: Array<Record<string, unknown>> } | null>()

    const logs = progress?.workoutLogs ?? []
    if (logs.length === 0) return NextResponse.json({ workout: null })

    const tz = readTzOffset(request.nextUrl.searchParams)
    const { start, end } = localDayWindowForKey(localDateKey(null, tz), tz)

    // Newest first: if a member somehow has two open logs today, the one they
    // are actually in is the one they started last.
    const open = logs
      .filter((w) => {
        if (w.completed) return false
        const at = new Date(w.date as string)
        return at >= start && at < end
      })
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())[0]

    if (!open) return NextResponse.json({ workout: null })

    return NextResponse.json({
      workout: {
        programId: open.programId ? String(open.programId) : null,
        day: open.day ? String(open.day) : null,
        phase: typeof open.phase === 'number' ? open.phase : null,
        startedAt: open.date,
      },
    })
  } catch (error) {
    console.error('GET /api/workouts/in-progress error:', error)
    return NextResponse.json({ error: 'Failed to load workout' }, { status: 500 })
  }
}
