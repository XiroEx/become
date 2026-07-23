/**
 * USDA FoodData Central API integration.
 *
 * Free API — get a key at https://fdc.nal.usda.gov/api-key-signup
 * Set USDA_API_KEY env var (falls back to DEMO_KEY with low rate limits).
 *
 * Searches Branded + Survey (FNDDS) foods and maps to a Food-search-result shape.
 */

import { parseQuantityString, convert, familyOf } from '@/lib/units'
import { cleanFoodName, sanitizeServingLabel } from '@/lib/foodNameClean'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

const API_BASE = 'https://api.nal.usda.gov/fdc/v1'

// Nutrient IDs in the USDA schema
const NUTRIENT_IDS = {
  calories: 1008,   // Energy (kcal)
  protein: 1003,    // Protein (g)
  carbs: 1005,      // Carbohydrate, by difference (g)
  fat: 1004,        // Total lipid / fat (g)
  fiber: 1079,      // Fiber, total dietary (g)
  sugar: 1063,      // Sugars, total (g)
  sodium: 1093,     // Sodium (mg — we convert to g)
  saturatedFat: 1258 // Fatty acids, total saturated (g)
} as const

export interface USDANutrient {
  nutrientId: number
  nutrientName: string
  value: number
  unitName: string
}

/**
 * USDA `foodPortions` entry — present on Foundation/SR Legacy/Survey detail
 * responses. Each portion describes a household measure (e.g. "1 cup", "1
 * slice") with its gram weight. Branded foods sometimes carry these too.
 *
 * Shape per https://fdc.nal.usda.gov/api-guide :
 *   {
 *     id, amount, modifier, gramWeight,
 *     portionDescription, sequenceNumber, dataPoints
 *   }
 *
 * `amount` + `modifier` form the human label ("1 cup", "2 slices"); some
 * entries instead use `portionDescription` ("1 medium banana"). `gramWeight`
 * is always set when the portion is meaningful.
 */
export interface USDAFoodPortion {
  id?: number
  amount?: number
  modifier?: string
  gramWeight: number
  portionDescription?: string
  sequenceNumber?: number
  dataPoints?: number
}

export interface USDAFood {
  fdcId: number
  description: string
  brandName?: string
  brandOwner?: string
  dataType: string
  foodNutrients: USDANutrient[]
  servingSize?: number
  servingSizeUnit?: string
  foodCategory?: string
  householdServingFullText?: string
  /**
   * Detail-only — the search endpoint omits this. When present (Foundation /
   * SR Legacy / Survey, sometimes Branded), gives rich household-portion data
   * we use to populate `displayLabel` + `gramsPerServing` + `alternateServings`.
   */
  foodPortions?: USDAFoodPortion[]
}

interface USDASearchResponse {
  foods: USDAFood[]
  totalHits: number
}

function getNutrient(nutrients: USDANutrient[], id: number): number | undefined {
  const n = nutrients.find(x => x.nutrientId === id)
  return n?.value
}

export function mapCategory(usdaCategory: string | { description?: string } | undefined): string {
  // The detail endpoint returns foodCategory as { id, code, description } instead of a string
  const raw = typeof usdaCategory === 'string'
    ? usdaCategory
    : usdaCategory?.description
  if (!raw || typeof raw !== 'string') return 'Other'
  const c = raw.toLowerCase()
  if (c.includes('meat') || c.includes('poultry') || c.includes('fish') || c.includes('seafood') || c.includes('egg')) return 'Protein'
  if (c.includes('grain') || c.includes('bread') || c.includes('cereal') || c.includes('pasta') || c.includes('rice') || c.includes('baked')) return 'Grain'
  if (c.includes('fruit')) return 'Fruit'
  if (c.includes('vegetable') || c.includes('legume')) return 'Vegetable'
  if (c.includes('dairy') || c.includes('milk') || c.includes('cheese') || c.includes('yogurt')) return 'Dairy'
  if (c.includes('fat') || c.includes('oil') || c.includes('nut') || c.includes('seed')) return 'Fat'
  if (c.includes('beverage') || c.includes('water') || c.includes('juice') || c.includes('soda') || c.includes('coffee') || c.includes('tea')) return 'Beverage'
  if (c.includes('sauce') || c.includes('condiment') || c.includes('spice') || c.includes('dressing')) return 'Condiment'
  if (c.includes('snack') || c.includes('candy') || c.includes('chocolate') || c.includes('chip') || c.includes('cookie') || c.includes('sweet')) return 'Snack'
  return 'Other'
}

