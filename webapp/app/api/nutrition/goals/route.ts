import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionGoal from '@/models/NutritionGoal'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import {
  computeNutritionTargets,
  waterGoalOz,
  MACRO_CALC_VERSION,
  type MacroPreset,
} from '@/lib/nutrition/tdee'

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

    const refreshed = await refreshStaleTargets(authResult.userId!, goals)
    return NextResponse.json(refreshed ?? goals)
  } catch (error) {
    console.error('Error fetching nutrition goals:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition goals' }, { status: 500 })
  }
}

/**
 * Bring pre-fix targets up to date on read.
 *
 * Targets are computed once at onboarding and persisted, so fixing the macro
 * maths does nothing for anyone who already signed up — they keep the old
 * numbers forever. Rather than a migration, a row stamped with an older
 * calcVersion is recomputed the next time it is read.
 *
 * Deliberately conservative:
 *   - a member who typed their own numbers (macroPreset 'custom') is never
 *     touched, because those are theirs, not ours
 *   - without enough body stats to compute honestly, the old row is left alone
 *   - any failure returns null and the caller serves what it already had
 */
async function refreshStaleTargets(
  userId: string,
  goals: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    if ((goals.calcVersion as number | undefined) === MACRO_CALC_VERSION) return null
    if (goals.macroPreset === 'custom') return null

    const user = await User.findById(userId).select('profile').lean<{
      profile?: {
        currentWeightKg?: number; heightCm?: number; age?: number
        biologicalSex?: 'male' | 'female' | 'prefer_not_to_say'
        fitnessGoals?: string[]; nutritionDirection?: 'lose' | 'maintain' | 'gain'
      }
    }>()
    const p = user?.profile
    if (!p?.currentWeightKg || !p.heightCm || !p.age || !p.biologicalSex) return null

    const preset = (goals.macroPreset as MacroPreset | undefined) ?? 'recommended'
    const targets = computeNutritionTargets({
      currentWeightKg: p.currentWeightKg,
      heightCm: p.heightCm,
      age: p.age,
      biologicalSex: p.biologicalSex,
      goals: (p.fitnessGoals ?? []) as never,
      direction: (goals.goalType as 'lose' | 'maintain' | 'gain') ?? p.nutritionDirection,
      activityLevel: goals.activityLevel as never,
      macroPreset: preset,
    })
    if (!targets) return null

    const next = {
      calories: targets.calories,
      protein: targets.protein,
      carbs: targets.carbs,
      fats: targets.fats,
      waterGoal: (goals.waterGoal as number | undefined) || waterGoalOz(p.currentWeightKg),
      macroPreset: preset,
      calcVersion: MACRO_CALC_VERSION,
    }
    await NutritionGoal.updateOne({ userId }, { $set: next })
    return { ...goals, ...next }
  } catch (error) {
    console.error('nutrition target refresh failed (non-fatal):', error)
    return null
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
    const { calories, protein, carbs, fats, fiber, waterGoal, goalType, activityLevel, macroPreset } = body

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
    // Record which split these came from, and stamp the maths version. Both
    // exist so a later fix can reach members who already have targets saved —
    // and so 'custom' (hand-typed) is never silently recomputed underneath them.
    if (macroPreset !== undefined) updateData.macroPreset = macroPreset
    updateData.calcVersion = MACRO_CALC_VERSION

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
