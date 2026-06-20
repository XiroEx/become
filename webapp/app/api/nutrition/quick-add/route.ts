import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import DayNutrition from '@/models/DayNutrition'
import NutritionGoal from '@/models/NutritionGoal'
import { verifyAuth } from '@/lib/auth'
import {
  readTzOffsetFromBody,
  localDateKey,
  utcMidnightDateKey,
} from '@/lib/dayWindow'

// POST: Quick add raw macros
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { calories, protein, carbs, fats, note, date: dateStr } = body
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (calories === undefined || typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0) {
      return NextResponse.json({ error: 'calories must be a non-negative finite number' }, { status: 400 })
    }
    for (const [k, v] of Object.entries({ protein, carbs, fats }) as [string, unknown][]) {
      if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
        return NextResponse.json({ error: `${k} must be a non-negative finite number` }, { status: 400 })
      }
    }

    await dbConnect()

    // Row key: UTC midnight of the LOCAL day's YYYY-MM-DD — matches the
    // nutrition/log read path so quick-adds land in the same row as meals.
    const date = utcMidnightDateKey(localDateKey(dateStr, tzOffsetMinutes))

    const quickAddEntry = {
      id: crypto.randomUUID(),
      calories,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fats: fats ?? 0,
      note: note || undefined,
      loggedAt: new Date()
    }

    // Find or create the day's row
    let log = await DayNutrition.findOne({ userId: authResult.userId, date })

    if (!log) {
      const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()
      log = new DayNutrition({
        userId: authResult.userId,
        date,
        water: { current: 0, goal: goals?.waterGoal ?? 96 },
        quickAdds: [],
      })
    }

    log.quickAdds.push(quickAddEntry)
    // Daily totals are computed at read time (/api/nutrition/log) from MealLog
    // + quickAdds — nothing to recalc on this row.
    await log.save()

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error adding quick add:', error)
    return NextResponse.json({ error: 'Failed to add quick add' }, { status: 500 })
  }
}

// DELETE: Remove a quick add entry
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { quickAddId, date: dateStr } = body
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (!quickAddId) {
      return NextResponse.json({ error: 'Missing required field: quickAddId' }, { status: 400 })
    }

    await dbConnect()

    const date = utcMidnightDateKey(localDateKey(dateStr, tzOffsetMinutes))
    const log = await DayNutrition.findOne({ userId: authResult.userId, date })

    if (!log) {
      return NextResponse.json({ error: 'No nutrition log found for this date' }, { status: 404 })
    }

    const idx = log.quickAdds.findIndex((qa: { id: string }) => qa.id === quickAddId)
    if (idx === -1) {
      return NextResponse.json({ error: 'Quick add entry not found' }, { status: 404 })
    }

    log.quickAdds.splice(idx, 1)
    await log.save()

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error deleting quick add:', error)
    return NextResponse.json({ error: 'Failed to delete quick add' }, { status: 500 })
  }
}
