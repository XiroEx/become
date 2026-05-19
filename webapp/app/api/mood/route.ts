import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
  dateKey,
} from '@/lib/dayWindow'

// Check if mood has been logged today and return today's mood
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      // For unauthenticated users, check localStorage on client side
      return NextResponse.json({ needsMoodCheck: true, todaysMood: null, daysSinceLastEntry: 0 })
    }

    await dbConnect()

    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress || !progress.moodHistory || progress.moodHistory.length === 0) {
      return NextResponse.json({ needsMoodCheck: true, todaysMood: null, daysSinceLastEntry: 999 })
    }

    const tzOffset = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tzOffset)
    const { start, end } = localDayWindowForKey(todayKey, tzOffset)

    const todaysMood = progress.moodHistory.find((entry: { date: Date; mood: number }) => {
      const t = new Date(entry.date).getTime()
      return t >= start.getTime() && t <= end.getTime()
    })

    // Calculate days since last entry using local date keys
    let daysSinceLastEntry = 0
    if (progress.moodHistory.length > 0) {
      const sortedHistory = [...progress.moodHistory].sort((a: { date: Date }, b: { date: Date }) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const lastEntryKey = dateKey(new Date(sortedHistory[0].date), tzOffset)
      // Count calendar days between lastEntryKey and todayKey
      const lastMs = new Date(lastEntryKey + 'T00:00:00.000Z').getTime()
      const todayMs = new Date(todayKey + 'T00:00:00.000Z').getTime()
      daysSinceLastEntry = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24))
    }

    return NextResponse.json({
      needsMoodCheck: !todaysMood,
      todaysMood: todaysMood?.mood || null,
      daysSinceLastEntry
    })
  } catch (error) {
    console.error('Error checking mood:', error)
    return NextResponse.json({ needsMoodCheck: true, todaysMood: null, daysSinceLastEntry: 0 })
  }
}

// Log mood for today (records change history)
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mood } = body

    if (!mood || ![1, 2, 3, 4, 5].includes(mood)) {
      return NextResponse.json({ error: 'Invalid mood value' }, { status: 400 })
    }

    await dbConnect()

    const tzOffset = readTzOffsetFromBody(body)
    const todayKey = localDateKey(null, tzOffset)
    const today = utcMidnightDateKey(todayKey)
    const { start, end } = localDayWindowForKey(todayKey, tzOffset)
    const now = new Date()

    // Find or create user progress
    let progress = await UserProgress.findOne({ userId: authResult.userId })

    if (!progress) {
      // Create new progress record with initial mood
      progress = await UserProgress.create({
        userId: authResult.userId,
        moodHistory: [{ date: today, mood }],
        moodChangeHistory: [{
          timestamp: now,
          date: today,
          previousMood: null,
          newMood: mood
        }]
      })
    } else {
      // Check if there's already a mood entry for today (using local-day window)
      const existingIndex = progress.moodHistory?.findIndex((entry: { date: Date }) => {
        const t = new Date(entry.date).getTime()
        return t >= start.getTime() && t <= end.getTime()
      }) ?? -1

      let previousMood: 1 | 2 | 3 | 4 | 5 | null = null

      if (existingIndex >= 0) {
        // Get previous mood before updating
        previousMood = progress.moodHistory[existingIndex].mood
        // Update existing entry
        progress.moodHistory[existingIndex].mood = mood
      } else {
        // Add new entry
        if (!progress.moodHistory) {
          progress.moodHistory = []
        }
        progress.moodHistory.push({ date: today, mood })
      }

      // Always record the change in history (even if mood is the same, for audit trail)
      if (!progress.moodChangeHistory) {
        progress.moodChangeHistory = []
      }
      progress.moodChangeHistory.push({
        timestamp: now,
        date: today,
        previousMood,
        newMood: mood
      })

      await progress.save()
    }

    const streakResult = await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)

    return NextResponse.json({
      success: true,
      mood,
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
    })
  } catch (error) {
    console.error('Error saving mood:', error)
    return NextResponse.json({ error: 'Failed to save mood' }, { status: 500 })
  }
}
