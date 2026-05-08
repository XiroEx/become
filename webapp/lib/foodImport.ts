import mongoose from 'mongoose'
import Food, { IFood, IFoodVariant, FoodCategory, ServingUnit } from '@/models/Food'
import OpenFoodFact, { IOpenFoodFact } from '@/models/OpenFoodFact'
import { fetchUSDAById, mapUSDAFood, MappedFoodResult, USDAFood } from '@/lib/usda'
import { baseSlug, generateUniqueFoodSlug } from '@/lib/foodSlug'
import { parseQuantityString, convert, familyOf } from '@/lib/units'

const VALID_CATEGORIES: FoodCategory[] = [
  'Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy',
  'Fat', 'Beverage', 'Condiment', 'Snack', 'Other',
]

const VALID_SERVING_UNITS: ServingUnit[] = [
  'g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop', 'serving',
]

export function coerceCategory(c: string | undefined): FoodCategory {
  if (c && (VALID_CATEGORIES as string[]).includes(c)) return c as FoodCategory
  return 'Other'
}

export function coerceServingUnit(u: string | undefined): ServingUnit {
  if (!u) return 'g'
  const lower = u.toLowerCase()
  if ((VALID_SERVING_UNITS as string[]).includes(lower)) return lower as ServingUnit
  // Common synonyms
  if (lower === 'gram' || lower === 'grams' || lower === 'gr') return 'g'
  if (lower === 'ounce' || lower === 'ounces') return 'oz'
  if (lower === 'milliliter' || lower === 'milliliters' || lower === 'mls') return 'ml'
  if (lower === 'tablespoon' || lower === 'tablespoons') return 'tbsp'
  if (lower === 'teaspoon' || lower === 'teaspoons') return 'tsp'
  return 'g'
}

// ---------------------------------------------------------------------------
// Build a single-variant Food doc shape from a MappedFoodResult / external food
// ---------------------------------------------------------------------------

function buildVariantFromMapped(
  mapped: MappedFoodResult,
  variantName: string,
): IFoodVariant {
  return {
    name: variantName,
    isDefault: true,
    servingSize: mapped.servingSize,
    servingUnit: coerceServingUnit(mapped.servingUnit),
    displayLabel: mapped.displayLabel,
    alternateServings: mapped.alternateServings ?? [],
    nutrition: mapped.nutrition,
    gramsPerServing: mapped.gramsPerServing,
    mlPerServing: mapped.mlPerServing,
  }
}

// ---------------------------------------------------------------------------
// USDA → Food
// ---------------------------------------------------------------------------

/**
 * Choose a sensible variant name for a USDA food. Foundation/SR Legacy
 * descriptions often embed prep state (e.g. "Bananas, raw" or "Eggs, scrambled").
 * For Branded foods we fall back to "Default".
 */
function variantNameFromUSDA(food: USDAFood): string {
  const desc = food.description || ''
  // Try to extract trailing qualifier after a comma: "Bananas, raw" → "Raw"
  const m = desc.match(/,\s*([a-z][a-z\s\-/]*)$/i)
  if (m && m[1]) {
    const cleaned = m[1].trim()
    if (cleaned.length > 0 && cleaned.length < 40) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }
  }
  if (food.dataType === 'Branded') return 'Default'
  return 'Default'
}

export async function importFromUSDA(
  fdcId: string,
  createdBy?: mongoose.Types.ObjectId | string,
): Promise<{ food: IFood; created: boolean }> {
  // Already imported?
  const existing = await Food.findOne({ source: 'usda', externalId: String(fdcId) })
  if (existing) return { food: existing, created: false }

  const usda = await fetchUSDAById(String(fdcId))
  if (!usda) throw new Error(`USDA food not found for fdcId=${fdcId}`)

  const mapped = mapUSDAFood(usda)
  if (!mapped) throw new Error(`USDA food has no usable nutrition for fdcId=${fdcId}`)

  // Strip prep qualifier from canonical name so it lives in the variant name
  const baseName = mapped.name.replace(/,\s*[a-z][a-z\s\-/]*$/i, '').trim() || mapped.name
  const variantName = variantNameFromUSDA(usda)

  const slug = await generateUniqueFoodSlug(Food, baseName, mapped.brand)

  const variant = buildVariantFromMapped(mapped, variantName)

  const food = await Food.create({
    name: baseName,
    slug,
    brand: mapped.brand,
    category: coerceCategory(mapped.category),
    variants: [variant],
    aliases: [],
    source: 'usda',
    externalId: String(fdcId),
    externalDataType: usda.dataType,
    isFirstClass: false,
    isVerified: false,
    barcode: undefined,
    imageUrl: undefined,
    usageCount: 0,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
  })

  return { food, created: true }
}

