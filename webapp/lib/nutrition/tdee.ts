/**
 * Shared TDEE + macro math.
 *
 * This is the SINGLE source of truth for turning body stats into calorie and
 * macro targets. It is used by:
 *   - the onboarding wizard (live preview + the goals seeded on Finish)
 *   - /dashboard/nutrition/goals (the "Recommended" preset + Recalculate)
 *
 * Before this existed the two screens used different formulas — onboarding used
 * g/lb protein, the goals page used a 30/40/30 percentage split — so a member's
 * numbers silently changed the first time they opened the goals page. Anything
 * that computes targets must go through computeNutritionTargets().
 */

export type NutritionDirection = 'lose' | 'maintain' | 'gain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say'
export type FitnessGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'improve_performance'
  | 'general_health'

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly Active',
  moderate: 'Moderately Active',
  active: 'Active',
  very_active: 'Very Active',
}

/** Calorie delta applied to TDEE for each direction. */
export const DIRECTION_ADJUSTMENT: Record<NutritionDirection, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
}

export const DIRECTION_LABELS: Record<NutritionDirection, string> = {
  lose: 'Lose Weight',
  maintain: 'Maintain',
  gain: 'Gain Weight',
}

/** Plain-English explanation of what each direction does to the calorie target. */
export const DIRECTION_EXPLANATION: Record<NutritionDirection, string> = {
  lose: 'a 500 calorie deficit — about 1 lb of fat loss per week',
  maintain: 'calories at maintenance — hold your weight while you train',
  gain: 'a 300 calorie surplus — lean gaining without excess fat',
}

const LBS_PER_KG = 2.20462

/** Map weekly training availability onto an activity multiplier bucket. */
export function activityFromTrainingDays(days?: number): ActivityLevel {
  const d = days ?? 3
  if (d >= 6) return 'very_active'
  if (d >= 5) return 'active'
  if (d >= 3) return 'moderate'
  if (d >= 1) return 'light'
  return 'sedentary'
}

/**
 * The calorie direction a fitness goal implies. Used only as the DEFAULT
 * pre-selection — the member picks explicitly during onboarding, because
 * "build muscle" doesn't always mean "eat in a surplus" (recomp is real).
 */
export function directionForGoal(goal?: FitnessGoal): NutritionDirection {
  switch (goal) {
    case 'lose_weight':
      return 'lose'
    case 'gain_muscle':
      return 'gain'
    default:
      return 'maintain'
  }
}

export interface BodyStats {
  currentWeightKg?: number
  heightCm?: number
  age?: number
  biologicalSex?: BiologicalSex
}

/**
 * Mifflin-St Jeor BMR. Returns null when we don't have enough to be honest
 * about the number — callers should show "we need a bit more info" rather than
 * inventing a target from a guess.
 */
export function calcBmr(stats: BodyStats): number | null {
  const { currentWeightKg, heightCm, age, biologicalSex } = stats
  if (!currentWeightKg || !heightCm || !age) return null
  if (!biologicalSex || biologicalSex === 'prefer_not_to_say') return null

  const sexAdjust = biologicalSex === 'male' ? 5 : -161
  return 10 * currentWeightKg + 6.25 * heightCm - 5 * age + sexAdjust
}

export function calcTdee(stats: BodyStats, activityLevel: ActivityLevel): number | null {
  const bmr = calcBmr(stats)
  if (bmr === null) return null
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel])
}

/**
 * Protein target in grams per lb of bodyweight.
 * Higher in a deficit (protein preserves lean mass when calories are low) and
 * when muscle gain is anywhere in the member's goal set.
 */
function proteinPerLb(direction: NutritionDirection, goals: FitnessGoal[]): number {
  const wantsMuscle = goals.includes('gain_muscle')
  if (direction === 'lose') return 1.0
  if (direction === 'gain') return 0.9
  return wantsMuscle ? 0.9 : 0.8
}

export interface TargetsInput extends BodyStats {
  /** Ordered goals — index 0 is primary. A single goal is fine. */
  goals?: FitnessGoal[]
  direction?: NutritionDirection
  activityLevel?: ActivityLevel
  /** Used to derive activityLevel when one isn't passed explicitly. */
  weeklyAvailability?: number
}

export interface NutritionTargets {
  tdee: number
  calories: number
  protein: number
  carbs: number
  fats: number
  direction: NutritionDirection
  activityLevel: ActivityLevel
}

/**
 * Full pipeline: body stats + goals → daily calorie & macro targets.
 * Returns null when body stats are too sparse to compute an honest TDEE.
 */
export function computeNutritionTargets(input: TargetsInput): NutritionTargets | null {
  const goals = input.goals?.length ? input.goals : []
  const activityLevel = input.activityLevel ?? activityFromTrainingDays(input.weeklyAvailability)
  const direction = input.direction ?? directionForGoal(goals[0])

  const tdee = calcTdee(input, activityLevel)
  if (tdee === null || !input.currentWeightKg) return null

  // Floor at 1200 — below that the split stops being a sane recommendation.
  const calories = Math.max(1200, Math.round(tdee + DIRECTION_ADJUSTMENT[direction]))

  const weightLbs = input.currentWeightKg * LBS_PER_KG
  const protein = Math.round(weightLbs * proteinPerLb(direction, goals))
  const fats = Math.round((calories * 0.25) / 9)
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fats * 9) / 4))

  return { tdee, calories, protein, carbs, fats, direction, activityLevel }
}

/** Water target in oz — bodyweight-scaled, which is closer than a flat 96. */
export function waterGoalOz(currentWeightKg?: number): number {
  if (!currentWeightKg) return 96
  return Math.round((currentWeightKg * LBS_PER_KG) / 2)
}
