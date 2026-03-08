import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import { verifyAuth } from '@/lib/auth'

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

    // Calculate date range
    const endDate = dateStr ? new Date(dateStr + 'T23:59:59.999Z') : new Date()
    endDate.setUTCHours(23, 59, 59, 999)

    const startDate = new Date(endDate)
    startDate.setUTCHours(0, 0, 0, 0)

    if (period === 'month') {
      startDate.setDate(startDate.getDate() - 29) // 30 days including today
    } else {
      startDate.setDate(startDate.getDate() - 6) // 7 days including today
    }

    // Fetch logs for the period
    const logs = await NutritionLog.find({
      userId: authResult.userId,
      date: { $gte: startDate, $lte: endDate }
    })
      .sort({ date: 1 })
      .lean()

    // Build daily array with all dates (fill gaps with zeros)
    const days = []
    const current = new Date(startDate)

    while (current <= endDate) {
      const dayStr = current.toISOString().split('T')[0]
      const log = logs.find(l => {
        const logDate = new Date(l.date)
        return logDate.toISOString().split('T')[0] === dayStr
      })

      days.push({
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
      })

      current.setDate(current.getDate() + 1)
    }

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
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      days,
      averages
    })
  } catch (error) {
    console.error('Error fetching nutrition summary:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition summary' }, { status: 500 })
  }
}
