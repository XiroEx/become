/**
 * ─── Per-serving search-row display (NP-261) ────────────────────────────────
 *
 * The web's `rowCalories` / `preferredServingLabel` / `defaultServingChoice`
 * (`webapp/components/nutrition/FoodSearchModal.tsx:202-232`), ported so a
 * native search row shows the same number and the same serving text.
 *
 * A `Food` row's top-level `nutrition` block is the STORAGE basis — for most
 * USDA/OpenFoodFacts imports that is per 100 g/ml, not per real-world
 * serving. Printing it directly (what `FoodSearchSheet` used to do) is the
 * exact native/web mismatch the card reported: Zest Delites Banana read 348
 * cal natively and 87 cal on the web for the SAME row, because 87 is the
 * calories of its actual "1 medium (118 g)" serving and 348 is the raw
 * per-100 g figure. Scaling through the food's own default serving choice —
 * the same `buildServingChoiceGroups` / `variantForServingChoice` /
 * `nutritionForQuantity` pipeline `QuantityPicker` already previews with —
 * makes the row and the picker agree by construction.
 *
 * The `Food` wire shape types `servingUnit` as a bare `string` (the schema's
 * `z.string()`), while `@become/core`'s serving-option builders narrow it to
 * `ServingUnit`. The cast through `unknown` below is the same trade the rest
 * of the native nutrition code makes at this boundary (see
 * `buildMealItemPayload`'s callers) rather than widening the shared type.
 */
import { nutritionForQuantity } from "@/lib/nutrition/foodMath";
import {
  buildServingChoiceGroups,
  servingChoiceDisplayLabel,
  variantForServingChoice,
  type ServingChoice,
  type ServingOptionVariant,
} from "@/lib/nutrition/servingOptions";
import type { Unit } from "@/lib/nutrition/units";
import type { FoodMacros } from "@/lib/nutrition/mealLogActions";

/** The subset of a search-row `Food` this module reads. */
export interface RowServingSource {
  servingSize?: number;
  servingUnit?: string;
  displayLabel?: string;
  alternateServings?: unknown[];
  gramsPerServing?: number;
  mlPerServing?: number;
  nutrition?: FoodMacros | null;
}

const FALLBACK_CHOICE_ID = "serving-primary";

function asServingOptionVariant(food: RowServingSource): ServingOptionVariant {
  return food as unknown as ServingOptionVariant;
}

/**
 * The serving a row's calorie figure and serving text are both measured
 * against — the food's own default serving when it has one, else a bare
 * `servingSize`/`servingUnit` echo.
 */
export function defaultServingChoice(food: RowServingSource): ServingChoice {
  const servingSize = typeof food.servingSize === "number" ? food.servingSize : 0;
  const servingUnit = food.servingUnit ?? "g";
  const fallback: ServingChoice = {
    id: FALLBACK_CHOICE_ID,
    group: "servings",
    label: food.displayLabel || `${servingSize} ${servingUnit}`,
    quantity: servingSize,
    unit: servingUnit as Unit,
  };
  if (!servingSize || !food.servingUnit) return fallback;
  try {
    const groups = buildServingChoiceGroups(asServingOptionVariant(food));
    return groups.servings[0] ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Per-serving calories for a search row — the web's `rowCalories`. Falls
 * back to the raw stored figure (the old behaviour) only when the row has
 * no resolvable serving at all, so a malformed row still shows a number
 * rather than nothing.
 */
export function rowCalories(food: RowServingSource): number {
  const rawCalories = food.nutrition?.calories ?? 0;
  const choice = defaultServingChoice(food);
  if (!(choice.quantity > 0)) return Math.round(rawCalories);
  try {
    const variant = asServingOptionVariant(food);
    const effective = variantForServingChoice(variant, choice);
    const scaled = nutritionForQuantity(
      {
        ...effective,
        nutrition: food.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 },
      } as unknown as Parameters<typeof nutritionForQuantity>[0],
      choice.quantity,
      choice.unit,
    );
    return Math.round(scaled.calories);
  } catch {
    return Math.round(rawCalories);
  }
}

/** The serving text under a row's name ("1 medium (118 g)", "serving (100 g)"). */
export function preferredServingLabel(food: RowServingSource): string {
  return servingChoiceDisplayLabel(defaultServingChoice(food));
}
