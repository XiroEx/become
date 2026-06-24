// POST /api/meals/[id]/sync-plans — re-snapshot the user's ACTIVE meal-plan slots
// that were created from this meal, so an edit to the saved meal propagates to the
// planned copies. Plan items are snapshots (not live refs), so this rewrites them.
import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal, { IMealItem, computeTotalNutrition } from '@/models/Meal'
import MealPlan from '@/models/MealPlan'
import { verifyAuth } from '@/lib/auth'
import { cloneItemsForSnapshot } from '@/lib/mealPlanShared'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const { id } = await params

    const meal = await Meal.findById(id)
    if (!meal) return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    if (meal.createdBy?.toString() !== auth.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const items = cloneItemsForSnapshot(meal.items as IMealItem[])
    const expectedNutrition = computeTotalNutrition(meal.items as IMealItem[])

    const res = await MealPlan.updateMany(
      { mealId: meal._id, user: auth.userId, status: 'active' },
      { $set: { items, expectedNutrition, mealName: meal.name } },
    )

    return NextResponse.json({ success: true, updated: res.modifiedCount })
  } catch (error) {
    console.error('Error syncing meal plans:', error)
    return NextResponse.json({ error: 'Failed to sync meal plans' }, { status: 500 })
  }
}
