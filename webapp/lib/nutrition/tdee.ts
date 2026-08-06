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
 *
 * Unit conversion lives in lib/bodyUnits.ts — this module only ever sees kg/cm.
 */

import { LBS_PER_KG } from '@/lib/bodyUnits'

export type NutritionDirection = 'lose' | 'maintain' | 'gain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say'
export type FitnessGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'improve_performance'
  | 'general_health'

/** Declared locally to keep this module free of model imports. */
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'

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

/**
 * Calorie delta applied to TDEE for each direction.
 *
 * These are CEILINGS, not fixed amounts — see calorieAdjustment(). A flat 500 is
 * ~17% of a 2,940 TDEE but ~30% of a 1,667 one, so the same constant that is a
 * sensible cut for a tall man is an aggressive crash diet for a small woman, and
 * it drove her straight into the 1,200 floor.
 */
export const DIRECTION_ADJUSTMENT: Record<NutritionDirection, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
}

/** Deficit/surplus as a share of TDEE, so the delta scales with the person. */
const MAX_DEFICIT_PCT = 0.20
const MAX_SURPLUS_PCT = 0.15

/**
 * The calorie delta for this member: the smaller of the flat cap and a
 * proportional share of their own TDEE. Large members are unaffected (their
 * percentage exceeds the cap); small members stop being handed a 30% cut.
 */
export function calorieAdjustment(tdee: number, direction: NutritionDirection): number {
  if (direction === 'maintain') return 0
  if (direction === 'lose') return -Math.min(500, Math.round(tdee * MAX_DEFICIT_PCT))
  return Math.min(300, Math.round(tdee * MAX_SURPLUS_PCT))
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
  if (!currentWeightKg || !heightCm || !age || !biologicalSex) return null

  // Mifflin-St Jeor's sex constant. "Prefer not to say" used to return null,
  // which meant declining to state it produced NO targets at all — and since
  // nothing is seeded in that case, the member silently inherited the hardcoded
  // 2000/150/200/65 defaults. The midpoint of the two constants is a far better
  // answer than a number invented for someone else, and it is bounded: the worst
  // case is ~83 cal of BMR, well inside the error of the equation itself.
  const sexAdjust =
    biologicalSex === 'male' ? 5 : biologicalSex === 'female' ? -161 : -78

  return 10 * currentWeightKg + 6.25 * heightCm - 5 * age + sexAdjust
}

export function calcTdee(stats: BodyStats, activityLevel: ActivityLevel): number | null {
  const bmr = calcBmr(stats)
  if (bmr === null) return null
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel])
}

/**
 * Protein FLOOR in grams per lb of bodyweight — the physiological anchor.
 * Higher in a deficit (protein preserves lean mass when calories are low) and
 * when muscle gain is anywhere in the member's goal set.
 *
 * This is a floor, not the target: the split below sets the target as a share of
 * calories and this stops a large calorie number diluting protein away.
 */
function proteinPerLb(direction: NutritionDirection, goals: FitnessGoal[]): number {
  const wantsMuscle = goals.includes('gain_muscle')
  if (direction === 'lose') return 1.0
  if (direction === 'gain') return 0.9
  return wantsMuscle ? 0.9 : 0.8
}

/**
 * Bands the RECOMMENDED split is allowed to personalise within. These bound a
 * PERCENTAGE, never a gram figure.
 *
 * There used to be a hard 250 g protein ceiling here. It had to go: it silently
 * overrode whichever split the member chose, so at 3,384 cal both "High Protein"
 * (40%) and "Lower Carb" (35%) delivered exactly 250 g — the picker looked
 * broken because, for protein, it was. Picking a ratio has to move the ratio.
 *
 * Bounding the percentage instead keeps every preset honest: 40% of calories is
 * 40% of calories at any bodyweight, and the only thing clamped is how far
 * "Recommended" will personalise away from a sensible middle.
 */
const RECOMMENDED_PROTEIN_PCT = { min: 25, max: 40 }
const RECOMMENDED_CARB_PCT = { min: 25, max: 50 }

// ─── Macro splits ─────────────────────────────────────────────────────────────
//
// WHY PERCENTAGES. Macros used to be: protein from g/lb, fat a flat 25% of
// calories, and carbs whatever was left over. Carbs were never targeted — they
// absorbed the entire remainder — so a tall member on a surplus was handed 453g
// of carbs (56% of intake) while protein sat at 19%. The bigger the calorie
// target, the worse it got.
//
// Now every macro is an explicit share of calories. Protein is still anchored to
// bodyweight via a floor and a cap, so the percentage can never produce an
// unphysiological gram figure in either direction.

export type MacroPreset = 'recommended' | 'balanced' | 'high_protein' | 'low_carb' | 'custom'

export interface MacroSplit {
  protein: number
  carbs: number
  fats: number
}

