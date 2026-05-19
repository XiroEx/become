import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { STREAK_MILESTONES } from '@/lib/streak'
import { readTzOffset, localDateKey, dateKey } from '@/lib/dayWindow'

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

    const lastActivityKey = progress.lastActivityDate
      ? dateKey(new Date(progress.lastActivityDate), tzOffset)
      : null

    const activityToday = lastActivityKey === todayKey

    const streakDays = progress.streakDays ?? 0
    const milestonesReached: number[] = progress.milestonesReached ?? []
    const nextMilestone = STREAK_MILESTONES.find((m) => m > streakDays) ?? null

    return NextResponse.json({
      streakDays,
      longestStreak: progress.longestStreak ?? streakDays,
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
