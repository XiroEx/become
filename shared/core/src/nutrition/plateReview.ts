import type { ServingUnit } from './types'
import type { PlateEstimate, EstimatedPlateItem } from './types'
import type { IFoodEntry } from './types'
import type { QuantityPickerVariant } from './types'
import { scalingFactor } from '../foodMath'
import { buildServingChoiceGroups } from './servingOptions'
import { parseQuantityString, type Unit } from '../units'

// ── Types ────────────────────────────────────────────────────────────────────

/** A confident match against something we already have in the DB. */
export interface DbMatch {
  kind: 'food' | 'meal' | 'recipe'
  id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  nutrition: { calories: number; protein: number; carbs: number; fats: number }
  source: string
  confidence: number
  /** Bridges + friendly label for unit-accurate alignment of the AI quantity. */
  gramsPerServing?: number
  mlPerServing?: number
  displayLabel?: string
  /** The food's named alternate servings — feeds the serving-size dropdown. */
  alternateServings?: Array<{ label: string; multiplier: number }>
}

export interface ReviewItem extends EstimatedPlateItem {
  /** Amount eaten = `multiplier` of `unitLabel` (e.g. 2 kiwis, 150 g). `nutrition`
   *  is per ONE `unitLabel`. We show real amounts, never an abstract "× serving". */
  multiplier: number
  /** The natural unit a count is expressed in: a household unit (kiwi, bottle,
   *  bite, slice, cup, tbsp) or a mass/volume unit (g, ml, oz). */
  unitLabel: string
  /** Excluded by the user before logging. */
  removed: boolean
  /** Brand, when we matched the item to a branded DB food. */
  brand?: string
  /** Set once we've reconciled this item against the DB (foods/meals/recipes). */
  matchChecked?: boolean
  /** The DB item this maps to, or null when it's genuinely new (AI estimate). */
  match?: DbMatch | null
  /** A freeform friendly label the user typed (overrides the computed amount).
   *  Cleared when the user changes the count, so it never goes stale. */
  labelOverride?: string
  /** True when the matched food's serving could be reconciled with the AI's
   *  unit (real unit math, not a calorie-ratio fallback). When false, the food's
   *  serving shape is NOT trustworthy for unit conversions, so the dropdown is
   *  anchored to the AI estimate instead. */
  matchServingReliable?: boolean
  /** The serving-size dropdown choice the user picked (id from the matched
   *  food's serving options). Drives the Serving Size box selection. */
  servingChoiceId?: string
  /** The per-serving label for the picked choice ("1 cup (240 g)") — combined
   *  with the quantity to form the stored serving label. */
  servingLabelBase?: string
  /** Snapshot of the item's original (estimate/match) serving so the dropdown's
   *  always-present "current" option can restore it after the user tries other
   *  units — the friendly serving never disappears from the menu. */
  origServing?: {
    nutrition: { calories: number; protein: number; carbs: number; fats: number }
    unitLabel: string
    multiplier: number
    label: string
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function scaledNutrition(item: EstimatedPlateItem, multiplier: number) {
  const n = item.nutrition
  return {
    calories: Math.round((n.calories ?? 0) * multiplier),
    protein: Math.round((n.protein ?? 0) * multiplier * 10) / 10,
    carbs: Math.round((n.carbs ?? 0) * multiplier * 10) / 10,
    fats: Math.round((n.fats ?? 0) * multiplier * 10) / 10,
  }
}

export function runningTotal(items: ReviewItem[]) {
  let calories = 0, protein = 0, carbs = 0, fats = 0
  for (const it of items) {
    if (it.removed) continue
    const s = scaledNutrition(it, it.multiplier)
    calories += s.calories
    protein += s.protein
    carbs += s.carbs
    fats += s.fats
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fats: Math.round(fats * 10) / 10,
  }
}

/** The model occasionally returns confidence on a 1-5 scale instead of 0-1. */
export function normalizeConfidence(c: unknown): number {
  const n = typeof c === 'number' && isFinite(c) ? c : 0
  const v = n > 1 ? n / 5 : n
  return Math.max(0, Math.min(1, v))
}

// ── Amount/unit helpers — show real servings, never an abstract "× serving" ────
export const MASS_UNITS = new Set(['g', 'ml', 'oz', 'kg', 'lb', 'mg', 'l'])
export function normUnit(u: string): string {
  const x = u.trim().toLowerCase()
  if (x === 'gram' || x === 'grams') return 'g'
  if (x === 'milliliter' || x === 'milliliters' || x === 'millilitre' || x === 'millilitres') return 'ml'
  if (x === 'ounce' || x === 'ounces') return 'oz'
  if (x === 'liter' || x === 'liters' || x === 'litre') return 'l'
  return x
}
/**
 * Parse an AI serving string ("1 kiwi", "6 bites", "~150 g", "1 cup (240 g)",
 * "3/4 cup") → count + unit.
 *
 * A fractional AI estimate ("3/4 cup", "¾ cup", "1 1/2 tbsp") used to break
 * this: the old hand-rolled regex only recognized digits and a decimal point
 * ([\d.]+), so "3/4 cup" — the "/" isn't in that class — read as qty=3 with
 * the unit garbled to "/4 cup", a token no downstream unit lookup recognizes.
 * A food whose real serving is 3/4 cup ended up logged/displayed against the
 * wrong quantity. `parseQuantityString` already handles ascii and unicode
 * fractions correctly and is the same parser the rest of the serving-picker
 * trusts, so route real units through it instead of re-deriving fraction
 * math here.
 */
export function parseServing(s?: string): { qty: number; unit: string } {
  const str = (s || '').trim()
  if (!str) return { qty: 1, unit: 'serving' }

  // Strip the leading "~" and any "(240 g)" bridge parenthetical before
  // handing off — parseQuantityString expects a bare "qty unit" string.
  const stripped = str.replace(/\([^)]*\)/g, '').trim().replace(/^~\s*/, '')
  const parsed = parseQuantityString(stripped)
  if (parsed) return { qty: parsed.value, unit: parsed.unit }

  // Household/count words ("kiwi", "bites") aren't real units, so
  // parseQuantityString can't resolve them — fall back to plain leading-number
  // extraction for those.
  const m = str.match(/^~?\s*([\d.]+)\s*(.*)$/)
  if (!m) return { qty: 1, unit: str ? normUnit(str) : 'serving' }
  const qty = parseFloat(m[1] ?? '') || 1
  let unit = normUnit((m[2] ?? '').replace(/\([^)]*\)/g, '').trim()) // drop "(240 g)" parentheticals
  if (!unit) unit = 'serving'
  // Singularize simple count plurals so it reads right at any count.
  if (!MASS_UNITS.has(unit) && unit.length > 2 && unit.endsWith('s')) unit = unit.slice(0, -1)
  return { qty, unit }
}
/** "1 kiwi", "2 kiwis", "150 g", "6 bites" */
export function formatAmount(qty: number, unit: string): string {
  const n = Math.round(qty * 100) / 100
  if (MASS_UNITS.has(unit)) return `${n} ${unit}`
  const label = n === 1 ? unit : (unit.endsWith('s') ? unit : `${unit}s`)
  return `${n} ${label}`
}
export type Macros = { calories: number; protein: number; carbs: number; fats: number }
/** Per-ONE-unit macros, given the macros for the whole `qty`-unit portion. */
export function perUnitNutrition(total: Macros, qty: number): Macros {
  const q = qty > 0 ? qty : 1
  return {
    calories: (total.calories ?? 0) / q,
    protein: (total.protein ?? 0) / q,
    carbs: (total.carbs ?? 0) / q,
    fats: (total.fats ?? 0) / q,
  }
}

