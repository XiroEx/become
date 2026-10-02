import { z } from "zod";

export type MealPlanStatus = "active" | "promoted" | "skipped" | "superseded";

export const MealPlanNutritionSchema = z
  .object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fats: z.number().optional(),
    fiber: z.number().optional(),
  })
  .passthrough();

export const MealPlanItemSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    servings: z.number().optional(),
    servingSize: z.string().optional(),
    servingUnit: z.string().optional(),
    brand: z.string().optional(),
    nutrition: MealPlanNutritionSchema.optional(),
  })
  .passthrough();

export const MealPlanSchema = z
  .object({
    _id: z.string(),
    plannedDate: z.string(),
    plannedDateKey: z.string().optional(),
    tag: z.string(),
    items: z.array(MealPlanItemSchema).default([]),
    mealId: z.string().optional(),
    mealName: z.string().optional(),
    notes: z.string().optional(),
    expectedNutrition: MealPlanNutritionSchema.optional(),
    status: z
      .enum(["active", "promoted", "skipped", "superseded"])
      .default("active"),
    logId: z.string().optional(),
    promotedAt: z.string().optional(),
    seriesId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const PlansResponseSchema = z
  .object({
    plans: z.array(MealPlanSchema).default([]),
    days: z.array(z.any()).optional(),
  })
  .passthrough();

export type MealPlan = z.infer<typeof MealPlanSchema>;
export type PlansResponse = z.infer<typeof PlansResponseSchema>;