// ---------------------------------------------------------------------------
// OpenFoodFacts → Food
// ---------------------------------------------------------------------------

/**
 * OpenFoodFacts `serving_quantity` is supposed to be the actual serving size
 * in grams/ml, but it's frequently parsed as the leading number from the text
 * (e.g. "1 cup (240 ml)" → 1 instead of 240). When that happens our multiplier
 * comes out 100x too small. Fall back to extracting grams from `serving_size`.
 *
 * Thin wrapper around `parseQuantityString` so OFF and the foods route share
 * one parser. Also tries inner parenthesized substrings for forms like
 * "1 cup (240 g)" since `parseQuantityString` reads a single number+unit.
 */
function extractGramsFromServingSize(text?: string): number | null {
  if (!text) return null
  const tryParse = (s: string): number | null => {
    const parsed = parseQuantityString(s)
    if (!parsed) return null
    if (parsed.unit === 'g' || parsed.unit === 'oz' || parsed.unit === 'lb') {
      return convert(parsed.value, parsed.unit, 'g')
    }
    return null
  }
  const direct = tryParse(text)
  if (direct != null) return direct
  const parenMatches = text.match(/\(([^)]+)\)/g)
  if (parenMatches) {
    for (const p of parenMatches) {
      const inner = p.slice(1, -1).trim()
      const v = tryParse(inner)
      if (v != null) return v
    }
  }
  return null
}

/**
 * Symmetric to `extractGramsFromServingSize` — extracts a milliliter value
 * from a freeform serving-size string. Returns null when the parsed unit is
 * mass/discrete. Used to set the `mlPerServing` bridge on liquid imports.
 */
function extractMlFromServingSize(text?: string): number | null {
  if (!text) return null
  const tryParse = (s: string): number | null => {
    const parsed = parseQuantityString(s)
    if (!parsed) return null
    if (familyOf(parsed.unit) === 'volume') {
      return convert(parsed.value, parsed.unit, 'ml')
    }
    return null
  }
  const direct = tryParse(text)
  if (direct != null) return direct
  const parenMatches = text.match(/\(([^)]+)\)/g)
  if (parenMatches) {
    for (const p of parenMatches) {
      const inner = p.slice(1, -1).trim()
      const v = tryParse(inner)
      if (v != null) return v
    }
  }
  return null
}

function mapOffToVariant(off: IOpenFoodFact): IFoodVariant {
  const n = off.nutriments
  const nutrition = {
    calories: Math.round(n.energy_kcal_100g) || 0,
    protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    fats: Math.round((n.fat_100g ?? 0) * 10) / 10,
    fiber: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : undefined,
    sugar: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : undefined,
    sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 1000 : undefined,
    saturatedFat: n.saturated_fat_100g != null ? Math.round(n.saturated_fat_100g * 10) / 10 : undefined,
  }

  // Prefer parsed grams from the serving_size text (handles "1 cup (240 g)")
  // over serving_quantity, which OFF often sets to the leading "1" not 240.
  const parsedGrams = extractGramsFromServingSize(off.serving_size)
  const candidateGrams = parsedGrams ?? off.serving_quantity
  const actualGrams = candidateGrams && candidateGrams >= 5 ? candidateGrams : null

  // Preserve the source unit when it's clearly liquid. ml ≠ g for non-water liquids
  // (oils ~0.92 g/ml, honey ~1.4 g/ml). For water-like liquids the diff is <5%, but
  // labeling alternates correctly avoids misleading users.
  const isLiquid = off.serving_unit === 'ml' || /\bml\b|millilitre/i.test(off.serving_size || '')
  const unit: ServingUnit = isLiquid ? 'ml' : 'g'

  const alternateServings: { label: string; multiplier: number }[] = []
  if (actualGrams && actualGrams !== 100) {
    const label = off.serving_size || `${Math.round(actualGrams)} ${unit}`
    alternateServings.push({ label, multiplier: actualGrams / 100 })
  }

  // Bridges: the variant's nutrition is per 100 (g or ml). gramsPerServing /
  // mlPerServing describe ONE serving — i.e. `actualGrams` when defined.
  // For liquids, the parsed value came out of the volume family so we treat
  // it as ml. For solids it's grams. Don't fake the cross-family bridge.
  let gramsPerServing: number | undefined
  let mlPerServing: number | undefined
  if (actualGrams != null) {
    if (isLiquid) {
      // For liquids, prefer a true volume parse so we don't conflate g and ml.
      const parsedMl = extractMlFromServingSize(off.serving_size) ?? actualGrams
      mlPerServing = parsedMl
    } else {
      gramsPerServing = actualGrams
    }
  }

  return {
    name: 'Default',
    isDefault: true,
    servingSize: 100,
    servingUnit: unit,
    displayLabel: actualGrams ? off.serving_size || undefined : undefined,
    alternateServings,
    nutrition,
    gramsPerServing,
    mlPerServing,
  }
}

