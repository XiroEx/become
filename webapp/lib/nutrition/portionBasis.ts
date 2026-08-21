/**
 * Convert nutrition between a food's STORAGE basis and the PORTION a member is
 * looking at.
 *
 * These are routinely not the same number and treating them as one is what put
 * "457 calories, 34.8 g protein" in front of someone editing a 190-calorie
 * protein bar.
 *
 * Imported catalogue records store nutrition per 100 g with a separate
 * gramsPerServing. The real FitCrunch row is:
 *
 *   basis: 100 g   →  413 cal, 34.8 P, 30.4 C, 17.4 F
 *   gramsPerServing: 46
 *
 * The picker renders that correctly as "1 bar (46 g) · 190 cal", because it
 * scales by 0.46. The correction sheet did not, and prefilled the raw 413 under
 * a heading that read "Per serving" — so the member corrected a basis they were
 * never shown, and their typed numbers were then scaled by 0.46 on the way in.
 *
 * `factor` is storage → portion (0.46 for that bar). Display multiplies by it,
 * storage divides by it.
 */

export interface BasisNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  /**
   * Optional on purpose: callers that never carried fiber (the original
   * calories/protein/carbs/fats-only fixtures) must round-trip through these
   * functions without a `fiber` key appearing in the output, or every
   * `deepEqual` against a 4-key object upstream breaks. A key is only added
   * to the result when the input actually had one — including `0`.
   */
  fiber?: number
}

/** A factor that cannot scale anything sanely means "already the right basis". */
export function safeFactor(factor: number | undefined | null): number {
  return typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : 1
}

/**
 * Storage basis → what the member sees. Rounded to one decimal, which is all a
 * nutrition label ever carries and keeps the field from showing 189.98000000002.
 */
export function toDisplayBasis(n: BasisNutrition, factor: number): BasisNutrition {
  const f = safeFactor(factor)
  const r = (v: number) => Math.round((Number(v) || 0) * f * 10) / 10
  const out: BasisNutrition = { calories: r(n.calories), protein: r(n.protein), carbs: r(n.carbs), fats: r(n.fats) }
  if (n.fiber !== undefined) out.fiber = r(n.fiber)
  return out
}

/**
 * What the member typed → storage basis.
 *
 * Deliberately NOT rounded. Rounding here drifts the number they just typed once
 * it is scaled back for display: 190 / 0.46 = 413.04, and storing 413 renders as
 * 189.98. The storage value is never shown, so its precision costs nothing.
 */
export function toStorageBasis(n: BasisNutrition, factor: number): BasisNutrition {
  const f = safeFactor(factor)
  const v = (x: number) => (Number(x) || 0) / f
  const out: BasisNutrition = { calories: v(n.calories), protein: v(n.protein), carbs: v(n.carbs), fats: v(n.fats) }
  if (n.fiber !== undefined) out.fiber = v(n.fiber)
  return out
}
