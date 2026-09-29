/**
 * Variant-aware food scaling for the native log, mirroring the web's
 * `webapp/lib/foodMath.ts` + `webapp/lib/units.ts` for the one case the native
 * screens need: "how many of this variant's SERVINGS is the amount the member
 * picked?".
 *
 * The native screens used to treat every food's nutrition block as per-100 g
 * and multiply by `grams / 100`. Nutrition is stored PER SERVING of the
 * default variant (`servingSize` × `servingUnit`), so a bar whose serving is
 * "1 each (60 g)" logged 1/100th of itself, and a chip bag stored per 100 g
 * with a 38 g portion logged the wrong amount in the other direction.
 *
 * Two different numbers come out of one variant and they are NOT the same:
 *
 *   - `perServing` — the amount that scales the stored nutrition by exactly 1.
 *     For a mass-native variant that is its own `servingSize` in grams (an OFF
 *     import is per 100 g even when a portion is 38 g); for a count-native one
 *     ("1 bar") it is the `gramsPerServing` bridge.
 *   - `portion`    — what a member means by "a serving": `gramsPerServing`
 *     when the food declares one, else the serving itself. This is what the
 *     picker defaults to, exactly like the web's picker.
 */

import type { FoodNutrition as PickerNutrition } from "@/lib/nutrition/servingMath";

export interface FoodMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  saturatedFat?: number;
}

/** The fields of a Food variant the scaling math actually reads. */
export interface FoodVariantMath {
  name?: string;
  servingSize: number;
  servingUnit: string;
  gramsPerServing?: number;
  mlPerServing?: number;
  nutrition: FoodMacros;
}

export interface ServingBasis {
  /** The unit the member's amount is measured in. */
  unit: "g" | "serving";
  /** Amount of `unit` whose nutrition IS the variant's stored block. */
  perServing: number;
  /** Amount of `unit` in one real-world portion — the picker's default. */
  portion: number;
  /** Label for that portion ("38 g", "1 each (60 g)"). */
  label: string;
}

/** Grams per unit of mass — the subset of webapp/lib/units.ts we need. */
const GRAMS_PER_UNIT: Record<string, number> = {
  mg: 0.001,
  g: 1,
  gram: 1,
  grams: 1,
  oz: 28.3495,
  lb: 453.592,
  kg: 1000,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function macrosOf(value: unknown): FoodMacros | null {
  const n = asRecord(value);
  if (!n) return null;
  return {
    calories: num(n.calories) ?? 0,
    protein: num(n.protein) ?? 0,
    carbs: num(n.carbs) ?? 0,
    fats: num(n.fats) ?? 0,
    fiber: num(n.fiber),
    sugar: num(n.sugar),
    sodium: num(n.sodium),
    saturatedFat: num(n.saturatedFat),
  };
}

function normalizeUnit(unit: string | undefined): string {
  return (unit ?? "").toLowerCase().trim();
}

function variantFromRecord(
  rec: Record<string, unknown>,
): FoodVariantMath | null {
  const servingSize = num(rec.servingSize);
  const nutrition = macrosOf(rec.nutrition);
  if (servingSize == null || servingSize <= 0 || !nutrition) return null;
  return {
    name: str(rec.name),
    servingSize,
    servingUnit: str(rec.servingUnit) ?? "g",
    gramsPerServing: num(rec.gramsPerServing),
    mlPerServing: num(rec.mlPerServing),
    nutrition,
  };
}

/**
 * The default variant of a food — either from `variants[]` or from the
 * flattened top-level fields the API mirrors it into
 * (`webapp/lib/foodImport.ts#flattenFoodForResponse`). Accepts `unknown`
 * because the shared schemas keep these fields in the passthrough bag.
 */
export function defaultVariantOf(food: unknown): FoodVariantMath | null {
  const rec = asRecord(food);
  if (!rec) return null;
  const variants = Array.isArray(rec.variants) ? rec.variants : [];
  const chosenRaw =
    variants.find((v) => asRecord(v)?.isDefault === true) ?? variants[0];
  const chosen = asRecord(chosenRaw);
  // A variant is taken whole — never mixed with the top level, which could
  // pair one variant's nutrition with another's bridge.
  if (chosen) {
    const fromVariant = variantFromRecord(chosen);
    if (fromVariant) return fromVariant;
  }
  return variantFromRecord(rec);
}

/**
 * Grams whose nutrition is exactly the variant's stored block, or null when
 * the food has no weight we can reconcile (a count unit with no bridge, a
 * volume-native food). Mirrors `scalingFactor(variant, grams, 'g')`.
 */
export function gramsPerVariantServing(
  variant: FoodVariantMath,
): number | null {
  const gramsPer = GRAMS_PER_UNIT[normalizeUnit(variant.servingUnit)];
  if (gramsPer != null) return variant.servingSize * gramsPer;
  const bridge = variant.gramsPerServing;
  if (bridge != null && bridge > 0) return bridge;
  return null;
}

/** Grams in ONE real-world portion of the variant (the web's `realServing`). */
export function portionGrams(variant: FoodVariantMath): number | null {
  const bridge = variant.gramsPerServing;
  if (bridge != null && bridge > 0) return bridge;
  return gramsPerVariantServing(variant);
}

function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function portionLabel(variant: FoodVariantMath, grams: number | null): string {
  const unit = normalizeUnit(variant.servingUnit);
  if (grams == null) {
    return `${formatAmount(variant.servingSize)} ${variant.servingUnit}`;
  }
  if (GRAMS_PER_UNIT[unit] != null) return `${formatAmount(grams)} g`;
  return `${formatAmount(variant.servingSize)} ${variant.servingUnit} (${formatAmount(grams)} g)`;
}

/**
 * How the member's amount is measured for this variant. Foods with a weight
 * are picked in grams; a count-native food with no gram bridge falls back to
 * counting servings, which is the only honest unit left for it.
 */
export function servingBasis(variant: FoodVariantMath): ServingBasis {
  const perServing = gramsPerVariantServing(variant);
  if (perServing != null && perServing > 0) {
    const portion = portionGrams(variant) ?? perServing;
    return {
      unit: "g",
      perServing,
      portion,
      label: portionLabel(variant, portion),
    };
  }
  return {
    unit: "serving",
    perServing: 1,
    portion: 1,
    label: portionLabel(variant, null),
  };
}

/**
 * Multiplier on the variant's stored (per-serving) nutrition for `amount`
 * units of the basis. 0 for a non-positive or unusable amount.
 */
export function servingsForAmount(basis: ServingBasis, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(basis.perServing) || basis.perServing <= 0) return 0;
  return amount / basis.perServing;
}

/**
 * The per-100-units view the grams-based ServingPicker previews with. The
 * picker multiplies by `amount / 100`, so feeding it the variant's nutrition
 * expressed per 100 basis units makes its preview equal
 * `nutrition × servingsForAmount(basis, amount)`.
 */
export function per100Units(
  nutrition: FoodMacros,
  unitsPerServing: number,
): PickerNutrition {
  const factor =
    Number.isFinite(unitsPerServing) && unitsPerServing > 0
      ? 100 / unitsPerServing
      : 0;
  return {
    kcalPer100g: nutrition.calories * factor,
    proteinPer100g: nutrition.protein * factor,
    carbsPer100g: nutrition.carbs * factor,
    fatPer100g: nutrition.fats * factor,
  };
}
