import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import NutritionGoal from '@/models/NutritionGoal'
import { verifyAuth } from '@/lib/auth'

function getDateStart(dateStr?: string | null): Date {
  const d = dateStr ? new Date(dateStr + 'T00:00:00.000Z') : new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// POST: Log water (increment)
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, date: dateStr } = body

    if (amount === undefined || typeof amount !== 'number') {
      return NextResponse.json({ error: 'Missing required field: amount (number)' }, { status: 400 })
    }

    await dbConnect()

    const date = getDateStart(dateStr)

    // Try to increment on existing log
    let log = await NutritionLog.findOneAndUpdate(
      { userId: authResult.userId, date },
      { $inc: { 'water.current': amount } },
      { new: true }
    )

    if (!log) {
      // Create new log for this day
      const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()
      log = await NutritionLog.create({
        userId: authResult.userId,
        date,
        meals: [],
        water: { current: amount, goal: goals?.waterGoal ?? 96 },
        quickAdds: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
      })
    }

    return NextResponse.json({ success: true, water: log.water })
  } catch (error) {
    console.error('Error logging water:', error)
    return NextResponse.json({ error: 'Failed to log water' }, { status: 500 })
  }
}

// PUT: Set water amount directly
export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, date: dateStr } = body

    if (amount === undefined || typeof amount !== 'number') {
      return NextResponse.json({ error: 'Missing required field: amount (number)' }, { status: 400 })
    }

    await dbConnect()

    const date = getDateStart(dateStr)

    // Try to set on existing log
    let log = await NutritionLog.findOneAndUpdate(
      { userId: authResult.userId, date },
      { $set: { 'water.current': amount } },
      { new: true }
    )

    if (!log) {
      // Create new log for this day
      const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()
      log = await NutritionLog.create({
        userId: authResult.userId,
        date,
        meals: [],
        water: { current: amount, goal: goals?.waterGoal ?? 96 },
        quickAdds: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
      })
    }

    return NextResponse.json({ success: true, water: log.water })
  } catch (error) {
    console.error('Error setting water:', error)
    return NextResponse.json({ error: 'Failed to set water' }, { status: 500 })
  }
}