export interface MappedFoodResult {
  _id: string
  name: string
  brand?: string
  category: string
  servingSize: number
  servingUnit: string
  displayLabel?: string
  alternateServings?: { label: string; multiplier: number }[]
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
  /** Cross-domain bridges — populated at import time when derivable. */
  gramsPerServing?: number
  mlPerServing?: number
  source: 'usda'
  dataType?: string
}

// USDA serving-size unit codes (rough mapping). The API uses both ISO-ish
// codes ("GRM", "MLT") and human strings ("g", "ml") inconsistently across
// data types; check both.
const USDA_MASS_UNITS = new Set(['grm', 'g', 'gram', 'grams'])
const USDA_VOLUME_UNITS = new Set(['mlt', 'ml', 'milliliter', 'milliliters'])

/**
 * Try to derive cross-domain bridges (gramsPerServing / mlPerServing) from a
 * USDA food's servingSize/servingSizeUnit and householdServingFullText.
 *
 *   - If servingSizeUnit is a mass unit, gramsPerServing = servingSize.
 *   - If servingSizeUnit is a volume unit, mlPerServing = servingSize. We
 *     additionally try to mine a gram value out of householdServingFullText
 *     ("1 cup (240 g)") so liquids with declared density get both bridges.
 *   - For Foundation/SR Legacy/Survey foods reported per-100g (no
 *     servingSize), gramsPerServing defaults to 100 (the implicit serving).
 */
function deriveUsdaBridges(food: USDAFood): {
  gramsPerServing?: number
  mlPerServing?: number
} {
  const rawUnit = (food.servingSizeUnit || '').toLowerCase().trim()
  const size = food.servingSize
  let gramsPerServing: number | undefined
  let mlPerServing: number | undefined

  if (size != null && size > 0) {
    if (USDA_MASS_UNITS.has(rawUnit)) {
      gramsPerServing = size
    } else if (USDA_VOLUME_UNITS.has(rawUnit)) {
      mlPerServing = size
    }
  }

  // householdServingFullText may carry a parenthesized gram/ml hint.
  const hh = food.householdServingFullText
  if (hh) {
    const parenMatches = hh.match(/\(([^)]+)\)/g)
    const candidates: string[] = []
    if (parenMatches) {
      for (const p of parenMatches) candidates.push(p.slice(1, -1).trim())
    }
    candidates.push(hh)
    for (const c of candidates) {
      const parsed = parseQuantityString(c)
      if (!parsed) continue
      const fam = familyOf(parsed.unit)
      if (fam === 'mass' && gramsPerServing == null) {
        gramsPerServing = convert(parsed.value, parsed.unit, 'g')
      } else if (fam === 'volume' && mlPerServing == null) {
        mlPerServing = convert(parsed.value, parsed.unit, 'ml')
      }
    }
  }

  // No serving info at all → USDA per-100g foods (Foundation/SR Legacy/Survey
  // without household serving). Default to gramsPerServing = 100.
  if (gramsPerServing == null && mlPerServing == null) {
    if (size == null || size === 100) {
      gramsPerServing = 100
    }
  }

  return { gramsPerServing, mlPerServing }
}

