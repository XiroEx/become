import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import { verifyAuth } from '@/lib/auth'
import { readTzOffset, localDateKey, utcMidnightDateKey } from '@/lib/dayWindow'

// GET: Nutrition history/summary for charts
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'
    const dateStr = searchParams.get('date')
    const tzOffsetMinutes = readTzOffset(searchParams)

    // Anchor the window to the caller's LOCAL day, then widen to a list of
    // YYYY-MM-DD keys. NutritionLog rows are keyed at UTC midnight of the
    // local day's YYYY-MM-DD (see /api/nutrition/log + /api/nutrition/water),
    // so we read by the same key.
    const endKey = localDateKey(dateStr, tzOffsetMinutes)
    const endMidnight = utcMidnightDateKey(endKey)
    const span = period === 'month' ? 30 : 7

    const dayKeys: string[] = []
    const dayDates: Date[] = []
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(endMidnight.getTime() - i * 86_400_000)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      dayKeys.push(key)
      dayDates.push(d)
    }

    const startMidnight = dayDates[0]

    // Fetch logs in a slightly widened range so any legacy rows in adjacent
    // UTC days don't get lost. We still bucket by row.date's UTC YYYY-MM-DD.
    const logs = await NutritionLog.find({
      userId: authResult.userId,
      date: { $gte: startMidnight, $lte: endMidnight }
    })
      .sort({ date: 1 })
      .lean()

    // Build daily array
    const logsByKey = new Map<string, typeof logs[number]>()
    for (const l of logs) {
      const ld = new Date(l.date)
      const k = `${ld.getUTCFullYear()}-${String(ld.getUTCMonth() + 1).padStart(2, '0')}-${String(ld.getUTCDate()).padStart(2, '0')}`
      logsByKey.set(k, l)
    }

    const days = dayKeys.map(dayStr => {
      const log = logsByKey.get(dayStr)
      return {
        date: dayStr,
        calories: log?.dailyTotals?.calories ?? 0,
        protein: log?.dailyTotals?.protein ?? 0,
        carbs: log?.dailyTotals?.carbs ?? 0,
        fats: log?.dailyTotals?.fats ?? 0,
        fiber: log?.dailyTotals?.fiber ?? 0,
        sugar: log?.dailyTotals?.sugar ?? 0,
        sodium: log?.dailyTotals?.sodium ?? 0,
        water: log?.water?.current ?? 0,
        mealCount: log?.meals?.length ?? 0,
        hasData: !!log
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
      totalDays: days.length
    }

    return NextResponse.json({
      period,
      startDate: dayKeys[0],
      endDate: dayKeys[dayKeys.length - 1],
      days,
      averages
    })
  } catch (error) {
    console.error('Error fetching nutrition summary:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition summary' }, { status: 500 })
  }
}