export async function importFromOpenFoodFacts(
  code: string,
  createdBy?: mongoose.Types.ObjectId | string,
): Promise<{ food: IFood; created: boolean }> {
  const existing = await Food.findOne({ source: 'openfoodfacts', externalId: code })
  if (existing) return { food: existing, created: false }

  // If we already have a Food with this barcode (from a prior manual entry), reuse it
  const byBarcode = await Food.findOne({ barcode: code })
  if (byBarcode) return { food: byBarcode, created: false }

  const off = await OpenFoodFact.findOne({ code }).lean<IOpenFoodFact | null>()
  if (!off) throw new Error(`OpenFoodFacts entry not found for code=${code}`)

  const variant = mapOffToVariant(off)

  const slug = await generateUniqueFoodSlug(Food, off.product_name, off.brands)

  const category = (off.category && (VALID_CATEGORIES as string[]).includes(off.category))
    ? off.category as FoodCategory
    : 'Other'

  const food = await Food.create({
    name: off.product_name,
    slug,
    brand: off.brands || undefined,
    category,
    variants: [variant],
    aliases: [],
    source: 'openfoodfacts',
    externalId: code,
    externalDataType: undefined,
    isFirstClass: false,
    isVerified: false,
    barcode: off.code,
    imageUrl: off.image_url || undefined,
    usageCount: 0,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
  })

  return { food, created: true }
}

// ---------------------------------------------------------------------------
// Manual create
// ---------------------------------------------------------------------------

export interface ManualFoodInput {
  name: string
  brand?: string
  category?: string
  variants?: Array<{
    name?: string
    isDefault?: boolean
    servingSize: number
    servingUnit: string
    alternateServings?: { label: string; multiplier: number }[]
    gramsPerServing?: number
    mlPerServing?: number
    nutrition: {
      calories: number
      protein: number
      carbs: number
      fats: number
      fiber?: number
      sugar?: number
      sodium?: number
      saturatedFat?: number
    }
  }>
  aliases?: string[]
  barcode?: string
  imageUrl?: string
  // Legacy single-variant shape support — when callers send flat fields
  servingSize?: number
  servingUnit?: string
  alternateServings?: { label: string; multiplier: number }[]
  gramsPerServing?: number
  mlPerServing?: number
  nutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
}

