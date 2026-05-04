import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal, { IMealItem } from '@/models/Meal'
import MealLog from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'

// POST: apply this meal as a MealLog for the current user.
// Body: { loggedAt?, tags?, notes? }
//
// Tag-merge policy: client-supplied `tags` are MERGED with the meal's own
// tags (deduped). Pass an explicit empty array `[]` to omit the meal's tags
// — but the meal's tags are still appended unless `replaceTags: true` is set.
// We default to merge because users typically want both context (meal name's
// tags) and the time-of-day tag they're logging it as.
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

    // Snapshot items — clone without _id so each log gets its own item ids.
    const sourceItems: IMealItem[] = (meal.items as IMealItem[] | undefined) || []
    const items = sourceItems.map(item => ({
      foodId: item.foodId,
      variantId: item.variantId,
      variantName: item.variantName,
      name: item.name,
      brand: item.brand,
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      servings: item.servings,
      nutrition: item.nutrition,
    }))

    const log = await MealLog.create({
      user: authResult.userId,
      loggedAt,
      items,
      mealId: meal._id,
      mealName: meal.name,
      tags: mergedTags,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    })

    await Meal.updateOne({ _id: meal._id }, { $inc: { usageCount: 1 } })

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
