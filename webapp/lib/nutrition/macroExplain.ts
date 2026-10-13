/**
 * "Why is my protein 348 g?"
 *
 * Every number on the targets card is the end of a short chain of arithmetic,
 * and a member who cannot see that chain has no way to tell a considered target
 * from a random one. A large number with no explanation reads as a bug, and the
 * rational response to a number you think is a bug is to ignore it — which is
 * how someone quietly stops trusting the whole plan.
 *
 * So this module reconstructs the arithmetic, in the member's own numbers, for
 * calories and for each macro.
 *
 * It also tells the truth when a figure is outside what the app itself considers
 * useful. A percentage split has no idea how much the member weighs: 40% of
 * 3,480 cal is 348 g of protein whether they are 150 lb or 350 lb. That is not a
 * calculation error — 40% really is 40% — but presenting it as "what you need"
 * would be wrong, because this app's own anchor (proteinPerLb) tops out at
 * 1.0 g/lb. Calling that out is the honest move, and it is not the same as
 * capping it: a hard 250 g ceiling used to live in tdee.ts and had to be removed
 * because it silently overrode whichever split the member picked, leaving the
 * ratio picker visibly broken. Explain, flag, offer — never quietly override.
 */

import {
  ACTIVITY_MULTIPLIERS,
  ACTIVITY_LABELS,
  calorieAdjustment,
  proteinPerLb,
  type ActivityLevel,
  type BiologicalSex,
  type BodyStats,
  type FitnessGoal,
  type NutritionDirection,
} from './tdee'

export type MacroKey = 'protein' | 'carbs' | 'fats'

/** kcal per gram. Fat is the dense one, which is why its gram number looks small. */
export const KCAL_PER_G: Record<MacroKey, number> = { protein: 4, carbs: 4, fats: 9 }

export const MACRO_LABELS: Record<MacroKey, string> = {
  protein: 'Protein',
  carbs: 'Carbs',
  fats: 'Fats',
}

/** One line of shown work: what happened, and what it produced. */
export interface CalcStep {
  label: string
  detail: string
  value: string
}

export interface MacroNote {
  /** `caution` means the number is real but outside what we would recommend. */
  tone: 'info' | 'caution'
  text: string
}

export interface MacroExplanation {
  macro: MacroKey
  grams: number
  percentOfCalories: number
  caloriesFromMacro: number
  steps: CalcStep[]
  /** Protein only: grams per lb of bodyweight, the figure that actually matters. */
  perLb?: number
  note?: MacroNote
}

export interface CalorieExplanation {
  bmr: number
  tdee: number
  calories: number
  steps: CalcStep[]
}

const round1 = (n: number) => Math.round(n * 10) / 10
const lbsFromKg = (kg: number) => kg * 2.20462

/**
 * The evidence-backed ceiling on USEFUL protein, in g per lb of bodyweight.
 *
 * Above roughly this, the extra grams are not harmful, they simply stop doing
 * anything for muscle: they get used for energy like any other calorie. It sits
 * a little above this app's own 0.8-1.0 anchor so that being marginally over
 * does not trigger a warning — we only speak up when the gap is large enough
 * that a member would struggle to eat it and get nothing back for trying.
 */
export const USEFUL_PROTEIN_CEILING_PER_LB = 1.2

const SEX_CONSTANT: Record<BiologicalSex, number> = {
  male: 5,
  female: -161,
  prefer_not_to_say: -78,
}

/**
 * Rebuild the calorie chain: Mifflin-St Jeor, then activity, then the goal
 * adjustment. Returns null when we could not have computed a target either.
 */
export function explainCalories(
  stats: BodyStats,
  activityLevel: ActivityLevel,
  direction: NutritionDirection,
  /** The member's chosen weekly rate (kg/week), from their active Goal. */
  paceKgPerWeek?: number,
): CalorieExplanation | null {
  const { currentWeightKg, heightCm, age, biologicalSex } = stats
  if (!currentWeightKg || !heightCm || !age || !biologicalSex) return null

  const bmr = Math.round(
    10 * currentWeightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANT[biologicalSex],
  )
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel]
  const tdee = Math.round(bmr * multiplier)
  // calorieAdjustment, NOT the raw DIRECTION_ADJUSTMENT constant: those are
  // ceilings, scaled down to a share of TDEE for smaller members (or to the
  // member's own chosen pace when one is passed). Reading the constant would
  // explain a deficit they were never actually given.
  const adjustment = calorieAdjustment(tdee, direction, paceKgPerWeek ? lbsFromKg(paceKgPerWeek) : undefined)
  const calories = Math.round(tdee + adjustment)

  const steps: CalcStep[] = [
    {
      label: 'Resting burn (BMR)',
      detail:
        'Mifflin-St Jeor, from your weight, height, age and sex. What you would burn doing nothing at all.',
      value: `${bmr.toLocaleString()} cal`,
    },
    {
      label: 'Everything you do',
      detail: `${ACTIVITY_LABELS[activityLevel]} — we multiply by ${multiplier}.`,
      value: `${tdee.toLocaleString()} cal`,
    },
  ]

  if (adjustment !== 0) {
    steps.push({
      label: adjustment < 0 ? 'Deficit for fat loss' : 'Surplus to build',
      detail:
        adjustment < 0
          ? `${Math.abs(adjustment)} cal below what you burn — roughly ${round1((Math.abs(adjustment) * 7) / 3500)} lb a week.` +
            (Math.abs(adjustment) < 500 ? ' Held to 20% of your burn so the cut stays sustainable.' : '')
          : `${adjustment} cal above what you burn. Enough to build with, small enough to limit fat gain.`,
      value: `${adjustment > 0 ? '+' : '−'}${Math.abs(adjustment)} cal`,
    })
  } else {
    steps.push({
      label: 'Holding steady',
      detail: 'No adjustment — this is what you burn.',
      value: '±0 cal',
    })
  }

  steps.push({
    label: 'Your daily target',
    detail: 'What the macros below are divided out of.',
    value: `${calories.toLocaleString()} cal`,
  })

  return { bmr, tdee, calories, steps }
}