/** Fixed splits the member can pick explicitly. Percentages of total calories. */
export const MACRO_PRESET_SPLITS: Record<'balanced' | 'high_protein' | 'low_carb', MacroSplit> = {
  balanced: { protein: 30, carbs: 40, fats: 30 },
  high_protein: { protein: 40, carbs: 30, fats: 30 },
  low_carb: { protein: 35, carbs: 25, fats: 40 },
}

/** What 'recommended' means for each calorie direction. */
export const RECOMMENDED_SPLITS: Record<NutritionDirection, MacroSplit> = {
  // Deficit: protein up to hold lean mass, carbs down.
  lose: { protein: 35, carbs: 35, fats: 30 },
  maintain: { protein: 30, carbs: 40, fats: 30 },
  // Surplus: carbs fuel the training that drives the gain, but nowhere near the
  // 56% the old remainder-based maths produced.
  gain: { protein: 27, carbs: 45, fats: 28 },
}

/**
 * NOTE ON THE `recommended` KEY. It is shown to members as **"Custom"**, because
 * that is what it is — a split computed from their body, goal and activity, not
 * a preset. The key keeps its old name because it is already persisted on
 * existing profiles and stored NutritionGoals; renaming it would orphan
 * everyone's saved choice for a cosmetic win.
 *
 * "Recommended" is no longer a preset name at all. It is a BADGE that moves
 * between options depending on the member — see recommendPreset().
 */
export const MACRO_PRESET_LABELS: Record<MacroPreset, string> = {
  recommended: 'Custom',
  balanced: 'Balanced',
  high_protein: 'High Protein',
  low_carb: 'Lower Carb',
  // Hand-typed numbers. Renamed off "Custom" so it can't be confused with the
  // computed split above.
  custom: 'Manual',
}

/** One-line rationale shown next to each option. */
export const MACRO_PRESET_BLURBS: Record<MacroPreset, string> = {
  recommended: 'Built from your body, goal and activity.',
  balanced: 'An even 30/40/30. Works for most people.',
  high_protein: 'More protein, fewer carbs. Good when building or holding muscle.',
  low_carb: 'Carbs down, fats up. For people who feel better eating this way.',
  custom: 'Set every number yourself.',
}

/** What the personalised "Recommended" split needs to know about the member. */
export interface RecommendedContext {
  weightLbs: number
  calories: number
  goals?: FitnessGoal[]
}

/**
 * "Recommended" is the personalised one — the whole point of collecting
 * bodyweight, goal, direction and activity.
 *
 * It used to be a fixed per-direction table, which meant that at `maintain` it
 * resolved to 30/40/30 — byte-identical to "Balanced". Two of the four options
 * were the same option wearing different names.
 *
 * Now protein is anchored to what THIS member's bodyweight and goal call for,
 * converted into a percentage of THEIR calorie target, and bounded so it stays
 * a sane recommendation at both extremes: a light member on a big surplus can't
 * be handed 15% protein, and a heavy member in a deficit can't be handed 50%.
 * Carbs take what is left after a direction-appropriate fat share, bounded so we
 * never return to the 56%-carb blowout that started all of this.
 */
