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

    const today = getStartOfToday()
    const tracking = progress.weightSkipTracking || { consecutiveSkips: 0 }

    // Calculate days since last weight entry and get last weight
    let daysSinceLastEntry = 999
    let lastWeight: number | null = null
    if (progress.weightHistory && progress.weightHistory.length > 0) {
      const sortedHistory = [...progress.weightHistory].sort((a: { date: Date }, b: { date: Date }) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const lastEntryDate = new Date(sortedHistory[0].date)
      lastEntryDate.setHours(0, 0, 0, 0)
      daysSinceLastEntry = Math.floor((today.getTime() - lastEntryDate.getTime()) / (1000 * 60 * 60 * 24))
      lastWeight = (sortedHistory[0] as { date: Date; weight: number }).weight
    }

    // Check if we already prompted today
    if (tracking.lastPromptDate) {
      const lastPrompt = new Date(tracking.lastPromptDate)
      lastPrompt.setHours(0, 0, 0, 0)
      if (lastPrompt.getTime() === today.getTime()) {
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

    // Check if weight was logged today
    const todaysWeight = progress.weightHistory?.find((entry: { date: Date }) => {
      const entryDate = new Date(entry.date)
      entryDate.setHours(0, 0, 0, 0)
      return entryDate.getTime() === today.getTime()
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
      const lastPrompt = new Date(tracking.lastPromptDate)
      lastPrompt.setHours(0, 0, 0, 0)
      const daysSinceLastPrompt = Math.floor((today.getTime() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysSinceLastPrompt >= 1) {
        consecutiveSkips = (tracking.consecutiveSkips || 0) + daysSinceLastPrompt
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

    const today = getStartOfToday()

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
        
        // Check if there's already a weight entry for today
        const existingIndex = progress.weightHistory?.findIndex((entry: { date: Date }) => {
          const entryDate = new Date(entry.date)
          entryDate.setHours(0, 0, 0, 0)
          return entryDate.getTime() === today.getTime()
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving weight:', error)
    return NextResponse.json({ error: 'Failed to save weight' }, { status: 500 })
  }
}
