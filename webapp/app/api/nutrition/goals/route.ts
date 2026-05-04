import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionGoal from '@/models/NutritionGoal'
import { verifyAuth } from '@/lib/auth'

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  waterGoal: 96,
  goalType: 'maintain',
  activityLevel: 'moderate'
}

// GET: Get user's nutrition goals
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()

    if (!goals) {
      return NextResponse.json({ ...DEFAULT_GOALS, _isDefault: true })
    }

    return NextResponse.json(goals)
  } catch (error) {
    console.error('Error fetching nutrition goals:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition goals' }, { status: 500 })
  }
}

// POST: Create or update nutrition goals
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { calories, protein, carbs, fats, fiber, waterGoal, goalType, activityLevel } = body

    await dbConnect()

    const updateData: Record<string, unknown> = {}
    if (calories !== undefined) updateData.calories = calories
    if (protein !== undefined) updateData.protein = protein
    if (carbs !== undefined) updateData.carbs = carbs
    if (fats !== undefined) updateData.fats = fats
    if (fiber !== undefined) updateData.fiber = fiber
    if (waterGoal !== undefined) updateData.waterGoal = waterGoal
    if (goalType !== undefined) updateData.goalType = goalType
    if (activityLevel !== undefined) updateData.activityLevel = activityLevel

    const goals = await NutritionGoal.findOneAndUpdate(
      { userId: authResult.userId },
      { $set: updateData },
      { upsert: true, new: true, runValidators: true }
    ).lean()

    return NextResponse.json({ success: true, goals })
  } catch (error) {
    console.error('Error updating nutrition goals:', error)
    return NextResponse.json({ error: 'Failed to update nutrition goals' }, { status: 500 })
  }
}
