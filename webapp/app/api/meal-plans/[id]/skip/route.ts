import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import MealPlan from '@/models/MealPlan'
import { verifyAuth } from '@/lib/auth'
import { serializePlan } from '@/lib/mealPlanShared'

function isObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id)
}

// POST /api/meal-plans/[id]/skip
// Sets status: 'skipped'. No log created. Idempotent: skipping an
// already-skipped plan is fine. Promoted plans can NOT be skipped.
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
    if (!isObjectId(id)) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    const updated = await MealPlan.findOneAndUpdate(
      {
        _id: id,
        user: authResult.userId,
        status: { $in: ['active', 'skipped', 'superseded'] },
      },
      { $set: { status: 'skipped' } },
      { new: true },
    )
    if (!updated) {
      const existing = await MealPlan.findById(id).lean()
      if (!existing || existing.user.toString() !== authResult.userId) {
        return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
      }
      return NextResponse.json({
        error: 'plan_already_promoted',
        logId: existing.logId ? String(existing.logId) : null,
      }, { status: 409 })
    }
    return NextResponse.json({ plan: serializePlan(updated.toObject()) })
  } catch (error) {
    console.error('Error skipping meal plan:', error)
    return NextResponse.json({ error: 'Failed to skip meal plan' }, { status: 500 })
  }
}
