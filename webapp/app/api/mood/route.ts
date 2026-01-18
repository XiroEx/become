import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'

// Helper to get start of today
function getStartOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

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

    // Check if there's a mood entry for today
    const today = getStartOfToday()
    
    const todaysMood = progress.moodHistory.find((entry: { date: Date; mood: number }) => {
      const entryDate = new Date(entry.date)
      entryDate.setHours(0, 0, 0, 0)
      return entryDate.getTime() === today.getTime()
    })

    // Calculate days since last entry
    let daysSinceLastEntry = 0
    if (progress.moodHistory.length > 0) {
      const sortedHistory = [...progress.moodHistory].sort((a: { date: Date }, b: { date: Date }) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const lastEntryDate = new Date(sortedHistory[0].date)
      lastEntryDate.setHours(0, 0, 0, 0)
      daysSinceLastEntry = Math.floor((today.getTime() - lastEntryDate.getTime()) / (1000 * 60 * 60 * 24))
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

    const today = getStartOfToday()
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
      // Check if there's already a mood entry for today
      const existingIndex = progress.moodHistory?.findIndex((entry: { date: Date }) => {
        const entryDate = new Date(entry.date)
        entryDate.setHours(0, 0, 0, 0)
        return entryDate.getTime() === today.getTime()
      }) ?? -1

      let previousMood: 1 | 2 | 3 | null = null

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

    return NextResponse.json({ success: true, mood })
  } catch (error) {
    console.error('Error saving mood:', error)
    return NextResponse.json({ error: 'Failed to save mood' }, { status: 500 })
  }
}