export async function importManualFood(
  input: ManualFoodInput,
  createdBy?: mongoose.Types.ObjectId | string,
): Promise<{ food: IFood; created: boolean }> {
  if (!input.name) throw new Error('name is required')

  // If barcode supplied and a Food with that barcode exists, reuse it
  if (input.barcode) {
    const byBarcode = await Food.findOne({ barcode: input.barcode })
    if (byBarcode) return { food: byBarcode, created: false }
  }

  // Dedupe by base slug — manual saves of the same name+brand used to create
  // a fresh Food doc each time (with -2/-3 suffixes), filling the user's
  // saved list with duplicates. baseSlug encodes both name and brand, so an
  // exact base-slug match on a manual food represents the same conceptual
  // item.
  {
    const base = baseSlug(input.name, input.brand)
    const candidate = await Food.findOne({ slug: base, source: 'manual' })
    if (candidate) return { food: candidate, created: false }
  }

  // Build variants — accept either a `variants` array or the flat legacy shape
  let variantsInput = input.variants
  if (!variantsInput || variantsInput.length === 0) {
    if (!input.nutrition || input.servingSize == null) {
      throw new Error('Either variants[] or nutrition+servingSize+servingUnit must be provided')
    }
    variantsInput = [{
      name: 'Default',
      isDefault: true,
      servingSize: input.servingSize,
      servingUnit: input.servingUnit || 'g',
      alternateServings: input.alternateServings ?? [],
      gramsPerServing: input.gramsPerServing,
      mlPerServing: input.mlPerServing,
      nutrition: input.nutrition,
    }]
  }

  const variants: IFoodVariant[] = variantsInput.map((v, idx) => {
    const servingUnit = coerceServingUnit(v.servingUnit)
    // Auto-fill the bridge when the unit is in a known family AND the caller
    // didn't already provide one. This means custom foods created via direct
    // API call (not via the picker) get a sensible bridge for free, without
    // overriding any explicit input.
    let gramsPerServing = v.gramsPerServing
    let mlPerServing = v.mlPerServing
    const family = familyOf(servingUnit)
    if (gramsPerServing == null && family === 'mass') {
      try {
        gramsPerServing = convert(v.servingSize, servingUnit, 'g')
      } catch {
        // unreachable — same family — but keep defensive
      }
    }
    if (mlPerServing == null && family === 'volume') {
      try {
        mlPerServing = convert(v.servingSize, servingUnit, 'ml')
      } catch {
        // unreachable — same family — but keep defensive
      }
    }
    return {
      name: v.name || (idx === 0 ? 'Default' : `Variant ${idx + 1}`),
      isDefault: v.isDefault ?? idx === 0,
      servingSize: v.servingSize,
      servingUnit,
      alternateServings: v.alternateServings ?? [],
      gramsPerServing,
      mlPerServing,
      nutrition: v.nutrition,
    }
  })

  // Ensure exactly one default
  if (!variants.some(v => v.isDefault)) variants[0].isDefault = true

  const slug = await generateUniqueFoodSlug(Food, input.name, input.brand)

  const food = await Food.create({
    name: input.name,
    slug,
    brand: input.brand,
    category: coerceCategory(input.category),
    variants,
    aliases: input.aliases ?? [],
    source: 'manual',
    externalId: undefined,
    externalDataType: undefined,
    isFirstClass: false,
    isVerified: false,
    barcode: input.barcode,
    imageUrl: input.imageUrl,
    usageCount: 0,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
  })

  return { food, created: true }
}

// ---------------------------------------------------------------------------
// Helper: get the default variant of a food (or first variant as fallback)
// ---------------------------------------------------------------------------

export function getDefaultVariant(food: IFood): IFoodVariant {
  return food.variants.find(v => v.isDefault) ?? food.variants[0]
}

/**
 * Flatten a Food doc into the legacy single-variant shape used by search results
 * and the existing frontend. Adds a `variants` array so callers can show a picker.
 */
export function flattenFoodForResponse(food: IFood & { _id: mongoose.Types.ObjectId }) {
  const v = getDefaultVariant(food)
  return {
    _id: food._id,
    name: food.name,
    slug: food.slug,
    brand: food.brand,
    category: food.category,
    servingSize: v.servingSize,
    servingUnit: v.servingUnit,
    displayLabel: v.displayLabel,
    alternateServings: v.alternateServings,
    nutrition: v.nutrition,
    gramsPerServing: v.gramsPerServing,
    mlPerServing: v.mlPerServing,
    barcode: food.barcode,
    imageUrl: food.imageUrl,
    isFirstClass: food.isFirstClass,
    isVerified: food.isVerified,
    usageCount: food.usageCount,
    source: food.source,
    externalDataType: food.externalDataType,
    variants: food.variants,
    aliases: food.aliases,
    createdBy: food.createdBy,
    createdAt: food.createdAt,
    updatedAt: food.updatedAt,
  }
}
