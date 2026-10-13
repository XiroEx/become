import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog, { IMealLog } from '@/models/MealLog'
import DayNutrition, { IDayNutrition } from '@/models/DayNutrition'
import { verifyAuth, AI_TOOL_SCOPES } from '@/lib/auth'
import {
  readTzOffset,
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
  dateKey as localDayLabel,
} from '@/lib/dayWindow'

// GET: Nutrition history/summary for charts.
//
// Totals are computed from MealLog (the canonical food log) plus quickAdds on
// DayNutrition — never from a stored dailyTotals mirror. This fixes the prior
// behavior where charts read NutritionLog.dailyTotals, which stopped being
// populated once food logging moved to MealLog (so calories/macros silently
// undercounted to just quick-adds).
export async function GET(request: NextRequest) {
  try {
    // Read-only, so the become-ai graph's short-lived ai-tools token may reach
    // it — this is the `become_get_nutrition` tool surface.
    const authResult = await verifyAuth(request, { allowScopes: AI_TOOL_SCOPES })
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'
    const dateStr = searchParams.get('date')
    const tzOffsetMinutes = readTzOffset(searchParams)

    // Build the list of LOCAL calendar-day labels (YYYY-MM-DD), oldest → newest.
    const endKey = localDateKey(dateStr, tzOffsetMinutes)
    const endMidnight = utcMidnightDateKey(endKey)
    const span = period === 'month' ? 30 : 7

    const ymd = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    const dayKeys: string[] = []
    for (let i = span - 1; i >= 0; i--) {
      dayKeys.push(ymd(new Date(endMidnight.getTime() - i * 86_400_000)))
    }
    const firstKey = dayKeys[0]
    const lastKey = dayKeys[dayKeys.length - 1]

    // Fetch the food logs across the whole local window, plus the day-level
    // water/quickAdds rows, then bucket both by local day.
    const { start } = localDayWindowForKey(firstKey, tzOffsetMinutes)
    const { end } = localDayWindowForKey(lastKey, tzOffsetMinutes)

    const [mealLogs, extrasRows] = await Promise.all([
      MealLog.find({
        user: authResult.userId,
        loggedAt: { $gte: start, $lte: end },
      }).lean<IMealLog[]>(),
      DayNutrition.find({
        userId: authResult.userId,
        date: { $gte: utcMidnightDateKey(firstKey), $lte: utcMidnightDateKey(lastKey) },
      }).lean<IDayNutrition[]>(),
    ])

    // Group MealLogs by the caller's local day.
    const logsByKey = new Map<string, IMealLog[]>()
    for (const log of mealLogs) {
      const key = localDayLabel(new Date(log.loggedAt), tzOffsetMinutes)
      const arr = logsByKey.get(key)
      if (arr) arr.push(log)
      else logsByKey.set(key, [log])
    }

    // Group day-extras by the row's UTC YYYY-MM-DD (== its local-day label).
    const extrasByKey = new Map<string, IDayNutrition>()
    for (const row of extrasRows) {
      extrasByKey.set(ymd(new Date(row.date)), row)
    }

    const days = dayKeys.map(dayStr => {
      const logs = logsByKey.get(dayStr) ?? []
      const extras = extrasByKey.get(dayStr)
      const quickAdds = extras?.quickAdds ?? []

      const t = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
      for (const log of logs) {
        const n = log.totalNutrition
        if (!n) continue
        t.calories += n.calories || 0
        t.protein  += n.protein  || 0
        t.carbs    += n.carbs    || 0
        t.fats     += n.fats     || 0
        t.fiber    += n.fiber    || 0
        t.sugar    += n.sugar    || 0
        t.sodium   += n.sodium   || 0
      }
      for (const qa of quickAdds) {
        t.calories += qa.calories || 0
        t.protein  += qa.protein  || 0
        t.carbs    += qa.carbs    || 0
        t.fats     += qa.fats     || 0
      }

      const water = extras?.water?.current ?? 0
      const hasData = logs.length > 0 || quickAdds.length > 0 || water > 0

      return {
        date: dayStr,
        calories: Math.round(t.calories),
        protein: Math.round(t.protein * 10) / 10,
        carbs: Math.round(t.carbs * 10) / 10,
        fats: Math.round(t.fats * 10) / 10,
        fiber: Math.round(t.fiber * 10) / 10,
        sugar: Math.round(t.sugar * 10) / 10,
        sodium: Math.round(t.sodium * 1000) / 1000,
        water,
        mealCount: logs.length,
        hasData,
      }
    })

    // Calculate averages (only from days with data)
    const daysWithData = days.filter(d => d.hasData)
    const count = daysWithData.length || 1

    const averages = {
      calories: Math.round(daysWithData.reduce((sum, d) => sum + d.calories, 0) / count),
      protein: Math.round(daysWithData.reduce((sum, d) => sum + d.protein, 0) / count * 10) / 10,
      carbs: Math.round(daysWithData.reduce((sum, d) => sum + d.carbs, 0) / count * 10) / 10,
      fats: Math.round(daysWithData.reduce((sum, d) => sum + d.fats, 0) / count * 10) / 10,
      fiber: Math.round(daysWithData.reduce((sum, d) => sum + d.fiber, 0) / count * 10) / 10,
      water: Math.round(daysWithData.reduce((sum, d) => sum + d.water, 0) / count * 10) / 10,
      daysTracked: daysWithData.length,
      totalDays: days.length,
    }

    return NextResponse.json({
      period,
      startDate: dayKeys[0],
      endDate: dayKeys[dayKeys.length - 1],
      days,
      averages,
    })
  } catch (error) {
    console.error('Error fetching nutrition summary:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition summary' }, { status: 500 })
  }
}
