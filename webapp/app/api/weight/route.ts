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

// Check if weight should be prompted and return skip info
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      // For unauthenticated users, don't prompt
      return NextResponse.json({
        needsWeightCheck: false,
        consecutiveSkips: 0,
        isMandatory: false,
        daysSinceLastEntry: 0
      })
    }

    await dbConnect()

    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress) {
      return NextResponse.json({
        needsWeightCheck: true,
        consecutiveSkips: 0,
        isMandatory: false,
        daysSinceLastEntry: 999
      })
    }

    const tzOffset = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tzOffset)
    const { start, end } = localDayWindowForKey(todayKey, tzOffset)
    const tracking = progress.weightSkipTracking || { consecutiveSkips: 0 }

    // Calculate days since last weight entry and get last weight
    let daysSinceLastEntry = 999
    let lastWeight: number | null = null
    if (progress.weightHistory && progress.weightHistory.length > 0) {
      const sortedHistory = [...progress.weightHistory].sort((a: { date: Date }, b: { date: Date }) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const lastEntryKey = dateKey(new Date(sortedHistory[0].date), tzOffset)
      const lastMs = new Date(lastEntryKey + 'T00:00:00.000Z').getTime()
      const todayMs = new Date(todayKey + 'T00:00:00.000Z').getTime()
      daysSinceLastEntry = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24))
      lastWeight = (sortedHistory[0] as { date: Date; weight: number }).weight
    }

    // Check if we already prompted today (using local-day window)
    if (tracking.lastPromptDate) {
      const lastPromptKey = dateKey(new Date(tracking.lastPromptDate), tzOffset)
      if (lastPromptKey === todayKey) {
        // Already prompted today, don't show again
        return NextResponse.json({
          needsWeightCheck: false,
          consecutiveSkips: tracking.consecutiveSkips || 0,
          isMandatory: false,
          daysSinceLastEntry,
          lastWeight
        })
      }
    }

    // Check if weight was logged today (using local-day window)
    const todaysWeight = progress.weightHistory?.find((entry: { date: Date }) => {
      const t = new Date(entry.date).getTime()
      return t >= start.getTime() && t <= end.getTime()
    })

    if (todaysWeight) {
      return NextResponse.json({
        needsWeightCheck: false,
        consecutiveSkips: 0,
        isMandatory: false,
        daysSinceLastEntry: 0,
        lastWeight
      })
    }

    // Calculate consecutive skips
    let consecutiveSkips = tracking.consecutiveSkips || 0

    // Increment if we haven't prompted today and there's no weight entry
    if (tracking.lastPromptDate) {
      const lastPromptKey = dateKey(new Date(tracking.lastPromptDate), tzOffset)
      const lastMs = new Date(lastPromptKey + 'T00:00:00.000Z').getTime()
      const todayMs = new Date(todayKey + 'T00:00:00.000Z').getTime()
      const daysSinceLastPrompt = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24))

      if (daysSinceLastPrompt >= 1) {
        consecutiveSkips = (tracking.consecutiveSkips || 0) + 1
      }
    }

    // Check if it's mandatory (14 days = 2 weeks)
    const isMandatory = consecutiveSkips >= 14

    // Check if we should show reminder (days 3, 7, 12, or mandatory)
    const shouldShowReminder = consecutiveSkips === 3 || consecutiveSkips === 7 || consecutiveSkips === 12 || isMandatory

    return NextResponse.json({
      needsWeightCheck: true, // Prompt daily if not already prompted today and no weight logged
      consecutiveSkips,
      isMandatory,
      showReminder: shouldShowReminder,
      daysSinceLastEntry,
      lastWeight
    })
  } catch (error) {
    console.error('Error checking weight:', error)
    return NextResponse.json({
      needsWeightCheck: false,
      consecutiveSkips: 0,
      isMandatory: false,
      daysSinceLastEntry: 0
    })
  }
}

// Log weight or skip
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { weight, skip } = body

    await dbConnect()

    const tzOffset = readTzOffsetFromBody(body)
    const todayKey = localDateKey(null, tzOffset)
    const today = utcMidnightDateKey(todayKey)
    const { start, end } = localDayWindowForKey(todayKey, tzOffset)

    // Find or create user progress
    let progress = await UserProgress.findOne({ userId: authResult.userId })

    if (!progress) {
      // Create new progress record
      progress = await UserProgress.create({
        userId: authResult.userId,
        weightHistory: weight ? [{ date: today, weight }] : [],
        weightSkipTracking: {
          lastPromptDate: today,
          lastWeightDate: weight ? today : undefined,
          consecutiveSkips: skip ? 1 : 0
        }
      })
    } else {
      // Initialize weightSkipTracking if it doesn't exist
      if (!progress.weightSkipTracking) {
        progress.weightSkipTracking = {
          consecutiveSkips: 0
        }
      }

      if (skip) {
        // User skipped - increment counter and update last prompt date
        progress.weightSkipTracking.consecutiveSkips = (progress.weightSkipTracking.consecutiveSkips || 0) + 1
        progress.weightSkipTracking.lastPromptDate = today
      } else if (weight) {
        // User logged weight

        // Check if there's already a weight entry for today (using local-day window)
        const existingIndex = progress.weightHistory?.findIndex((entry: { date: Date }) => {
          const t = new Date(entry.date).getTime()
          return t >= start.getTime() && t <= end.getTime()
        }) ?? -1

        if (existingIndex >= 0) {
          // Update existing entry
          progress.weightHistory[existingIndex].weight = weight
        } else {
          // Add new entry
          if (!progress.weightHistory) {
            progress.weightHistory = []
          }
          progress.weightHistory.push({ date: today, weight })
        }

        // Reset skip tracking
        progress.weightSkipTracking.consecutiveSkips = 0
        progress.weightSkipTracking.lastPromptDate = today
        progress.weightSkipTracking.lastWeightDate = today
      }

      await progress.save()
    }

    // Record streak activity when weight is actually logged (not skipped)
    let streakResult = null
    if (!skip && weight) {
      streakResult = await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)
    }

    return NextResponse.json({
      success: true,
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
    })
  } catch (error) {
    console.error('Error saving weight:', error)
    return NextResponse.json({ error: 'Failed to save weight' }, { status: 500 })
  }
}
