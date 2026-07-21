/**
 * Physically-plausible per-100 calorie value for an OpenFoodFacts nutriments
 * blob. OFF's `energy_kcal_100g` is frequently corrupt — a bad serving_size
 * (e.g. "1.0g") makes it come out 100x+ too large (18000 kcal/100g for a hotdog
 * bun). No real food exceeds ~900 kcal/100 g (pure fat = 900). When the stored
 * value is impossible we recompute from Atwater (4·P + 4·C + 9·F); if the macros
 * can't yield a plausible value either, we return 0 rather than surface garbage.
 *
 * Used by both the supplemental OFF search mapper and the OFF import path so a
 * corrupt mirror value can never reach a user-facing calorie again.
 */
export function plausibleOffKcal(
  n:
    | {
        energy_kcal_100g?: number | null
        proteins_100g?: number | null
        carbohydrates_100g?: number | null
        fat_100g?: number | null
      }
    | null
    | undefined,
): number {
  if (!n) return 0
  const stored = Number(n.energy_kcal_100g)
  if (isFinite(stored) && stored > 0 && stored <= 950) return Math.round(stored)
  const p = Number(n.proteins_100g) || 0
  const c = Number(n.carbohydrates_100g) || 0
  const f = Number(n.fat_100g) || 0
  const atwater = 4 * p + 4 * c + 9 * f
  if (atwater > 0 && atwater <= 950 && p <= 100 && c <= 100 && f <= 100) return Math.round(atwater)
  return 0
}