// ── Phase 2: align the AI's quantity to the matched food's REAL serving ───────
export const DISCRETE_FOOD_UNITS = new Set<Unit>(['each', 'slice', 'scoop', 'serving'])
/** Map a parsed AI unit string to a known mass/volume Unit, or null if it's a
 *  household/count word ("kiwi", "bite") we can't convert dimensionally. */
export function toKnownUnit(u: string): Unit | null {
  switch (u) {
    case 'g': return 'g'
    case 'ml': return 'ml'
    case 'oz': return 'oz'
    case 'lb': case 'pound': return 'lb'
    case 'cup': return 'cup'
    case 'tbsp': case 'tablespoon': return 'tbsp'
    case 'tsp': case 'teaspoon': return 'tsp'
    case 'fl_oz': case 'floz': return 'fl_oz'
    default: return null
  }
}
/**
 * How many of the matched food's servings the AI portion (`qty` of `aiUnit`)
 * equals — using real-unit math, NOT the calorie ratio. Returns null when the
 * units can't be reconciled (caller falls back to the calorie estimate).
 *  - mass/volume AI unit → scalingFactor (same family, or via gram/ml bridge)
 *  - household/count AI unit → align by count if the food's serving is discrete
 */
export function alignedServingsOfFood(qty: number, aiUnit: string, m: DbMatch): number | null {
  const known = toKnownUnit(aiUnit)
  if (known) {
    try {
      const f = scalingFactor(
        { servingSize: m.servingSize, servingUnit: m.servingUnit as ServingUnit, nutrition: m.nutrition, gramsPerServing: m.gramsPerServing, mlPerServing: m.mlPerServing },
        qty,
        known,
      )
      return Number.isFinite(f) && f > 0 ? f : null
    } catch {
      return null // unit not reconcilable with this food (no bridge)
    }
  }
  // Count word ("1 kiwi", "6 bites") → align to a discrete-serving food by count.
  if (DISCRETE_FOOD_UNITS.has(m.servingUnit as Unit) && m.servingSize > 0) {
    return qty / m.servingSize
  }
  return null
}

