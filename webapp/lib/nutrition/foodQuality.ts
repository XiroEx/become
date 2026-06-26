export interface FoodNutritionLike {
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
}

export interface FoodQualityInput {
  name?: string
  brand?: string
  category?: string
  servingSize?: number
  servingUnit?: string
  gramsPerServing?: number
  mlPerServing?: number
  nutrition?: FoodNutritionLike
}

export interface FoodQualityResult {
  ok: boolean
  reasons: string[]
}

export const FOOD_QUALIFIER_PATTERN = /,\s*(raw|cooked|boiled|roasted|baked|grilled|fried|steamed|sauteed|shelled|peeled|whole|fresh|dried|canned|frozen|unheated|heated|smoked|dehydrated|commercial|with skin|without skin|with salt|without salt|unsweetened|sweetened|enriched|unenriched|fortified)\b.*$/i

const ZERO_MACRO_LEGIT_RE = /\b(water|sparkling|seltzer|tea|coffee|espresso|vinegar|rum|vodka|gin|whisk(?:e)?y|tequila|liquor|liqueur|brandy|bourbon|cognac|scotch|wine|beer|ale|cider|spirit|diet|zero sugar|sugar free|energy drink|electrolyte)\b/i
const ANIMAL_FAT_RE = /\b(tallow|lard|suet|beef fat|chicken fat)\b/i
const ANIMAL_FAT_QUERY_RE = /\b(fat|tallow|lard|suet|oil|grease)\b/i
const PLANT_MEAT_RE = /\b(impossible|beyond meat|meatless|plant[\s-]based|vegan meat)\b/i
const PLANT_MEAT_QUERY_RE = /\b(impossible|beyond|plant|vegan|meatless)\b/i
const PROCESSED_MEAT_RE = /\b(frankfurter|hot dog|beerwurst|bratwurst|kielbasa|bologna|liverwurst)\b/i
const PROCESSED_MEAT_QUERY_RE = /\b(frankfurter|hot.?dog|beerwurst|bratwurst|sausage|frank|bologna|liverwurst)\b/i

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function nutritionNumber(v: unknown): number {
  return finiteNumber(v) ?? 0
}

export function stripFoodQualifiers(name: string): string {
  return name.replace(FOOD_QUALIFIER_PATTERN, '').trim()
}

export function isLegitNearZeroFood(input: Pick<FoodQualityInput, 'name' | 'brand' | 'category'>): boolean {
  if (input.category === 'Beverage') return true
  return ZERO_MACRO_LEGIT_RE.test(`${input.name ?? ''} ${input.brand ?? ''}`)
}

export function isGarbledFoodName(name?: string): boolean {
  const text = (name ?? '').trim()
  if (text.length < 2) return true
  if (/\uFFFD|_{2,}|\.{4,}|[^\S\r\n]{4,}/.test(text)) return true

  const compact = text.replace(/\s+/g, '')
  const letters = (compact.match(/[A-Za-z]/g) ?? []).length
  const digits = (compact.match(/\d/g) ?? []).length
  const visible = compact.length
  if (visible >= 8 && letters / visible < 0.35) return true
  if (visible >= 12 && digits / visible > 0.65) return true

  const words = text.split(/\s+/).filter(Boolean)
  const allCapsWords = words.filter(w => /^[A-Z]{4,}$/.test(w))
  if (text.length >= 16 && allCapsWords.length >= 2) {
    const vowelWords = allCapsWords.filter(w => /[AEIOUY]/.test(w))
    if (vowelWords.length === 0) return true
  }

  return false
}

export function foodSearchIrrelevancePenalty(name: string, brand: string | undefined, query: string): number {
  const qLower = query.toLowerCase().trim()
  const lc = (name ?? '').toLowerCase()
  const bLc = (brand ?? '').toLowerCase()
  const full = `${lc} ${bLc}`

  if (/^fat[,\s]/.test(lc) || ANIMAL_FAT_RE.test(lc)) {
    if (!ANIMAL_FAT_QUERY_RE.test(qLower)) return 300
  }
  if (PLANT_MEAT_RE.test(full)) {
    if (!PLANT_MEAT_QUERY_RE.test(qLower)) return 200
  }
  if (PROCESSED_MEAT_RE.test(lc)) {
    if (!PROCESSED_MEAT_QUERY_RE.test(qLower)) return 150
  }
  return 0
}

export function shouldSkipBackgroundImportForQuery(
  input: Pick<FoodQualityInput, 'name' | 'brand'>,
  query: string,
): boolean {
  return foodSearchIrrelevancePenalty(input.name ?? '', input.brand, query) >= 150
}

export function assessFoodImportQuality(input: FoodQualityInput): FoodQualityResult {
  const reasons: string[] = []
  const name = (input.name ?? '').trim()
  if (isGarbledFoodName(name)) reasons.push('garbled-name')

  const servingSize = finiteNumber(input.servingSize)
  const servingUnit = (input.servingUnit ?? '').trim()
  if (servingSize == null || servingSize <= 0 || !servingUnit) {
    reasons.push('missing-serving-basis')
  }

  const n = input.nutrition
  if (!n) {
    reasons.push('missing-nutrition')
  } else {
    const calories = nutritionNumber(n.calories)
    const protein = nutritionNumber(n.protein)
    const carbs = nutritionNumber(n.carbs)
    const fats = nutritionNumber(n.fats)
    const macroCalories = protein * 4 + carbs * 4 + fats * 9
    const allZero = calories === 0 && protein === 0 && carbs === 0 && fats === 0
    const zeroMacros = protein === 0 && carbs === 0 && fats === 0

    if (allZero && !isLegitNearZeroFood(input)) {
      reasons.push('zero-nutrition')
    } else if (calories > 0 && zeroMacros && !isLegitNearZeroFood(input)) {
      reasons.push('zero-macros')
    }

    if (calories < 0 || protein < 0 || carbs < 0 || fats < 0) {
      reasons.push('negative-nutrition')
    }

    const ratio = macroCalories > 0 ? calories / macroCalories : 1
    if (calories >= 50 && macroCalories >= 50 && (ratio > 3.5 || ratio < 0.2)) {
      reasons.push('implausible-energy')
    }
  }

  return { ok: reasons.length === 0, reasons }
}

export function foodQualityErrorMessage(result: FoodQualityResult): string {
  return `Food failed import quality checks: ${result.reasons.join(', ')}`
}
