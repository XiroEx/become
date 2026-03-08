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

// POST: Quick add raw macros
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { calories, protein, carbs, fats, note, date: dateStr } = body

    if (calories === undefined || typeof calories !== 'number') {
      return NextResponse.json({ error: 'Missing required field: calories (number)' }, { status: 400 })
    }

    await dbConnect()

    const date = getDateStart(dateStr)

    const quickAddEntry = {
      id: crypto.randomUUID(),
      calories,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fats: fats ?? 0,
      note: note || undefined,
      loggedAt: new Date()
    }

    // Find or create the day's log
    let log = await NutritionLog.findOne({ userId: authResult.userId, date })

    if (!log) {
      const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()
      log = new NutritionLog({
        userId: authResult.userId,
        date,
        meals: [],
        water: { current: 0, goal: goals?.waterGoal ?? 96 },
        quickAdds: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
      })
    }

    log.quickAdds.push(quickAddEntry)

    // Recalculate daily totals
    log.recalculateTotals()
    await log.save()

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error adding quick add:', error)
    return NextResponse.json({ error: 'Failed to add quick add' }, { status: 500 })
  }
}
