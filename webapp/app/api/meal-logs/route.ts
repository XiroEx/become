import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog, { IMealLog } from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
import Food from '@/models/Food'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'
import { computeTotalNutrition, IMealNutrition } from '@/models/Meal'
import { recordStreakActivity } from '@/lib/streak'
import { readTzOffset, localDayWindowForKey, dateKey } from '@/lib/dayWindow'
import mongoose from 'mongoose'

function emptyNutrition(): IMealNutrition {
  return {
    calories: 0, protein: 0, carbs: 0, fats: 0,
    fiber: 0, sugar: 0, sodium: 0, saturatedFat: 0,
  }
}

function addNutrition(target: IMealNutrition, src: IMealNutrition): void {
  target.calories += src.calories || 0
  target.protein  += src.protein  || 0
  target.carbs    += src.carbs    || 0
  target.fats     += src.fats     || 0
  target.fiber!        += src.fiber        || 0
  target.sugar!        += src.sugar        || 0
  target.sodium!       += src.sodium       || 0
  target.saturatedFat! += src.saturatedFat || 0
}

function roundNutrition(n: IMealNutrition): IMealNutrition {
  return {
    calories: Math.round(n.calories * 10) / 10,
    protein:  Math.round(n.protein  * 10) / 10,
    carbs:    Math.round(n.carbs    * 10) / 10,
    fats:     Math.round(n.fats     * 10) / 10,
    fiber:        Math.round((n.fiber!        ) * 10) / 10,
    sugar:        Math.round((n.sugar!        ) * 10) / 10,
    sodium:       Math.round((n.sodium!       ) * 1000) / 1000,
    saturatedFat: Math.round((n.saturatedFat! ) * 10) / 10,
  }
}

// GET: ?date=YYYY-MM-DD  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const tzOffsetMinutes = readTzOffset(searchParams)

    if (dateParam) {
      const { start, end } = localDayWindowForKey(dateParam, tzOffsetMinutes)
      const logs = await MealLog.find({
        user: authResult.userId,
        loggedAt: { $gte: start, $lte: end },
      }).sort({ loggedAt: 1 }).lean()

      const dailyTotals = emptyNutrition()
      for (const l of logs) addNutrition(dailyTotals, l.totalNutrition || emptyNutrition())

      return NextResponse.json({
        date: dateParam,
        logs,
        dailyTotals: roundNutrition(dailyTotals),
      })
    }

    if (fromParam && toParam) {
      const { start } = localDayWindowForKey(fromParam, tzOffsetMinutes)
      const { end } = localDayWindowForKey(toParam, tzOffsetMinutes)
      const logs = await MealLog.find({
        user: authResult.userId,
        loggedAt: { $gte: start, $lte: end },
      }).sort({ loggedAt: 1 }).lean()

      // Group by YYYY-MM-DD in the CALLER'S local timezone.
      const byDate = new Map<string, { date: string; logs: IMealLog[]; dailyTotals: IMealNutrition }>()

      // Pre-seed every day in the range so consumers get explicit zero-days.
      for (
        let cursor = new Date(start.getTime());
        cursor.getTime() <= end.getTime();
        cursor = new Date(cursor.getTime() + 86_400_000)
      ) {
        const key = dateKey(cursor, tzOffsetMinutes)
        byDate.set(key, { date: key, logs: [], dailyTotals: emptyNutrition() })
      }

      for (const l of logs) {
        const key = dateKey(new Date(l.loggedAt), tzOffsetMinutes)
        const bucket = byDate.get(key) ?? { date: key, logs: [], dailyTotals: emptyNutrition() }
        bucket.logs.push(l)
        addNutrition(bucket.dailyTotals, l.totalNutrition || emptyNutrition())
        byDate.set(key, bucket)
      }

      const days = Array.from(byDate.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(d => ({ ...d, dailyTotals: roundNutrition(d.dailyTotals) }))

      return NextResponse.json({ days })
    }

    return NextResponse.json({ error: 'Provide either ?date=YYYY-MM-DD or ?from=&to=' }, { status: 400 })
  } catch (error) {
    console.error('Error listing meal logs:', error)
    return NextResponse.json({ error: 'Failed to list meal logs' }, { status: 500 })
  }
}

// POST: create a meal log
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items[] is required and must be non-empty' }, { status: 400 })
    }

    await dbConnect()

    let items
    try {
      items = await resolveItemsFromInput(body.items as MealItemInput[])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid item payload'
      console.error('[meal-logs POST] item resolution failed:', message, '— payload:', JSON.stringify(body.items).slice(0, 1000))
      return NextResponse.json({ error: message }, { status: 400 })
    }
    const loggedAt = body.loggedAt ? new Date(body.loggedAt) : new Date()
    if (Number.isNaN(loggedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid loggedAt' }, { status: 400 })
    }

    let mealId: mongoose.Types.ObjectId | undefined
    if (body.mealId && mongoose.Types.ObjectId.isValid(String(body.mealId))) {
      mealId = new mongoose.Types.ObjectId(String(body.mealId))
    }

    const log = await MealLog.create({
      user: authResult.userId,
      loggedAt,
      untimed: body.untimed === true,
      items,
      mealId,
      mealName: typeof body.mealName === 'string' ? body.mealName : undefined,
      source: typeof body.source === 'string' && ['photo', 'barcode', 'upload', 'describe', 'search', 'manual'].includes(body.source)
        ? body.source : undefined,
      tags: Array.isArray(body.tags) ? body.tags : [],
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      totalNutrition: computeTotalNutrition(items),
    })

    if (mealId) {
      await Meal_incrementUsage(mealId)
    }

    // Increment Food usageCount for each item that points at a real Food.
    for (const item of items) {
      if (item.foodId) {
        await Food.updateOne({ _id: item.foodId }, { $inc: { usageCount: 1 } }).catch(() => null)
      }
    }

    const streakResult = await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)

    return NextResponse.json({
      success: true,
      log,
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating meal log:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create meal log' }, { status: 500 })
  }
}

// Localized to this file to avoid pulling in the Meal model at module-eval
// time when only the log routes are used.
async function Meal_incrementUsage(mealId: mongoose.Types.ObjectId) {
  const Meal = (await import('@/models/Meal')).default
  await Meal.updateOne({ _id: mealId }, { $inc: { usageCount: 1 } }).catch(() => null)
}
