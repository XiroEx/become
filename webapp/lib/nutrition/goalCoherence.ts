/**
 * Keep a goals row internally consistent: 4P + 4C + 9F must equal the calorie
 * target, within rounding.
 *
 * PATCH /api/nutrition/goals `$set`s calories, protein, carbs and fats
 * independently, so any caller that sends some of them and not the others
 * leaves a row whose own numbers contradict each other, and nothing notices.
 *
 * That is not hypothetical. A real member's row read 2,214 cal against
 * 232p/174c/77f, which is 2,317 cal of macros — a 103 cal gap baked into the
 * card. The macros were right for his current bodyweight (TDEE 2,818 − 500 =
 * 2,318); the calorie field was stale from ~15 lb earlier. On the dashboard it
 * showed as "266 calories left" beside 378 calories of remaining macros, and
 * looked for all the world like the maths was broken. It was: just not where
 * anyone was looking.
 *
 * The rule below is deliberately simple, because the alternative — deciding
 * WHICH of the two the member meant — is guesswork. Whichever side this request
 * touched is authoritative; the other side is recomputed from it.
 */

/** kcal per gram. */
const KCAL = { protein: 4, carbs: 4, fats: 9 } as const

export interface MacroSet {
  calories: number
  protein: number
  carbs: number
  fats: number
}

/** Calories the macros actually account for. */
export function caloriesFromMacros(m: Pick<MacroSet, 'protein' | 'carbs' | 'fats'>): number {
  return KCAL.protein * (m.protein || 0) + KCAL.carbs * (m.carbs || 0) + KCAL.fats * (m.fats || 0)
}

/**
 * How far apart the two halves are, as a share of the calorie target.
 *
 * Proportional rather than absolute: 30 cal is rounding noise on a 3,000 cal
 * target and a real error on a 900 cal one.
 */
export function incoherence(m: MacroSet): number {
  if (!(m.calories > 0)) return 0
  return Math.abs(caloriesFromMacros(m) - m.calories) / m.calories
}

/**
 * Rounding four numbers to whole grams can shift the total by a few calories,
 * and nobody should be stopped for that. Half a gram of fat is 4.5 cal on its
 * own, so the floor has to sit above the sum of those roundings.
 */
export const COHERENCE_TOLERANCE = 0.02

export function isCoherent(m: MacroSet): boolean {
  return incoherence(m) <= COHERENCE_TOLERANCE
}

export type CoherenceFix = 'none' | 'recomputed_calories' | 'rescaled_macros'

export interface ReconcileResult {
  goals: MacroSet
  fix: CoherenceFix
  /** What the row looked like before, when something changed. */
  was?: MacroSet
}

/**
 * Return a coherent goals row.
 *
 * `touchedMacros` says whether this request set any of protein/carbs/fats.
 * The side the member just edited wins:
 *
 *   they edited macros    -> calories are recomputed from them
 *   they edited calories  -> macros are rescaled to fit, keeping their RATIO
 *
 * Rescaling preserves the split rather than the grams on purpose. Someone who
 * moves from 2,400 to 2,000 calories wants the same style of diet 400 calories
 * smaller, not their old protein target sitting inside a budget that can no
 * longer pay for it.
 */
export function reconcileGoals(next: MacroSet, touchedMacros: boolean): ReconcileResult {
  if (!(next.calories > 0)) return { goals: next, fix: 'none' }
  if (isCoherent(next)) return { goals: next, fix: 'none' }

  const was = { ...next }

  if (touchedMacros) {
    return {
      goals: { ...next, calories: Math.round(caloriesFromMacros(next)) },
      fix: 'recomputed_calories',
      was,
    }
  }

  const current = caloriesFromMacros(next)
  // Nothing to scale — macros are empty or nonsense. Leave them; a later write
  // with real numbers will reconcile properly.
  if (!(current > 0)) return { goals: next, fix: 'none' }

  const k = next.calories / current
  return {
    goals: {
      calories: next.calories,
      protein: Math.round(next.protein * k),
      carbs: Math.round(next.carbs * k),
      fats: Math.round(next.fats * k),
    },
    fix: 'rescaled_macros',
    was,
  }
}
