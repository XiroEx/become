import { z } from 'zod';

/**
 * GET /api/nutrition/log?date=… — the day's meal log. Mirrors
 * webapp/app/api/nutrition/log/route.ts (note: the real route is
 * `/api/nutrition/log`, not `/api/nutrition/meallog`). Foods carry a `nutrition`
 * block keyed `calories/protein/carbs/fats` (fats plural).
 */
export const FoodNutritionSchema = z
  .object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
  })
  .passthrough();

export const MealLogFoodSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    servings: z.number().optional(),
    nutrition: FoodNutritionSchema,
  })
  .passthrough();

export const MealLogMealSchema = z
  .object({
    id: z.string().optional(),
    mealType: z.string(),
    foods: z.array(MealLogFoodSchema).default([]),
    loggedAt: z.string().optional(),
  })
  .passthrough();

export const NutritionGoalsSchema = z
  .object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fats: z.number().optional(),
    waterGoal: z.number().optional(),
  })
  .passthrough();

export const MealLogResponseSchema = z
  .object({
    date: z.string().optional(),
    meals: z.array(MealLogMealSchema).default([]),
    goals: NutritionGoalsSchema.optional(),
    dailyTotals: z.unknown().optional(),
  })
  .passthrough();

export type FoodNutrition = z.infer<typeof FoodNutritionSchema>;
export type MealLogFood = z.infer<typeof MealLogFoodSchema>;
export type MealLogMeal = z.infer<typeof MealLogMealSchema>;
export type NutritionGoals = z.infer<typeof NutritionGoalsSchema>;
export type MealLogResponse = z.infer<typeof MealLogResponseSchema>;

// ---------------------------------------------------------------------------
// Food search + detail. GET /api/nutrition/foods?q=… returns a ranked
// three-source list { foods, total, offset, limit }; GET /api/nutrition/foods/[id]
// returns { food }. Nutrition values may be null on flattened records, so use a
// permissive nutrition shape here. Mirrors webapp/app/api/nutrition/foods/*.
// ---------------------------------------------------------------------------

export const FlexNutritionSchema = z
  .object({
    calories: z.number().nullable().optional(),
    protein: z.number().nullable().optional(),
    carbs: z.number().nullable().optional(),
    fats: z.number().nullable().optional(),
  })
  .passthrough();

export const FoodSearchItemSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    brand: z.string().nullable().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
    calories: z.number().optional(),
    nutrition: FlexNutritionSchema.optional(),
    isSaved: z.boolean().optional(),
  })
  .passthrough();

export const FoodSearchResponseSchema = z
  .object({
    foods: z.array(FoodSearchItemSchema).default([]),
    total: z.number().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

export const FoodDetailFoodSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    brand: z.string().nullable().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
    nutrition: FlexNutritionSchema.optional(),
    variants: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const FoodDetailResponseSchema = z
  .object({
    food: FoodDetailFoodSchema,
  })
  .passthrough();

export type FoodSearchItem = z.infer<typeof FoodSearchItemSchema>;
export type FoodSearchResponse = z.infer<typeof FoodSearchResponseSchema>;
export type FoodDetailFood = z.infer<typeof FoodDetailFoodSchema>;
export type FoodDetailResponse = z.infer<typeof FoodDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Recipes. GET /api/nutrition/recipes → { recipes, total, … };
// GET /api/nutrition/recipes/[id] → the Recipe doc directly (unwrapped).
// Mirrors webapp/models/Recipe.ts + app/api/nutrition/recipes/*.
// ---------------------------------------------------------------------------

export const RecipeNutritionSchema = z
  .object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
  })
  .passthrough();

export const RecipeIngredientSchema = z
  .object({
    name: z.string(),
    amount: z.number().optional(),
    unit: z.string().optional(),
    nutrition: RecipeNutritionSchema.optional(),
  })
  .passthrough();

export const RecipeSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    servings: z.number().optional(),
    ingredients: z.array(RecipeIngredientSchema).default([]),
    instructions: z.array(z.string()).default([]),
    nutrition: RecipeNutritionSchema.optional(),
    imageUrl: z.string().optional(),
    isPublic: z.boolean().optional(),
    gramsPerServing: z.number().optional(),
  })
  .passthrough();

export const RecipesListResponseSchema = z
  .object({
    recipes: z.array(RecipeSchema).default([]),
    total: z.number().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  })
  .passthrough();

/** GET /api/nutrition/recipes/[id] returns the recipe doc directly. */
export const RecipeDetailResponseSchema = RecipeSchema;

export type RecipeNutrition = z.infer<typeof RecipeNutritionSchema>;
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipesListResponse = z.infer<typeof RecipesListResponseSchema>;
export type RecipeDetailResponse = z.infer<typeof RecipeDetailResponseSchema>;