export interface MacroExplainInput {
  macro: MacroKey
  grams: number
  /** Daily calorie target the split was applied to. */
  calories: number
  /** The split percentage for this macro. */
  percent: number
  /** Needed for the protein reality check. */
  weightKg?: number
  direction: NutritionDirection
  goals?: FitnessGoal[]
  /** Shown so the member can see WHICH choice produced this ratio. */
  presetLabel?: string
}

/**
 * Show the work for one macro, and for protein add the check that actually
 * matters: grams per lb of bodyweight.
 */
export function explainMacro(input: MacroExplainInput): MacroExplanation {
  const { macro, grams, calories, percent, direction } = input
  const kcalPerG = KCAL_PER_G[macro]
  const caloriesFromMacro = Math.round((calories * percent) / 100)

  const steps: CalcStep[] = [
    {
      label: input.presetLabel ? `${input.presetLabel}: ${percent}% ${macro}` : `${percent}% of your calories`,
      detail: `${percent}% of ${calories.toLocaleString()} cal.`,
      value: `${caloriesFromMacro.toLocaleString()} cal`,
    },
    {
      label: 'Into grams',
      detail:
        macro === 'fats'
          ? `Fat carries ${kcalPerG} cal per gram — more than twice protein or carbs, which is why this number looks small.`
          : `${MACRO_LABELS[macro]} carries ${kcalPerG} cal per gram.`,
      value: `${caloriesFromMacro.toLocaleString()} ÷ ${kcalPerG} = ${grams} g`,
    },
  ]

  const out: MacroExplanation = {
    macro,
    grams,
    percentOfCalories: percent,
    caloriesFromMacro,
    steps,
  }

  if (macro !== 'protein' || !input.weightKg) return out

  // The reality check. A percentage split cannot see bodyweight, so this is the
  // only place the number gets compared against the member's actual body.
  const lbs = lbsFromKg(input.weightKg)
  const perLb = round1(grams / lbs)
  const anchor = proteinPerLb(direction, input.goals ?? [])
  out.perLb = perLb

  steps.push({
    label: 'Against your bodyweight',
    detail: `${grams} g spread over ${Math.round(lbs)} lb of you. Most people building or holding muscle do well between ${anchor} and ${USEFUL_PROTEIN_CEILING_PER_LB} g per lb.`,
    value: `${perLb} g / lb`,
  })

  if (perLb > USEFUL_PROTEIN_CEILING_PER_LB) {
    const enough = Math.round(lbs * anchor)
    out.note = {
      tone: 'caution',
      text:
        `That is more protein than you need. The maths is right — ${percent}% of ${calories.toLocaleString()} cal really is ${grams} g — ` +
        `but a percentage does not know what you weigh, and past about ${USEFUL_PROTEIN_CEILING_PER_LB} g per lb the extra grams stop building anything ` +
        `and just get burned like any other calorie. Around ${enough} g would do the same job and is far easier to eat. ` +
        `Nothing is broken if you keep this — it is just a harder plan for no extra result.`,
    }
  } else if (perLb < anchor - 0.15) {
    out.note = {
      tone: 'caution',
      text:
        `This is on the low side for your goal. Around ${Math.round(lbs * anchor)} g would protect your muscle better` +
        `${direction === 'lose' ? ', which matters most while you are eating below what you burn' : ''}.`,
    }
  } else {
    out.note = {
      tone: 'info',
      text: 'This lands right where it should for your bodyweight and goal.',
    }
  }

  return out
}

/**
 * Should the targets card flag protein before anyone taps anything?
 *
 * The member most likely to be alarmed is the one who never opens the
 * explanation, so the card itself has to speak first.
 */
export function proteinNeedsFlag(
  grams: number,
  weightKg: number | undefined,
  direction: NutritionDirection,
  goals: FitnessGoal[] = [],
): boolean {
  if (!weightKg || !(grams > 0)) return false
  const perLb = grams / lbsFromKg(weightKg)
  return perLb > USEFUL_PROTEIN_CEILING_PER_LB || perLb < proteinPerLb(direction, goals) - 0.15
}
