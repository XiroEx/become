import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import NutritionGoal from '@/models/NutritionGoal'
import MealLog, { IMealLog } from '@/models/MealLog'
import { IMealItem } from '@/models/Meal'
import Food from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'
import { resolveItemFromInput } from '@/lib/mealItems'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
} from '@/lib/dayWindow'
import mongoose from 'mongoose'

// ---------------------------------------------------------------------------
// Legacy compat layer.
//
// Phase 2A introduces MealLog as the canonical store for logged eating events.
// The legacy `/api/nutrition/log` endpoint continues to expose the old shape:
//
//   { meals: [{ id, mealType, foods: [{ id, ... }], loggedAt }],
//     water, quickAdds, dailyTotals, goals }
//
// MealLogs are grouped by their primary tag — first matching default tag from
// breakfast/lunch/dinner/snack, otherwise "snack". Water and quickAdds still
// live on NutritionLog and are returned as before.
// ---------------------------------------------------------------------------

const PRIMARY_TAGS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
type MealType = typeof PRIMARY_TAGS[number]

function pickPrimaryTag(tags: string[] | undefined): MealType {
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const lower = String(t).toLowerCase()
      if ((PRIMARY_TAGS as readonly string[]).includes(lower)) {
        return lower as MealType
      }
    }
  }
  return 'snack'
}

interface LegacyFoodEntry {
  id: string
  foodId?: string
  variantId?: string
  variantName?: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
  }
  // PR 4 picker rework — surfaced when present so re-edit clients can avoid
  // synthesizing from `multiplier × servingSize`.
  loggedQuantity?: number
  loggedUnit?: string
  loggedGramsPerServing?: number
  loggedMlPerServing?: number
}

function mealLogToLegacyFoodEntries(log: IMealLog): LegacyFoodEntry[] {
  return (log.items || []).map(item => ({
    // Use the item's _id (or a synthesized one) so the frontend can address it.
    id: item._id ? item._id.toString() : new mongoose.Types.ObjectId().toString(),
    foodId: item.foodId?.toString(),
    variantId: item.variantId?.toString(),
    variantName: item.variantName,
    name: item.name,
    brand: item.brand,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    servings: item.servings,
    nutrition: {
      calories: item.nutrition.calories,
      protein: item.nutrition.protein,
      carbs: item.nutrition.carbs,
      fats: item.nutrition.fats,
      fiber: item.nutrition.fiber,
      sugar: item.nutrition.sugar,
      sodium: item.nutrition.sodium,
    },
    loggedQuantity: item.loggedQuantity,
    loggedUnit: item.loggedUnit,
    loggedGramsPerServing: item.loggedGramsPerServing,
    loggedMlPerServing: item.loggedMlPerServing,
  }))
}

interface LegacyMeal {
  id: string
  mealType: MealType
  foods: LegacyFoodEntry[]
  loggedAt: Date
}

function buildLegacyMeals(logs: IMealLog[]): LegacyMeal[] {
  // Group by primary tag, preserving log order. We collapse all logs of the
  // same primary tag into a single legacy "meal" because the old UI assumed
  // exactly one entry per mealType.
  const buckets = new Map<MealType, LegacyMeal>()
  for (const log of logs) {
    const tag = pickPrimaryTag(log.tags)
    const bucket = buckets.get(tag)
    const entries = mealLogToLegacyFoodEntries(log)
    if (bucket) {
      bucket.foods.push(...entries)
      // Keep the earliest loggedAt as canonical.
      if (new Date(log.loggedAt).getTime() < new Date(bucket.loggedAt).getTime()) {
        bucket.loggedAt = log.loggedAt
      }
    } else {
      buckets.set(tag, {
        // Use the source MealLog's _id as the legacy meal id when we can —
        // when a tag's bucket gets merged from multiple logs, the first wins.
        id: log._id ? log._id.toString() : new mongoose.Types.ObjectId().toString(),
        mealType: tag,
        foods: entries,
        loggedAt: log.loggedAt,
      })
    }
  }
  // Order: breakfast, lunch, dinner, snack (canonical day order).
  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
  return order.flatMap(t => (buckets.has(t) ? [buckets.get(t)!] : []))
}

interface DailyTotals {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
  sugar: number
  sodium: number
}

function computeDailyTotals(logs: IMealLog[], quickAdds: { calories: number; protein: number; carbs: number; fats: number }[]): DailyTotals {
  const t: DailyTotals = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
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
  return {
    calories: Math.round(t.calories * 10) / 10,
    protein:  Math.round(t.protein  * 10) / 10,
    carbs:    Math.round(t.carbs    * 10) / 10,
    fats:     Math.round(t.fats     * 10) / 10,
    fiber:    Math.round(t.fiber    * 10) / 10,
    sugar:    Math.round(t.sugar    * 10) / 10,
    sodium:   Math.round(t.sodium   * 1000) / 1000,
  }
}