/** A matched DB food → the serving-basis variant the serving-size dropdown and
 *  per-serving math run on. Returns null when there's no matched food. */
export function variantFromMatch(m: DbMatch | null | undefined): QuantityPickerVariant | null {
  if (!m) return null
  return {
    servingSize: m.servingSize,
    servingUnit: m.servingUnit as ServingUnit,
    displayLabel: m.displayLabel,
    alternateServings: m.alternateServings,
    nutrition: m.nutrition,
    gramsPerServing: m.gramsPerServing,
    mlPerServing: m.mlPerServing,
  }
}

/** Every review item gets a serving-basis variant so EVERY row shows a serving
 *  dropdown — not just matched foods. For an unmatched AI item we synthesize a
 *  one-unit variant from its own estimate: when its unit is a real mass/volume
 *  unit (g, tbsp, cup…) the dropdown can offer accurate same-family conversions;
 *  a count word ("bite", "kiwi") maps to a discrete `each` so it still gets a
 *  dropdown (just its own unit). `nutrition` is per ONE unit, matching how
 *  ReviewItem stores it, so the math stays accurate to that food. */
export function buildVariantForItem(item: ReviewItem): QuantityPickerVariant {
  // Use the matched food's full serving shape ONLY when it reconciled with the
  // AI's unit — otherwise its grams/serving are unreliable and the conversions
  // come out wrong (e.g. a blueberry food stored at 317 cal/100g). In that case,
  // and for unmatched items, synthesize a one-unit variant anchored to the AI's
  // own (correct) per-unit estimate so every unit scales sensibly.
  if (item.match && item.matchServingReliable) {
    const matched = variantFromMatch(item.match)
    if (matched) return matched
  }
  const known = toKnownUnit(item.unitLabel)
  return {
    servingSize: 1,
    servingUnit: (known ?? 'each') as ServingUnit,
    displayLabel: formatAmount(1, item.unitLabel),
    nutrition: item.nutrition,
  }
}

/** Which dropdown choice the item's current (quantity, unit) matches — so the
 *  serving-size dropdown checks the right row. A serving matches when BOTH its
 *  quantity and unit line up; otherwise the measurable unit row matches; else we
 *  fall back to the primary serving so the Servings section always shows one. */
export function matchingChoiceId(item: ReviewItem): string | undefined {
  const groups = buildServingChoiceGroups(buildVariantForItem(item))
  const s = groups.servings.find((c) => String(c.unit) === item.unitLabel && Math.abs(c.quantity - item.multiplier) < 0.01)
  if (s) return s.id
  const u = [...groups.weight, ...groups.volume].find((c) => String(c.unit) === item.unitLabel)
  if (u) return u.id
  return groups.servings[0]?.id
}

/** Combine a per-serving label with a count: "1 cup (240 g)" + 2 → "2 × 1 cup (240 g)". */
export function combinedServingLabel(base: string, count: number): string {
  const n = Math.round(count * 100) / 100
  return n === 1 ? base : `${n} × ${base}`
}

