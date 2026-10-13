/**
 * The amount + unit a converted Meal item becomes on its new Recipe
 * ingredient row (`POST /api/meals/[id]/to-recipe`).
 *
 * BUG (Android full pass, build 24f4e34d): the route used `servings` — the
 * SCALING FACTOR against `servingSize`/`servingUnit`, not a display amount —
 * as the ingredient's `amount`, and `servingUnit` alone as its `unit`. A row
 * logged as "1 × 3oz" (`servings: 1`, `servingSize: 3`, `servingUnit: 'oz'`)
 * became "1 oz" on the recipe; "1.5 × 100g" became "1.5 g". The serving SIZE
 * silently vanished from the amount in both cases (calories were unaffected —
 * those scale off `servings` correctly elsewhere).
 *
 * The fix: prefer `loggedQuantity`/`loggedUnit` — what the member actually
 * typed into the quantity picker (`models/Meal.ts`'s own comment: "What the
 * user actually entered in the picker — number + unit") — and fall back to
 * `servings × servingSize` with `servingUnit` for older rows that predate
 * that provenance. Either path now carries the serving SIZE, not just the
 * multiplier.
 *
 * Kept as a pure function so the fix is testable without a database.
 */

const r1 = (n: number) => Math.round(n * 10) / 10

export interface MealItemAmountSource {
  servings?: number
  servingSize?: number
  servingUnit?: string
  loggedQuantity?: number
  loggedUnit?: string
}

export interface RecipeIngredientAmount {
  amount: number
  unit: string
}

export function mealItemToRecipeIngredientAmount(
  item: MealItemAmountSource,
): RecipeIngredientAmount {
  if (typeof item.loggedQuantity === 'number' && item.loggedQuantity > 0) {
    return {
      amount: item.loggedQuantity,
      unit: item.loggedUnit || item.servingUnit || 'serving',
    }
  }
  const servings = typeof item.servings === 'number' && item.servings > 0 ? item.servings : 1
  const servingSize =
    typeof item.servingSize === 'number' && item.servingSize > 0 ? item.servingSize : 1
  return {
    amount: r1(servings * servingSize),
    unit: item.servingUnit || 'serving',
  }
}
