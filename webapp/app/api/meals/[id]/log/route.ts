import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal, { IMealItem } from '@/models/Meal'
import MealLog from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'

// POST: apply this meal as a MealLog for the current user.
// Body: { loggedAt?, untimed?, tags?, notes?, portion? }
//
// Tag-merge policy: client-supplied `tags` are MERGED with the meal's own
// tags (deduped). Pass an explicit empty array `[]` to omit the meal's tags
// — but the meal's tags are still appended unless `replaceTags: true` is set.
// We default to merge because users typically want both context (meal name's
// tags) and the time-of-day tag they're logging it as.
//
// Portion: a numeric multiplier applied to every item's `servings` before the
// log is created. Defaults to 1. Sanity-clamped to [0.05, 20] — the lower
// bound prevents accidental zero-calorie entries; the upper bound is well
// beyond any realistic recipe scaling.
//   - Recipe with `recipe.servings = 4`, user wants "1 of 4" → portion=0.25.
//   - Standalone meal, user wants "double it" → portion=2.
// MealLog's pre-save hook recomputes totalNutrition from the scaled servings.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id).lean()
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!meal.isPublic && !meal.isVerified && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const loggedAt = body.loggedAt ? new Date(body.loggedAt) : new Date()
    if (Number.isNaN(loggedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid loggedAt' }, { status: 400 })
    }

    const clientTags: string[] = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
    const replaceTags: boolean = !!body.replaceTags
    const mealTags: string[] = Array.isArray(meal.tags) ? meal.tags : []
    const mergedTags = replaceTags ? clientTags : Array.from(new Set([...mealTags, ...clientTags]))

    // Resolve portion multiplier. Defaults to 1. Clamp to a sane range so a
    // typo (e.g. portion=0 or portion=1000) can't ghost-log nothing or scale
    // calories absurdly.
    let portion = 1
    if (body.portion != null) {
      const n = Number(body.portion)
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: 'Invalid portion' }, { status: 400 })
      }
      portion = Math.min(20, Math.max(0.05, n))
    }

    // Snapshot items — clone without _id so each log gets its own item ids,
    // and scale servings by the portion multiplier. The MealLog's pre-save
    // hook will recompute totalNutrition from these scaled servings.
    const sourceItems: IMealItem[] = (meal.items as IMealItem[] | undefined) || []
    const items = sourceItems.map(item => ({
      foodId: item.foodId,
      variantId: item.variantId,
      variantName: item.variantName,
      name: item.name,
      brand: item.brand,
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      servings: (item.servings ?? 1) * portion,
      nutrition: item.nutrition,
      servingLabel: item.servingLabel,
      loggedQuantity: item.loggedQuantity,
      loggedUnit: item.loggedUnit,
      loggedGramsPerServing: item.loggedGramsPerServing,
      loggedMlPerServing: item.loggedMlPerServing,
    }))

    const log = await MealLog.create({
      // Logged for the day with no clock — the day view places it by the tag's
      // anchor. Meals could not express this at all: this route had no time
      // picker in front of it, so every meal landed at the current minute.
      untimed: body.untimed === true,
      user: authResult.userId,
      loggedAt,
      items,
      mealId: meal._id,
      mealName: meal.name,
      tags: mergedTags,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    })

    await Meal.updateOne({ _id: meal._id }, { $inc: { usageCount: 1 } })

    // This creates a MealLog same as every other logging route — the
    // nutrition suggestion tiles on the dashboard are served from a 60s
    // cache keyed off MealLog data, so this write has to bust it too or
    // "log this meal" is the one path that still reads as "leave the page
    // and come back before it's reflected."
    await bustTilesCache(authResult.userId!)

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
    console.error('Error applying meal as log:', error)
    return NextResponse.json({ error: 'Failed to apply meal as log' }, { status: 500 })
  }
}