export function toReviewItems(est: PlateEstimate): ReviewItem[] {
  return (est.items ?? []).map((item) => {
    const { qty, unit } = parseServing(item.estimatedServing)
    // The AI's nutrition is for the whole portion (qty units) → store per-unit.
    const perUnit = perUnitNutrition(item.nutrition, qty)
    return {
      ...item,
      nutrition: perUnit,
      confidence: normalizeConfidence(item.confidence),
      multiplier: qty,
      unitLabel: unit,
      removed: false,
      matchChecked: false,
      match: null,
      origServing: { nutrition: perUnit, unitLabel: unit, multiplier: qty, label: formatAmount(qty, unit) },
    }
  })
}

/** Build a review row from a food picked in the "Add more" search. It's a real DB
 *  food (foodId + per-serving nutrition), so it comes in pre-matched and logs
 *  exactly like the estimate's own items. `entry.nutrition` is PER-SERVING and
 *  `entry.servings` is the count, so total = nutrition × servings; the review row
 *  stores per-loggedUnit nutrition with the logged quantity as its multiplier. */
export function entryToReviewItem(entry: IFoodEntry): ReviewItem {
  const servings = Number(entry.servings) || 1
  const qty = Number(entry.loggedQuantity ?? servings) || 1
  const unit = String(entry.loggedUnit ?? entry.servingUnit ?? 'serving')
  const n = entry.nutrition
  const total = {
    calories: (n.calories || 0) * servings,
    protein: (n.protein || 0) * servings,
    carbs: (n.carbs || 0) * servings,
    fats: (n.fats || 0) * servings,
  }
  const perUnit = perUnitNutrition(total, qty)
  const foodId = entry.foodId ? String(entry.foodId) : ''
  const match: DbMatch | null = foodId
    ? {
        kind: 'food',
        id: foodId,
        name: entry.name,
        brand: entry.brand,
        servingSize: Number(entry.servingSize) || 1,
        servingUnit: String(entry.servingUnit || 'serving'),
        nutrition: { calories: n.calories || 0, protein: n.protein || 0, carbs: n.carbs || 0, fats: n.fats || 0 },
        source: 'db',
        confidence: 1,
        gramsPerServing: entry.loggedGramsPerServing,
        mlPerServing: entry.loggedMlPerServing,
        displayLabel: entry.servingLabel,
      }
    : null
  return {
    name: entry.name,
    brand: entry.brand,
    estimatedServing: entry.servingLabel || formatAmount(qty, unit),
    nutrition: perUnit,
    confidence: 1,
    multiplier: qty,
    unitLabel: unit,
    removed: false,
    matchChecked: true,
    match,
    matchServingReliable: true,
    origServing: { nutrition: perUnit, unitLabel: unit, multiplier: qty, label: formatAmount(qty, unit) },
  }
}

/**
 * Per-unit nutrition, stored EXACTLY as computed.
 *
 * These values are per ONE unit and get multiplied by `servings` later, so any
 * rounding here is multiplied too. Rounding calories to a whole number turned
 * 130 cal / 325 ml = 0.4 into 0, and 0 x 325 is 0 — a coffee logged as 0 cal
 * beside 32.5 g of protein, because the macros kept one decimal and survived
 * while the calories did not.
 *
 * Four decimals was the first fix and it was still wrong in kind: an
 * intermediate value has no business being rounded at all. Precision is free
 * here and the error compounds, so keep the number and round only where a human
 * reads it.
 */