export async function lookupUSDAByBarcode(code: string): Promise<MappedFoodResult | null> {
  const apiKey = (await getRuntimeConfig()).external.usdaApiKey || 'DEMO_KEY'

  try {
    // USDA Branded foods are indexed by gtinUpc — searching the barcode as a
    // query term returns the exact product when the UPC matches.
    const params = new URLSearchParams({
      query: code,
      api_key: apiKey,
      pageSize: '5',
      dataType: 'Branded',
    })

    const res = await fetch(`${API_BASE}/foods/search?${params}`, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',  // Next.js 16 caches fetch by default — opt out so live rate limits don't get stuck
    })
    if (!res.ok) {
      console.warn(`USDA barcode lookup failed: ${res.status} ${res.statusText} (key=${apiKey === 'DEMO_KEY' ? 'DEMO_KEY' : 'set'})`)
      return null
    }

    const data: USDASearchResponse = await res.json()
    if (!data.foods?.length) return null

    // Pick the first result whose gtinUpc matches any candidate code
    const mapped = data.foods
      .map((food): MappedFoodResult | null => {
        const cal = getNutrient(food.foodNutrients, NUTRIENT_IDS.calories)
        if (cal == null || cal <= 0) return null

        const servingSize = food.servingSize || 100
        const servingUnit = (typeof food.servingSizeUnit === 'string' ? food.servingSizeUnit : 'g').toLowerCase()
        const scale = servingSize / 100

        const nutrition = {
          calories: Math.round(cal * scale),
          protein: Math.round(((getNutrient(food.foodNutrients, NUTRIENT_IDS.protein) ?? 0)) * scale * 10) / 10,
          carbs: Math.round(((getNutrient(food.foodNutrients, NUTRIENT_IDS.carbs) ?? 0)) * scale * 10) / 10,
          fats: Math.round(((getNutrient(food.foodNutrients, NUTRIENT_IDS.fat) ?? 0)) * scale * 10) / 10,
          fiber: getNutrient(food.foodNutrients, NUTRIENT_IDS.fiber) != null
            ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.fiber)!) * scale * 10) / 10
            : undefined,
          sugar: getNutrient(food.foodNutrients, NUTRIENT_IDS.sugar) != null
            ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.sugar)!) * scale * 10) / 10
            : undefined,
          sodium: getNutrient(food.foodNutrients, NUTRIENT_IDS.sodium) != null
            ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.sodium)!) * scale / 1000 * 1000) / 1000
            : undefined,
          saturatedFat: getNutrient(food.foodNutrients, NUTRIENT_IDS.saturatedFat) != null
            ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.saturatedFat)!) * scale * 10) / 10
            : undefined,
        }

        const unitLabel = servingUnit === 'ml' ? 'ml' : 'g'
        const alternateServings: { label: string; multiplier: number }[] = []
        if (servingSize !== 100) alternateServings.push({ label: `100 ${unitLabel}`, multiplier: 100 / servingSize })

        const { gramsPerServing, mlPerServing } = deriveUsdaBridges(food)

        return {
          _id: `usda-${food.fdcId}`,
          name: cleanFoodName(food.description),
          brand: food.brandOwner || food.brandName || undefined,
          category: mapCategory(food.foodCategory),
          displayLabel: sanitizeServingLabel(food.householdServingFullText) || undefined,
          servingSize,
          servingUnit: servingUnit === 'ml' ? 'ml' : 'g',
          alternateServings: alternateServings.length > 0 ? alternateServings : undefined,
          nutrition,
          gramsPerServing,
          mlPerServing,
          source: 'usda',
          dataType: food.dataType,
        }
      })
      .filter((f): f is MappedFoodResult => f !== null)

    return mapped[0] ?? null
  } catch (err) {
    console.warn(`USDA barcode lookup error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

// Rank order for sorting: whole/foundation foods before branded
const DATA_TYPE_RANK: Record<string, number> = {
  'Foundation': 0,
  'SR Legacy': 1,
  'Survey (FNDDS)': 2,
  'Branded': 3,
}

export function mapUSDAFood(food: USDAFood): MappedFoodResult | null {
  const cal = getNutrient(food.foodNutrients, NUTRIENT_IDS.calories)
  if (cal == null || cal <= 0) return null

  const servingSize = food.servingSize || 100
  const servingUnit = (food.servingSizeUnit || 'g').toLowerCase()

  // USDA nutrients are per 100g. Scale to actual serving size.
  const scale = servingSize / 100

  const nutrition = {
    calories: Math.round(cal * scale),
    protein:  Math.round(((getNutrient(food.foodNutrients, NUTRIENT_IDS.protein)  ?? 0)) * scale * 10) / 10,
    carbs:    Math.round(((getNutrient(food.foodNutrients, NUTRIENT_IDS.carbs)    ?? 0)) * scale * 10) / 10,
    fats:     Math.round(((getNutrient(food.foodNutrients, NUTRIENT_IDS.fat)      ?? 0)) * scale * 10) / 10,
    fiber: getNutrient(food.foodNutrients, NUTRIENT_IDS.fiber) != null
      ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.fiber)!) * scale * 10) / 10
      : undefined,
    sugar: getNutrient(food.foodNutrients, NUTRIENT_IDS.sugar) != null
      ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.sugar)!) * scale * 10) / 10
      : undefined,
    sodium: getNutrient(food.foodNutrients, NUTRIENT_IDS.sodium) != null
      ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.sodium)!) * scale / 1000 * 1000) / 1000 // mg → g
      : undefined,
    saturatedFat: getNutrient(food.foodNutrients, NUTRIENT_IDS.saturatedFat) != null
      ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.saturatedFat)!) * scale * 10) / 10
      : undefined,
  }

  // householdServingFullText is the human label for the DEFAULT serving (e.g. "1 cup"),
  // so it goes on displayLabel — NOT into alternateServings (where it would inherit
  // the wrong multiplier and silently compute the wrong macros).
  const unitLabel = servingUnit === 'ml' ? 'ml' : 'g'
  const alternateServings: { label: string; multiplier: number }[] = []
  if (servingSize !== 100) {
    alternateServings.push({ label: `100 ${unitLabel}`, multiplier: 100 / servingSize })
  }

  const { gramsPerServing, mlPerServing } = deriveUsdaBridges(food)

  return {
    _id: `usda-${food.fdcId}`,
    name: cleanFoodName(food.description),
    brand: food.brandOwner || food.brandName || undefined,
    category: mapCategory(food.foodCategory),
    displayLabel: sanitizeServingLabel(food.householdServingFullText) || undefined,
    servingSize,
    servingUnit: servingUnit === 'ml' ? 'ml' : 'g',
    alternateServings: alternateServings.length > 0 ? alternateServings : undefined,
    nutrition,
    gramsPerServing,
    mlPerServing,
    source: 'usda',
    dataType: food.dataType,
  }
}

export async function searchUSDA(query: string, limit: number = 15): Promise<MappedFoodResult[]> {
  const apiKey = (await getRuntimeConfig()).external.usdaApiKey || 'DEMO_KEY'

  try {
    // Include Foundation + SR Legacy (whole foods) alongside Branded.
    // NOTE: Survey (FNDDS) is intentionally omitted — its name contains
    // parentheses that USDA's own nginx rejects with a 400, even when the
    // value is URL-encoded. Dropping FNDDS keeps the call working; we still
    // get the rich whole-food entries from Foundation + SR Legacy.
    const params = new URLSearchParams({
      query,
      api_key: apiKey,
      pageSize: String(Math.min(limit * 2, 50)),
      dataType: 'Foundation,SR Legacy,Branded',
    })

    const res = await fetch(`${API_BASE}/foods/search?${params}`, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',  // Next.js 16 caches fetch by default — opt out so empty/rate-limited responses don't stick
    })

    if (!res.ok) {
      console.warn(`USDA search failed: ${res.status} ${res.statusText} (key=${apiKey === 'DEMO_KEY' ? 'DEMO_KEY' : 'set'}, query=${query.slice(0, 40)})`)
      return []
    }

    const data: USDASearchResponse = await res.json()
    if (!data.foods?.length) return []

    const mapped = data.foods
      .map(mapUSDAFood)
      .filter((f): f is MappedFoodResult => f !== null)

    // Sort: Foundation/SR Legacy whole foods before Survey before Branded,
    // so plain "Bananas, raw" surfaces ahead of "Banana Cream Pie Mix".
    mapped.sort((a, b) => {
      const ra = DATA_TYPE_RANK[a.dataType ?? 'Branded'] ?? 3
      const rb = DATA_TYPE_RANK[b.dataType ?? 'Branded'] ?? 3
      return ra - rb
    })

    return mapped.slice(0, limit)
  } catch (err) {
    console.warn(`USDA search error: ${err instanceof Error ? err.message : String(err)} (query=${query.slice(0, 40)})`)
    return []
  }
}

/**
 * Fetch a single USDA food by its fdcId.
 * https://fdc.nal.usda.gov/api-guide
 *
 * The detail endpoint returns nutrients in a wrapped shape:
 *   foodNutrients: [{ nutrient: { id, name, unitName }, amount, ... }]
 * while the search endpoint returns the flat shape used elsewhere in this file:
 *   foodNutrients: [{ nutrientId, value, unitName, nutrientName }]
 * We normalize to the flat shape so mapUSDAFood / getNutrient work.
 */
export interface USDADetailNutrient {
  nutrient?: { id?: number; name?: string; unitName?: string }
  amount?: number
  nutrientId?: number
  value?: number
  unitName?: string
  nutrientName?: string
}

export function normalizeNutrients(raw: USDADetailNutrient[] | undefined): USDANutrient[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((n): USDANutrient | null => {
      const id = n.nutrient?.id ?? n.nutrientId
      const value = n.amount ?? n.value
      if (typeof id !== 'number' || typeof value !== 'number') return null
      return {
        nutrientId: id,
        value,
        unitName: n.nutrient?.unitName ?? n.unitName ?? '',
        nutrientName: n.nutrient?.name ?? n.nutrientName ?? '',
      }
    })
    .filter((n): n is USDANutrient => n !== null)
}

export async function fetchUSDAById(fdcId: string): Promise<USDAFood | null> {
  const apiKey = (await getRuntimeConfig()).external.usdaApiKey || 'DEMO_KEY'
  const id = encodeURIComponent(fdcId)

  try {
    const res = await fetch(`${API_BASE}/food/${id}?api_key=${apiKey}`, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn(`USDA fetch by id failed: ${res.status} ${res.statusText} (key=${apiKey === 'DEMO_KEY' ? 'DEMO_KEY' : 'set'}, fdcId=${fdcId})`)
      return null
    }

    const data = await res.json()
    if (!data || typeof data.fdcId !== 'number') return null
    // foodPortions on the detail endpoint is a richer object; normalize to
    // the slim shape we consume. The endpoint includes `measureUnit` (e.g.
    // {name: 'cup'}) but for our purposes amount + modifier + portionDescription
    // are sufficient (modifier carries "cup, medium" etc).
    type RawPortion = {
      id?: number
      amount?: number
      modifier?: string
      gramWeight?: number
      portionDescription?: string
      sequenceNumber?: number
      dataPoints?: number
    }
    const rawPortions: RawPortion[] = Array.isArray(data.foodPortions) ? data.foodPortions : []
    const foodPortions: USDAFoodPortion[] = rawPortions
      .map((p): USDAFoodPortion | null => {
        if (typeof p?.gramWeight !== 'number' || p.gramWeight <= 0) return null
        return {
          id: typeof p.id === 'number' ? p.id : undefined,
          amount: typeof p.amount === 'number' ? p.amount : undefined,
          modifier: typeof p.modifier === 'string' ? p.modifier : undefined,
          gramWeight: p.gramWeight,
          portionDescription: typeof p.portionDescription === 'string' ? p.portionDescription : undefined,
          sequenceNumber: typeof p.sequenceNumber === 'number' ? p.sequenceNumber : undefined,
          dataPoints: typeof p.dataPoints === 'number' ? p.dataPoints : undefined,
        }
      })
      .filter((p): p is USDAFoodPortion => p !== null)

    return {
      ...data,
      foodNutrients: normalizeNutrients(data.foodNutrients),
      foodPortions: foodPortions.length > 0 ? foodPortions : undefined,
    } as USDAFood
  } catch (err) {
    console.warn(`USDA fetch by id error: ${err instanceof Error ? err.message : String(err)} (fdcId=${fdcId})`)
    return null
  }
}