// Deterministic time-of-day per mealType so that legacy callers writing without
// loggedAt produce stable orderings inside a day. `localStart` is the UTC
// timestamp corresponding to the user's local midnight (i.e. the start of
// localDayWindowForKey). We offset by wall-clock hours from there.
function defaultTimeForMealType(mealType: MealType, localStart: Date): Date {
  const base = localStart.getTime()
  const HOUR = 60 * 60 * 1000
  const MIN = 60 * 1000
  switch (mealType) {
    case 'breakfast': return new Date(base + 8 * HOUR)
    case 'lunch':     return new Date(base + 12 * HOUR)
    case 'dinner':    return new Date(base + 18 * HOUR + 30 * MIN)
    case 'snack':     return new Date(base + 15 * HOUR)
  }
}

// ---------------------------------------------------------------------------
// GET — return the legacy day shape, populated from MealLog + NutritionLog
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const tzOffsetMinutes = readTzOffset(searchParams)
    const dateKey = localDateKey(searchParams.get('date'), tzOffsetMinutes)
    const { start, end } = localDayWindowForKey(dateKey, tzOffsetMinutes)
    const nutritionLogKey = utcMidnightDateKey(dateKey)

    const [mealLogs, primaryLog, goals] = await Promise.all([
      MealLog.find({
        user: authResult.userId,
        loggedAt: { $gte: start, $lte: end },
      }).sort({ loggedAt: 1 }).lean<IMealLog[]>(),
      NutritionLog.findOne({ userId: authResult.userId, date: nutritionLogKey }).lean(),
      NutritionGoal.findOne({ userId: authResult.userId }).lean(),
    ])

    // Back-compat fallback: PR #246/#247 (2026-05-12) made NutritionLog rows
    // get keyed at UTC midnight of the LOCAL YYYY-MM-DD. Rows written before
    // that fix by callers in non-UTC zones during their local evening landed
    // at a UTC-midnight that no longer matches their local-day key. If the
    // canonical lookup misses, search the local-day window for any legacy row.
    //
    // We only honor the fallback when exactly one row falls in the window —
    // multiple rows would mean data is genuinely ambiguous (canonical row +
    // legacy row both exist for the same local day), in which case we prefer
    // the canonical lookup result (which was null) over guessing.
    let nutritionLog = primaryLog
    if (!nutritionLog) {
      const candidates = await NutritionLog.find({
        userId: authResult.userId,
        date: { $gte: start, $lt: new Date(end.getTime() + 1) },
      }).lean()
      if (candidates.length === 1) {
        const fallback = candidates[0]
        console.warn(
          `[nutrition/log] back-compat fallback hit — userId=${authResult.userId} dateKey=${dateKey} rowDate=${fallback.date.toISOString()}`
        )
        nutritionLog = fallback
        // Self-heal: rewrite the legacy row's `date` to the canonical key so
        // the next read hits the primary lookup. We do this asynchronously
        // (don't await) so the response isn't blocked. Rationale: keeping
        // legacy rows around indefinitely means the fallback path stays warm
        // forever, and every legacy-keyed read costs an extra query. Self-
        // healing converges the dataset toward the canonical key with zero
        // operator effort. The alternative (audit-only) was considered but
        // rejected — there's no reason to preserve the old key, and the
        // migration script remains the bulk-fix tool for offline conversion.
        NutritionLog.updateOne(
          { _id: fallback._id },
          { $set: { date: nutritionLogKey } }
        ).catch((err) => {
          console.warn(
            `[nutrition/log] self-heal updateOne failed — _id=${fallback._id} err=${err instanceof Error ? err.message : String(err)}`
          )
        })
      }
    }

    const meals = buildLegacyMeals(mealLogs)
    const water = nutritionLog?.water ?? { current: 0, goal: goals?.waterGoal ?? 96 }
    const quickAdds = nutritionLog?.quickAdds ?? []
    const dailyTotals = computeDailyTotals(mealLogs, quickAdds)

    return NextResponse.json({
      userId: authResult.userId,
      date: nutritionLogKey,
      meals,
      water,
      quickAdds,
      dailyTotals,
      goals: goals || {
        calories: 2000,
        protein: 150,
        carbs: 200,
        fats: 65,
        waterGoal: 96,
      },
    })
  } catch (error) {
    console.error('Error fetching nutrition log:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition log' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST — add a food entry to a meal (translated to a MealLog upsert)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mealType, food, date: dateStr } = body
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (!mealType || !food || !food.name || !food.nutrition) {
      return NextResponse.json({ error: 'Missing required fields: mealType, food.name, food.nutrition' }, { status: 400 })
    }
    if (!(PRIMARY_TAGS as readonly string[]).includes(mealType)) {
      return NextResponse.json({ error: 'Invalid mealType' }, { status: 400 })
    }

    await dbConnect()

    const dateKey = localDateKey(dateStr, tzOffsetMinutes)
    const { start, end } = localDayWindowForKey(dateKey, tzOffsetMinutes)
    const date = utcMidnightDateKey(dateKey)

    const item = await resolveItemFromInput({
      foodId: food.foodId,
      variantId: food.variantId,
      variantName: food.variantName,
      name: food.name,
      brand: food.brand,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      servings: food.servings ?? 1,
      nutrition: food.nutrition,
      // PR 4 provenance — pass-through. Old callers omit these and the route
      // continues to work; new callers carry the full quantity+unit so re-edits
      // round-trip without losing the user's intent.
      loggedQuantity: food.loggedQuantity,
      loggedUnit: food.loggedUnit,
      loggedGramsPerServing: food.loggedGramsPerServing,
      loggedMlPerServing: food.loggedMlPerServing,
    })

    // Find an existing MealLog of this primary tag in the same day, or create
    // a new one. This preserves the "one bucket per mealType" UX of the legacy
    // shape while writing through to the canonical MealLog store.
    const existing = await MealLog.find({
      user: authResult.userId,
      loggedAt: { $gte: start, $lte: end },
      tags: mealType,
    }).sort({ loggedAt: 1 })

    let log = existing[0]
    if (!log) {
      log = new MealLog({
        user: authResult.userId,
        loggedAt: defaultTimeForMealType(mealType as MealType, start),
        items: [item],
        tags: [mealType],
      })
    } else {
      log.items.push(item)
    }
    await log.save()

    if (item.foodId) {
      await Food.updateOne({ _id: item.foodId }, { $inc: { usageCount: 1 } }).catch(() => null)
    }

    // Ensure a NutritionLog row exists so water / quickAdds keep working in
    // the legacy shape. Don't sync meals[] here — they're served from MealLog.
    await NutritionLog.updateOne(
      { userId: authResult.userId, date },
      { $setOnInsert: {
        userId: authResult.userId,
        date,
        meals: [],
        water: { current: 0, goal: 96 },
        quickAdds: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 },
      } },
      { upsert: true }
    )

    const streakResult = await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)

    // Nutrition feeds dashboard tiles — invalidate so it shows immediately.
    await bustTilesCache(authResult.userId!)

    // Return the legacy-shaped day to keep the existing frontend happy.
    const fullResponse = await buildLegacyDayResponse(authResult.userId!, dateKey, tzOffsetMinutes)
    return NextResponse.json({
      success: true,
      log: fullResponse,
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
    })
  } catch (error) {
    console.error('Error adding food entry:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add food entry' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT — update a food entry (translates to a MealLog item update)
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mealId, foodEntryId, updates, date: dateStr } = body
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (!mealId || !foodEntryId || !updates) {
      return NextResponse.json({ error: 'Missing required fields: mealId, foodEntryId, updates' }, { status: 400 })
    }

    await dbConnect()

    const dateKey = localDateKey(dateStr, tzOffsetMinutes)
    const { start, end } = localDayWindowForKey(dateKey, tzOffsetMinutes)

    // Find the MealLog containing this item _id. Legacy `mealId` may map to
    // any log of the matching primary tag; we identify the actual log via the
    // food entry id.
    const candidates = await MealLog.find({
      user: authResult.userId,
      loggedAt: { $gte: start, $lte: end },
    })

    const target = candidates.find(log => (log.items as IMealItem[]).some((it: IMealItem) => it._id?.toString() === String(foodEntryId)))
    if (!target) {
      return NextResponse.json({ error: 'Food entry not found' }, { status: 404 })
    }

    const item = (target.items as IMealItem[]).find((it: IMealItem) => it._id?.toString() === String(foodEntryId))!

    // Legacy semantics: rescaling on servingSize change rescales nutrition.
    if (updates.servingSize !== undefined && updates.servingSize !== item.servingSize) {
      if (!Number.isFinite(updates.servingSize) || updates.servingSize <= 0) {
        return NextResponse.json({ error: 'servingSize must be a positive number' }, { status: 400 })
      }
      if (!item.servingSize || item.servingSize <= 0) {
        // Legacy/malformed item — can't rescale without a positive denominator.
        // Accept the new size and leave nutrition untouched rather than producing
        // Infinity macros.
        item.servingSize = updates.servingSize
      } else {
        const sizeRatio = updates.servingSize / item.servingSize
        item.servingSize = updates.servingSize
        item.nutrition.calories = Math.round(item.nutrition.calories * sizeRatio * 10) / 10
        item.nutrition.protein  = Math.round(item.nutrition.protein  * sizeRatio * 10) / 10
        item.nutrition.carbs    = Math.round(item.nutrition.carbs    * sizeRatio * 10) / 10
        item.nutrition.fats     = Math.round(item.nutrition.fats     * sizeRatio * 10) / 10
        if (item.nutrition.fiber        != null) item.nutrition.fiber        = Math.round(item.nutrition.fiber        * sizeRatio * 10) / 10
        if (item.nutrition.sugar        != null) item.nutrition.sugar        = Math.round(item.nutrition.sugar        * sizeRatio * 10) / 10
        if (item.nutrition.sodium       != null) item.nutrition.sodium       = Math.round(item.nutrition.sodium       * sizeRatio * 10) / 10
        if (item.nutrition.saturatedFat != null) item.nutrition.saturatedFat = Math.round(item.nutrition.saturatedFat * sizeRatio * 10) / 10
      }
    }

    if (updates.servings !== undefined) {
      if (!Number.isFinite(updates.servings) || updates.servings < 0) {
        return NextResponse.json({ error: 'servings must be a non-negative number' }, { status: 400 })
      }
      item.servings = updates.servings
    }

    target.markModified('items')
    await target.save()

    const fullResponse = await buildLegacyDayResponse(authResult.userId!, dateKey, tzOffsetMinutes)
    return NextResponse.json({ success: true, log: fullResponse })
  } catch (error) {
    console.error('Error updating food entry:', error)
    return NextResponse.json({ error: 'Failed to update food entry' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a food entry (translates to a MealLog item delete)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let foodEntryId: string | null = null
    let dateStr: string | null = null
    let bodyTz: unknown = null

    const { searchParams } = new URL(request.url)
    foodEntryId = searchParams.get('foodEntryId')
    dateStr = searchParams.get('date')
    const urlTz = searchParams.get('tz')

    if (!foodEntryId) {
      try {
        const body = await request.json()
        foodEntryId = body.foodEntryId || foodEntryId
        dateStr = body.date || dateStr
        bodyTz = body.tz
      } catch {
        // body parsing failed; rely on query params
      }
    }

    if (!foodEntryId) {
      return NextResponse.json({ error: 'Missing required field: foodEntryId' }, { status: 400 })
    }

    const rawTz = urlTz != null ? Number(urlTz) : (typeof bodyTz === 'number' ? bodyTz : 0)
    const tzOffsetMinutes = Number.isFinite(rawTz) ? Math.max(-840, Math.min(840, rawTz as number)) : 0

    await dbConnect()

    const dateKey = localDateKey(dateStr, tzOffsetMinutes)
    const { start, end } = localDayWindowForKey(dateKey, tzOffsetMinutes)

    const candidates = await MealLog.find({
      user: authResult.userId,
      loggedAt: { $gte: start, $lte: end },
    })

    const target = candidates.find(log => (log.items as IMealItem[]).some((it: IMealItem) => it._id?.toString() === String(foodEntryId)))
    if (!target) {
      return NextResponse.json({ error: 'Food entry not found' }, { status: 404 })
    }

    const idx = (target.items as IMealItem[]).findIndex((it: IMealItem) => it._id?.toString() === String(foodEntryId))
    target.items.splice(idx, 1)

    if (target.items.length === 0) {
      await MealLog.deleteOne({ _id: target._id })
    } else {
      await target.save()
    }

    const fullResponse = await buildLegacyDayResponse(authResult.userId!, dateKey, tzOffsetMinutes)
    return NextResponse.json({ success: true, log: fullResponse })
  } catch (error) {
    console.error('Error deleting food entry:', error)
    return NextResponse.json({ error: 'Failed to delete food entry' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helper: assemble the same response shape as GET (for write responses)
// ---------------------------------------------------------------------------

async function buildLegacyDayResponse(userId: string, dateKey: string, tzOffsetMinutes = 0) {
  const { start, end } = localDayWindowForKey(dateKey, tzOffsetMinutes)
  const nutritionKey = utcMidnightDateKey(dateKey)
  const [mealLogs, nutritionLog, goals] = await Promise.all([
    MealLog.find({
      user: userId,
      loggedAt: { $gte: start, $lte: end },
    }).sort({ loggedAt: 1 }).lean<IMealLog[]>(),
    NutritionLog.findOne({ userId, date: nutritionKey }).lean(),
    NutritionGoal.findOne({ userId }).lean(),
  ])

  const meals = buildLegacyMeals(mealLogs)
  const water = nutritionLog?.water ?? { current: 0, goal: goals?.waterGoal ?? 96 }
  const quickAdds = nutritionLog?.quickAdds ?? []
  const dailyTotals = computeDailyTotals(mealLogs, quickAdds)

  return {
    userId,
    date: nutritionKey,
    meals,
    water,
    quickAdds,
    dailyTotals,
    goals: goals || {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fats: 65,
      waterGoal: 96,
    },
  }
}
