import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionGoal from '@/models/NutritionGoal'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import Goal from '@/models/Goal'
import { verifyAuth } from '@/lib/auth'
import {
  computeNutritionTargets,
  waterGoalOz,
  MACRO_CALC_VERSION,
  type MacroPreset,
} from '@/lib/nutrition/tdee'
import { reconcileGoals, isCoherent } from '@/lib/nutrition/goalCoherence'
import { weightSeriesKg } from '@/lib/goals/ensure'
import { trendWeightKg, needsWeightRecalc } from '@/lib/goals/trend'

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
 * Bring pre-fix or stale-weight targets up to date on read.
 *
 * Targets are computed once and persisted, so nothing reaches an existing
 * member unless it happens here, on the next read:
 *   - a fix to the macro maths (calcVersion behind MACRO_CALC_VERSION)
 *   - a row whose own numbers contradict each other (see `broken` below)
 *   - logged weight has drifted from the (rolling-average) weight the row was
 *     last computed from — the adaptive part. A single weigh-in is mostly
 *     water, so this reacts to the TREND (lib/goals/trend.ts), not the latest
 *     entry, and only past a threshold so it doesn't chase noise.
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
    // A row whose own numbers contradict each other is repaired whatever its
    // calcVersion says. The version stamp only tracks which FORMULA produced a
    // row; it cannot catch a row that was written in two halves at two
    // different bodyweights, which is how a live member ended up with 2,214 cal
    // sitting beside 2,317 cal of macros.
    const stored = {
      calories: (goals.calories as number) ?? 0,
      protein: (goals.protein as number) ?? 0,
      carbs: (goals.carbs as number) ?? 0,
      fats: (goals.fats as number) ?? 0,
    }
    const broken = stored.calories > 0 && !isCoherent(stored)

    if (broken && goals.macroPreset === 'custom') {
      // Hand-typed numbers are theirs. Do not replace them with computed
      // targets — just make the calorie figure agree with the macros they set.
      const { goals: fixed } = reconcileGoals(stored, true)
      const saved = await NutritionGoal.findOneAndUpdate(
        { userId },
        { $set: { calories: fixed.calories } },
        { new: true },
      ).lean()
      console.warn(`nutrition goals repaired on read for ${userId}: custom row, calories recomputed`, {
        was: stored.calories, now: fixed.calories,
      })
      return saved as Record<string, unknown> | null
    }
    // Hand-typed rows are exempt from every recompute below, whatever their
    // calcVersion or weight drift says.
    if (goals.macroPreset === 'custom') return null

    const user = await User.findById(userId).select('profile').lean<{
      profile?: {
        currentWeightKg?: number; heightCm?: number; age?: number
        biologicalSex?: 'male' | 'female' | 'prefer_not_to_say'
        fitnessGoals?: string[]; nutritionDirection?: 'lose' | 'maintain' | 'gain'
        weightUnit?: 'lbs' | 'kg'
      }
    }>()
    const p = user?.profile
    if (!p?.currentWeightKg || !p.heightCm || !p.age || !p.biologicalSex) return null

    // The rolling-average logged weight, not a single reading — falls back to
    // the profile's point-in-time weight when there's no log history yet.
    const progress = await UserProgress.findOne({ userId }).select('weightHistory').lean<{
      weightHistory?: Array<{ date: Date; weight: number; unit?: 'lbs' | 'kg' }>
    }>()
    const series = weightSeriesKg(progress?.weightHistory, p.weightUnit === 'kg' ? 'kg' : 'lbs')
    const trendKg = trendWeightKg(series, new Date()) ?? p.currentWeightKg

    const versionStale = (goals.calcVersion as number | undefined) !== MACRO_CALC_VERSION
    const weightDrifted = needsWeightRecalc(goals.calcWeightKg as number | undefined, trendKg)
    if (!broken && !versionStale && !weightDrifted) return null

    const preset = (goals.macroPreset as MacroPreset | undefined) ?? 'recommended'
    const direction = (goals.goalType as 'lose' | 'maintain' | 'gain' | undefined) ?? p.nutritionDirection
    // The active Goal's chosen pace — pace only means anything for the
    // direction it was picked under, so a stale row is never handed a pace
    // from a goal that has since flipped to a different direction.
    const activeGoal = await Goal.findOne({ userId, pillar: 'nutrition', status: 'active' })
      .select('target.paceKgPerWeek target.direction')
      .lean<{ target?: { paceKgPerWeek?: number; direction?: string } } | null>()
    const paceKgPerWeek = activeGoal?.target?.direction === direction ? activeGoal?.target?.paceKgPerWeek : undefined
    const targets = computeNutritionTargets({
      currentWeightKg: trendKg,
      heightCm: p.heightCm,
      age: p.age,
      biologicalSex: p.biologicalSex,
      goals: (p.fitnessGoals ?? []) as never,
      direction,
      activityLevel: goals.activityLevel as never,
      macroPreset: preset,
      paceKgPerWeek,
    })
    if (!targets) return null

    const next = {
      calories: targets.calories,
      protein: targets.protein,
      carbs: targets.carbs,
      fats: targets.fats,
      waterGoal: (goals.waterGoal as number | undefined) || waterGoalOz(trendKg),
      macroPreset: preset,
      calcVersion: MACRO_CALC_VERSION,
      calcWeightKg: trendKg,
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

    // Reconcile BEFORE writing. Each field used to be $set independently, so a
    // caller that sent macros without calories (or the reverse) left a row whose
    // own numbers contradicted each other — 2,214 cal stored against 2,317 cal
    // of macros, which read on the dashboard as "266 left" beside 378 cal of
    // remaining macros. Merge onto what is already stored, then make the two
    // halves agree, with whichever side this request touched winning.
    const existing = await NutritionGoal.findOne({ userId: authResult.userId })
      .lean<{ calories?: number; protein?: number; carbs?: number; fats?: number } | null>()

    const merged = {
      calories: calories ?? existing?.calories ?? 0,
      protein: protein ?? existing?.protein ?? 0,
      carbs: carbs ?? existing?.carbs ?? 0,
      fats: fats ?? existing?.fats ?? 0,
    }
    const touchedMacros = protein !== undefined || carbs !== undefined || fats !== undefined
    const { goals: coherent, fix, was } = reconcileGoals(merged, touchedMacros)
    if (fix !== 'none') {
      console.warn(
        `nutrition goals reconciled for ${authResult.userId}: ${fix}`,
        { was, now: coherent },
      )
    }

    const updateData: Record<string, unknown> = {}
    // Write all four whenever any of them was touched, so the row can never be
    // left half-updated again.
    if (calories !== undefined || touchedMacros) {
      updateData.calories = coherent.calories
      updateData.protein = coherent.protein
      updateData.carbs = coherent.carbs
      updateData.fats = coherent.fats
    }
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
