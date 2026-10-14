import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { STREAK_MILESTONES, isStreakAlive } from '@/lib/streak'
import { readTzOffset, localDateKey, isEntryOnDay } from '@/lib/dayWindow'

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress) {
      return NextResponse.json({
        streakDays: 0,
        longestStreak: 0,
        streakFreezes: 1,
        milestonesReached: [],
        activityToday: false,
        nextMilestone: STREAK_MILESTONES[0],
      })
    }

    const tzOffset = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tzOffset)

    const activityToday = progress.lastActivityDate
      ? isEntryOnDay(progress.lastActivityDate, todayKey, tzOffset)
      : false

    // "Today" in the CALLER's local day, shifted the same way localDateKey
    // does — so a member west or east of the server doesn't have their
    // streak read as dead (or alive) a calendar day early or late.
    const callerToday = new Date(Date.now() - tzOffset * 60_000)
    const alive = isStreakAlive(
      { lastActivityDate: progress.lastActivityDate, streakFreezes: progress.streakFreezes ?? 1 },
      callerToday
    )

    // The stored number is only a truthful claim while the next log would
    // still extend (or freeze-save) it. Once a lapse would reset it, this
    // read path reports 0 — WITHOUT writing anything back; the reset itself
    // only happens for real inside recordStreakActivity on the next log.
    const storedStreakDays = progress.streakDays ?? 0
    const streakDays = alive ? storedStreakDays : 0
    const milestonesReached: number[] = progress.milestonesReached ?? []
    const nextMilestone = STREAK_MILESTONES.find((m) => m > streakDays) ?? null

    return NextResponse.json({
      streakDays,
      // Falls back to the raw stored count, not the (possibly zeroed-for-
      // display) `streakDays` above — a lapsed streak's best-ever run didn't
      // just become 0 along with its current one.
      longestStreak: progress.longestStreak ?? storedStreakDays,
      streakFreezes: progress.streakFreezes ?? 1,
      milestonesReached,
      activityToday,
      nextMilestone,
      lastActivityDate: progress.lastActivityDate ?? null,
    })
  } catch (error) {
    console.error('Error fetching streak:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
