/**
 * Calories for the serving a search row SAYS it is showing.
 *
 * The invariant: whatever `preferredServingLabel` prints, this number must
 * describe. A row reading "1 portion (46 g) · 457 cal" is self-contradictory,
 * and that is precisely what shipped — the label came from one signal and the
 * calories from another.
 *
 * How a food expresses "one real serving" depends on where it came from:
 *
 *   our own catalogue  — nutrition per serving, or per 100 g with an explicit
 *                        gramsPerServing / mlPerServing bridge.
 *   Open Food Facts    — ALWAYS per 100 g, with the real serving carried in
 *                        alternateServings[0].multiplier and displayLabel. The
 *                        OFF mapper never sets gramsPerServing (see
 *                        app/api/nutrition/foods/route.ts, where it pushes
 *                        { label, multiplier: actualGrams / 100 }).
 *
 * The old row logic only understood the bridge, so every OFF result rendered its
 * per-100 g calories beside a label describing a much smaller portion. FitCrunch
 * Mint Chocolate Chip: "1 portion (46 g)" next to 457 cal, where the expanded
 * picker — which does read alternateServings — correctly said 210.
 */

export interface RowServingInput {
  servingSize?: number
  servingUnit?: string
  gramsPerServing?: number | null
  mlPerServing?: number | null
  displayLabel?: string | null
  alternateServings?: ({ label?: string; multiplier?: number } | null)[] | null
  nutrition?: { calories?: number } | null
}

/**
 * How much of the stored basis one displayed serving is.
 *
 * Branch order mirrors how the serving is expressed, most explicit first. A
 * bridge is a direct statement of grams-per-serving, so it outranks the
 * alternate-serving multiplier, which is the only signal OFF gives us.
 */
export function displayServingScale(food: RowServingInput): number {
  const size = Number(food?.servingSize) || 0
  if (size <= 0) return 1

  const grams = Number(food?.gramsPerServing)
  if (food?.servingUnit === 'g' && grams > 0 && Math.abs(grams - size) > 0.001) {
    return grams / size
  }

  const ml = Number(food?.mlPerServing)
  if (food?.servingUnit === 'ml' && ml > 0 && Math.abs(ml - size) > 0.001) {
    return ml / size
  }

  // No bridge. The first alternate serving is what the picker's primary chip
  // uses and what the label falls back to, so the number has to follow it.
  const alt = food?.alternateServings?.[0]
  const mult = Number(alt?.multiplier)
  if (alt && Number.isFinite(mult) && mult > 0 && Math.abs(mult - 1) > 0.001) {
    return mult
  }

  return 1
}

/** Calories for one displayed serving. Never throws on a half-built row. */
export function displayServingCalories(food: RowServingInput): number {
  const per = Number(food?.nutrition?.calories)
  if (!Number.isFinite(per)) return 0
  return per * displayServingScale(food)
}