export function recommendedSplit(
  direction: NutritionDirection,
  ctx: RecommendedContext,
): MacroSplit {
  const goals = ctx.goals ?? []
  if (!(ctx.calories > 0) || !(ctx.weightLbs > 0)) return RECOMMENDED_SPLITS[direction]

  const proteinG = ctx.weightLbs * proteinPerLb(direction, goals)
  const protein = clamp(
    Math.round(((proteinG * 4) / ctx.calories) * 100),
    RECOMMENDED_PROTEIN_PCT.min,
    RECOMMENDED_PROTEIN_PCT.max,
  )

  // Fat is the steady one — enough for hormones, not so much that it crowds out
  // the carbs that fuel training. A surplus leans slightly more on carbs.
  const fatsTarget = direction === 'gain' ? 27 : 30

  let carbs = clamp(100 - protein - fatsTarget, RECOMMENDED_CARB_PCT.min, RECOMMENDED_CARB_PCT.max)
  // Whatever the carb bound gave or took comes out of fat, so the three always
  // sum to exactly 100 and the label can never disagree with the grams.
  const fats = 100 - protein - carbs

  return { protein, carbs, fats }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * The split a preset resolves to.
 *
 * Pass `ctx` to get the personalised Recommended split; without it, Recommended
 * falls back to the static per-direction table (used where the member's body
 * stats aren't to hand).
 */
export function splitForPreset(
  preset: MacroPreset,
  direction: NutritionDirection,
  ctx?: RecommendedContext,
): MacroSplit {
  if (preset === 'recommended' || preset === 'custom') {
    return ctx ? recommendedSplit(direction, ctx) : RECOMMENDED_SPLITS[direction]
  }
  return MACRO_PRESET_SPLITS[preset]
}

/**
 * Which preset to put a "Recommended for you" badge on, from the member's goal.
 * Building muscle leans high-protein; everything else takes the goal-tuned
 * default.
 */
export function recommendedPresetForGoal(
  direction: NutritionDirection,
  goals: FitnessGoal[] = [],
): MacroPreset {
  if (goals.includes('gain_muscle') && direction !== 'lose') return 'high_protein'
  if (direction === 'lose') return 'high_protein'
  return 'recommended'
}

export interface PresetRecommendation {
  /** Which option carries the badge. */
  preset: MacroPreset
  /** Short badge text on the card. */
  badge: string
  /** One line under the picker explaining the pick. */
  why: string
}

/**
 * Which option to badge as recommended, and why.
 *
 * Experience gates how demanding the recommendation is allowed to be, because
 * an accurate target and an achievable one are not the same thing. The custom
 * split for a very overweight beginner is arithmetically right and can still be
 * 400 g of protein — a number they have no idea how to hit, and which reads as
 * "this isn't for me" on day one. Beginners are pointed at Balanced so their
 * first target is one they can actually meet; the demanding splits stay one tap
 * away for when they want them.
 *
 * Goal picks between the demanding options once experience says they're ready.
 */
export function recommendPreset(
  direction: NutritionDirection,
  goals: FitnessGoal[] = [],
  experience?: ExperienceLevel,
): PresetRecommendation {
  // Unknown experience is treated as beginner on purpose: the gentler target is
  // the safer thing to hand someone we know nothing about.
  if (!experience || experience === 'beginner') {
    return {
      preset: 'balanced',
      badge: 'Start here',
      why: 'A split you can actually hit while the habit is still forming. You can move to a sharper one whenever you want.',
    }
  }

  const wantsMuscle = goals.includes('gain_muscle')
  if (experience === 'advanced' && (wantsMuscle || direction === 'lose')) {
    return {
      preset: 'high_protein',
      badge: 'For your goal',
      why: wantsMuscle
        ? 'Protein leads when the goal is building muscle.'
        : 'Protein leads in a deficit — it is what protects muscle while you lose fat.',
    }
  }

  return {
    preset: 'recommended',
    badge: 'For you',
    why: 'Worked out from your bodyweight, your goal and how active your day is.',
  }
}

export interface TargetsInput extends BodyStats {
  /** Ordered goals — index 0 is primary. A single goal is fine. */
  goals?: FitnessGoal[]
  direction?: NutritionDirection
  activityLevel?: ActivityLevel
  /** Used to derive activityLevel when one isn't passed explicitly. */
  weeklyAvailability?: number
  /** Which macro split to apply. Defaults to 'recommended'. */
  macroPreset?: MacroPreset
}

export interface NutritionTargets {
  tdee: number
  calories: number
  protein: number
  carbs: number
  fats: number
  direction: NutritionDirection
  activityLevel: ActivityLevel
  /** The split actually applied, as percentages of calories. Handy for the UI
   *  and for asserting the result is sane. */
  split: MacroSplit
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
  const calories = Math.max(1200, Math.round(tdee + calorieAdjustment(tdee, direction)))

  const weightLbs = input.currentWeightKg * LBS_PER_KG
  const target = splitForPreset(input.macroPreset ?? 'recommended', direction, {
    weightLbs,
    calories,
    goals,
  })

  // THE SPLIT IS THE ANSWER. Each macro is simply its own share of the calorie
  // target — no floors, no ceilings, no remainder redistribution.
  //
  // This is the fix for the picker looking dead: protein used to be clamped
  // between a bodyweight floor and a hard 250 g ceiling AFTER the split had been
  // applied, so at 3,384 cal "High Protein" (40% = 338 g) and "Lower Carb"
  // (35% = 296 g) both came out at exactly 250 g. The leftover was then handed
  // back to carbs and fat, which quietly rewrote the ratio the member picked
  // into something else entirely. Choosing 40/30/30 now yields 40/30/30.
  const protein = Math.round((calories * target.protein) / 100 / 4)
  let carbs = Math.round((calories * target.carbs) / 100 / 4)
  let fats = Math.round((calories * target.fats) / 100 / 9)

  // Guard rail: keep carbs workable, buying the difference back from fat. With
  // explicit percentages this only binds on a very low calorie target.
  const MIN_CARBS = 50
  if (carbs < MIN_CARBS) {
    const deficitCal = (MIN_CARBS - carbs) * 4
    fats = Math.max(20, Math.round(fats - deficitCal / 9))
    carbs = MIN_CARBS
  }

  const pct = (grams: number, kcalPerG: number) => Math.round(((grams * kcalPerG) / calories) * 100)
  const split: MacroSplit = {
    protein: pct(protein, 4),
    carbs: pct(carbs, 4),
    fats: pct(fats, 9),
  }

  return { tdee, calories, protein, carbs, fats, direction, activityLevel, split }
}

/** Water target in oz — bodyweight-scaled, which is closer than a flat 96. */
export function waterGoalOz(currentWeightKg?: number): number {
  if (!currentWeightKg) return 96
  return Math.round((currentWeightKg * LBS_PER_KG) / 2)
}
