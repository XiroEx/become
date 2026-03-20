/**
 * USDA FoodData Central API integration.
 *
 * Free API — get a key at https://fdc.nal.usda.gov/api-key-signup
 * Set USDA_API_KEY env var (falls back to DEMO_KEY with low rate limits).
 *
 * Searches Branded + Survey (FNDDS) foods and maps to our FoodItem shape.
 */

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

interface USDANutrient {
  nutrientId: number
  nutrientName: string
  value: number
  unitName: string
}

interface USDAFood {
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
}

interface USDASearchResponse {
  foods: USDAFood[]
  totalHits: number
}

function getNutrient(nutrients: USDANutrient[], id: number): number | undefined {
  const n = nutrients.find(x => x.nutrientId === id)
  return n?.value
}

function mapCategory(usdaCategory: string | undefined): string {
  if (!usdaCategory) return 'Other'
  const c = usdaCategory.toLowerCase()
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
  source: 'usda'
  dataType?: string
}

export async function searchUSDA(query: string, limit: number = 15): Promise<MappedFoodResult[]> {
  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY'

  try {
    const params = new URLSearchParams({
      query,
      api_key: apiKey,
      pageSize: limit.toString(),
      dataType: 'Branded,Survey (FNDDS)',
    })

    const res = await fetch(`${API_BASE}/foods/search?${params}`, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!res.ok) return []

    const data: USDASearchResponse = await res.json()
    if (!data.foods?.length) return []

    return data.foods
      .map((food): MappedFoodResult | null => {
        const cal = getNutrient(food.foodNutrients, NUTRIENT_IDS.calories)
        if (cal == null || cal <= 0) return null

        const servingSize = food.servingSize || 100
        const servingUnit = (food.servingSizeUnit || 'g').toLowerCase()

        // USDA nutrients are per 100g. Scale to actual serving size.
        const scale = servingSize / 100

        const nutrition = {
          calories: Math.round((cal) * scale),
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
            ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.sodium)!) * scale / 1000 * 10000) / 10000 // mg → g
            : undefined,
          saturatedFat: getNutrient(food.foodNutrients, NUTRIENT_IDS.saturatedFat) != null
            ? Math.round((getNutrient(food.foodNutrients, NUTRIENT_IDS.saturatedFat)!) * scale * 10) / 10
            : undefined,
        }

        // Build alternate servings
        const alternateServings: { label: string; multiplier: number }[] = []

        // If serving size isn't 100g, offer 100g as alternate
        if (servingSize !== 100) {
          alternateServings.push({
            label: '100 g',
            multiplier: 100 / servingSize,
          })
        }

        // If there's a household serving description (e.g. "1 cup", "2 tbsp")
        if (food.householdServingFullText && food.servingSize) {
          // Already using servingSize as default, household text is just a label
        }

        const brand = food.brandOwner || food.brandName || undefined

        return {
          _id: `usda-${food.fdcId}`,
          name: food.description,
          brand,
          category: mapCategory(food.foodCategory),
          servingSize,
          servingUnit: servingUnit === 'ml' ? 'ml' : 'g',
          alternateServings: alternateServings.length > 0 ? alternateServings : undefined,
          nutrition,
          source: 'usda',
          dataType: food.dataType,
        }
      })
      .filter((f): f is MappedFoodResult => f !== null)
  } catch {
    // USDA API down or timeout — fail silently
    return []
  }
}