export function perUnit(value: number | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Map review items → the PlateScan history item shape (used for both the
 *  generation-time save and the on-log update). Excludes removed items. */
export function buildScanItems(items: ReviewItem[]) {
  return items.filter((it) => !it.removed).map((it) => {
    const n = it.nutrition
    return {
      ...(it.match?.kind === 'food' ? { foodId: it.match.id } : {}),
      name: it.name,
      ...(it.brand ? { brand: it.brand } : {}),
      estimatedServing: it.labelOverride || formatAmount(it.multiplier, it.unitLabel),
      servingSize: 1,
      servingUnit: it.unitLabel || 'serving',
      servings: it.multiplier,
      nutrition: {
        calories: perUnit(n.calories),
        protein: perUnit(n.protein),
        carbs: perUnit(n.carbs),
        fats: perUnit(n.fats),
      },
      confidence: it.confidence,
      ...(it.match ? { matchKind: it.match.kind } : {}),
    }
  })
}

export function buildGenerationFeedbackMetadata(
  items: ReviewItem[],
  imageThumb: string,
  tag: string,
  scanId: string | null,
) {
  const activeItems = items.filter((it) => !it.removed)
  return {
    surface: 'snap_plate_review',
    source: imageThumb ? 'photo' : 'describe',
    tag,
    scanId: scanId ?? undefined,
    totals: runningTotal(activeItems),
    itemCount: activeItems.length,
    removedItemCount: items.length - activeItems.length,
    items: activeItems.map((it) => {
      const total = scaledNutrition(it, it.multiplier)
      return {
        name: it.name,
        brand: it.brand,
        servingLabel: it.labelOverride || formatAmount(it.multiplier, it.unitLabel),
        unitLabel: it.unitLabel,
        multiplier: it.multiplier,
        confidence: it.confidence,
        matchKind: it.match?.kind ?? null,
        matchSource: it.match?.source ?? null,
        nutrition: total,
      }
    }),
  }
}

export function applyMatches(
  items: ReviewItem[],
  matches: Array<DbMatch | null>,
): ReviewItem[] {
  return items.map((it, i) => {
    const m = matches[i]
    if (!m) return { ...it, matchChecked: true, match: null }
    // Guard: a saved item with empty/broken macros (e.g. a 0-cal "Blueberries")
    // must NOT override a real AI estimate. If the match has no usable nutrition
    // but the AI estimated some, keep the AI estimate (treat as unmatched).
    const matchHasMacros = (m.nutrition?.calories ?? 0) > 0
      || (m.nutrition?.protein ?? 0) > 0 || (m.nutrition?.carbs ?? 0) > 0 || (m.nutrition?.fats ?? 0) > 0
    const aiHasMacros = (it.nutrition?.calories ?? 0) > 0
      || (it.nutrition?.protein ?? 0) > 0 || (it.nutrition?.carbs ?? 0) > 0 || (it.nutrition?.fats ?? 0) > 0
    if (!matchHasMacros && aiHasMacros) return { ...it, matchChecked: true, match: null }
    // Keep the AI's NATURAL portion (e.g. "1 kiwi", "6 bites") and count, but
    // adopt YOUR saved food's macros for it. Phase 2: when the AI's unit can be
    // reconciled with the food's real serving (same family, or via a gram/ml
    // bridge, or a count→discrete-serving match), use that EXACT alignment so
    // all macros come straight from your food. Otherwise fall back to bridging
    // the AI's calorie estimate into a serving multiplier. No "× of 100 g".
    const dbCal = m.nutrition?.calories ?? 0
    const qty = it.multiplier > 0 ? it.multiplier : 1
    const aiTotalCal = (it.nutrition?.calories ?? 0) * qty
    const aligned = alignedServingsOfFood(qty, it.unitLabel, m) // servings of the food, by unit math
    const totalMult = aligned != null
      ? aligned
      : (dbCal > 0 && aiTotalCal > 0 ? aiTotalCal / dbCal : qty)
    const f = totalMult / qty
    const perUnit: Macros = {
      calories: (m.nutrition.calories ?? 0) * f,
      protein: (m.nutrition.protein ?? 0) * f,
      carbs: (m.nutrition.carbs ?? 0) * f,
      fats: (m.nutrition.fats ?? 0) * f,
    }
    return {
      ...it,
      name: m.name,
      brand: m.brand,
      nutrition: perUnit, // per ONE unit, from your saved food
      // unitLabel + multiplier (the AI's natural count) are preserved.
      matchChecked: true,
      match: m,
      // Only trust the food's serving shape for unit conversions when the AI's
      // unit actually reconciled with it (aligned != null). A calorie-ratio
      // fallback means the food's grams/serving don't line up with the
      // description — using them for the dropdown produces nonsense numbers.
      matchServingReliable: aligned != null,
      // Re-snapshot to the matched serving so the dropdown's "current" option
      // restores what the user actually sees after reconcile.
      origServing: { nutrition: perUnit, unitLabel: it.unitLabel, multiplier: qty, label: formatAmount(qty, it.unitLabel) },
    }
  })
}
