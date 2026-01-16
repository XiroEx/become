import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { getTokenFromRequest, verifyToken } from '../../../../lib/auth'

// Constants for reminder thresholds
const REMINDER_THRESHOLDS = {
  GENTLE: 3,      // Day 3
  REMINDER: 7,    // Day 7
  STRONG: 12,     // Day 12
  MANDATORY: 14   // Day 14+
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

export async function GET(req: Request) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })

    const payload = verifyToken(token)
    await dbConnect()
    
    const user = await User.findById(payload.userId).select('lastWeightPrompt consecutiveSkips weightEntries')
    if (!user) return new Response(JSON.stringify({ message: 'User not found' }), { status: 404 })

    const now = new Date()
    const lastPrompt = user.lastWeightPrompt ? new Date(user.lastWeightPrompt) : null
    const consecutiveSkips = user.consecutiveSkips || 0
    
    // Check if we should show the prompt today
    let shouldPrompt = false
    let isMandatory = false
    let reminderLevel = 0 // 0 = none, 1 = gentle (day 3), 2 = reminder (day 7), 3 = strong (day 12), 4 = mandatory (day 14+)
    
    if (!lastPrompt) {
      // Never prompted before
      shouldPrompt = true
    } else {
      // Check if it's been at least 1 day since last prompt
      const daysSinceLastPrompt = Math.floor((now.getTime() - lastPrompt.getTime()) / MS_PER_DAY)
      
      if (daysSinceLastPrompt >= 1) {
        shouldPrompt = true
        
        // Determine reminder level based on consecutive skips
        if (consecutiveSkips >= REMINDER_THRESHOLDS.MANDATORY) {
          reminderLevel = 4
          isMandatory = true
        } else if (consecutiveSkips >= REMINDER_THRESHOLDS.STRONG) {
          reminderLevel = 3
        } else if (consecutiveSkips >= REMINDER_THRESHOLDS.REMINDER) {
          reminderLevel = 2
        } else if (consecutiveSkips >= REMINDER_THRESHOLDS.GENTLE) {
          reminderLevel = 1
        }
      }
    }

    return new Response(JSON.stringify({ 
      shouldPrompt,
      isMandatory,
      reminderLevel,
      consecutiveSkips,
      lastPrompt,
      totalEntries: user.weightEntries?.length || 0
    }), { status: 200 })
  } catch (err: any) {
    console.error('GET prompt-status error', err)
    return new Response(JSON.stringify({ message: err.message || 'Server error' }), { status: 500 })
  }
}
