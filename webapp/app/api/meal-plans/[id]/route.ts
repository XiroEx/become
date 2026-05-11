import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import MealPlan from '@/models/MealPlan'
import { verifyAuth } from '@/lib/auth'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'
import { parsePlannedDateToUtcMidnight } from '@/lib/mealPlanDates'
import { serializePlan } from '@/lib/mealPlanShared'

function isObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id)
}

// GET /api/meal-plans/[id]
export async function GET(
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
    if (!isObjectId(id)) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    const plan = await MealPlan.findById(id).lean()
    if (!plan || plan.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    return NextResponse.json({ plan: serializePlan(plan) })
  } catch (error) {
    console.error('Error fetching meal plan:', error)
    return NextResponse.json({ error: 'Failed to fetch meal plan' }, { status: 500 })
  }
}

// PATCH /api/meal-plans/[id] — owner only, NOT allowed after promotion.
// Accepts: items, tag, notes, plannedDate.
export async function PATCH(
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
    if (!isObjectId(id)) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    const plan = await MealPlan.findById(id)
    if (!plan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    if (plan.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (plan.status === 'promoted') {
      return NextResponse.json({ error: 'plan_already_promoted', logId: plan.logId ? String(plan.logId) : null }, { status: 409 })
    }

    const body = await request.json().catch(() => ({}))

    if (Array.isArray(body.items)) {
      const items = await resolveItemsFromInput(body.items as MealItemInput[])
      plan.items = items
    }
    if (typeof body.tag === 'string' && body.tag.trim().length > 0) {
      plan.tag = body.tag.trim().toLowerCase()
    }
    if (body.notes !== undefined) {
      plan.notes = typeof body.notes === 'string' ? body.notes : undefined
    }
    if (typeof body.plannedDate === 'string') {
      try {
        plan.plannedDate = parsePlannedDateToUtcMidnight(body.plannedDate)
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid plannedDate' }, { status: 400 })
      }
    }

    await plan.save()
    return NextResponse.json({ plan: serializePlan(plan.toObject()) })
  } catch (error) {
    console.error('Error updating meal plan:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update meal plan' }, { status: 500 })
  }
}

// DELETE /api/meal-plans/[id][?series=true]
// Hard delete. Plans in any status are deletable. If ?series=true, all
// sibling active plans sharing this plan's seriesId are also deleted.
export async function DELETE(
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
    if (!isObjectId(id)) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    const plan = await MealPlan.findById(id)
    if (!plan) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    if (plan.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const series = searchParams.get('series') === 'true'

    let deletedCount = 1

    if (series && plan.seriesId) {
      const siblings = await MealPlan.deleteMany({
        user: authResult.userId,
        seriesId: plan.seriesId,
        status: 'active',
      })
      deletedCount = siblings.deletedCount ?? 0
      // The non-active source plan (e.g. status=promoted) is preserved by the
      // filter above; if the caller passed a promoted plan with series=true,
      // we still delete it explicitly.
      if (plan.status !== 'active') {
        await MealPlan.deleteOne({ _id: id })
        deletedCount += 1
      }
    } else {
      await MealPlan.deleteOne({ _id: id })
    }

    return NextResponse.json({ success: true, deletedCount })
  } catch (error) {
    console.error('Error deleting meal plan:', error)
    return NextResponse.json({ error: 'Failed to delete meal plan' }, { status: 500 })
  }
}
