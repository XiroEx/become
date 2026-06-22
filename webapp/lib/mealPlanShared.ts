import mongoose from 'mongoose'
import MealPlan, { IMealPlan } from '@/models/MealPlan'
import { IMealItem, IMealNutrition, computeTotalNutrition } from '@/models/Meal'
import { parsePlannedDateToUtcMidnight, plannedDateKey } from '@/lib/mealPlanDates'

// ---------------------------------------------------------------------------
// Shared helpers used by /api/meal-plans/* route handlers. Lives in lib/ so
// route files don't accidentally export non-handler symbols (Next.js App
// Router treats route.ts exports as HTTP methods).
// ---------------------------------------------------------------------------

export type ConflictMode = 'merge' | 'replace' | 'fail'

export function parseMode(v: unknown): ConflictMode {
  if (v === 'replace' || v === 'fail' || v === 'merge') return v
  return 'merge'
}

export interface SerializedPlan {
  _id: string
  plannedDate: string
  plannedDateKey: string
  tag: string
  items: IMealItem[]
  mealId?: string
  mealName?: string
  notes?: string
  expectedNutrition: IMealNutrition
  status: IMealPlan['status']
  logId?: string
  promotedAt?: string
  seriesId?: string
  createdAt?: Date
  updatedAt?: Date
}

export function serializePlan(plan: IMealPlan): SerializedPlan {
  const planned = plan.plannedDate instanceof Date ? plan.plannedDate : new Date(plan.plannedDate)
  return {
    _id: String(plan._id),
    plannedDate: planned.toISOString(),
    plannedDateKey: plannedDateKey(planned),
    tag: plan.tag,
    items: plan.items,
    mealId: plan.mealId ? String(plan.mealId) : undefined,
    mealName: plan.mealName,
    notes: plan.notes,
    expectedNutrition: plan.expectedNutrition,
    status: plan.status,
    logId: plan.logId ? String(plan.logId) : undefined,
    promotedAt: plan.promotedAt instanceof Date ? plan.promotedAt.toISOString() : (plan.promotedAt ? new Date(plan.promotedAt).toISOString() : undefined),
    seriesId: plan.seriesId ? String(plan.seriesId) : undefined,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }
}

export interface CreatePlanInput {
  userId: string
  plannedDateKey: string
  tag: string
  items: IMealItem[]
  mealId?: mongoose.Types.ObjectId
  mealName?: string
  notes?: string
  seriesId?: mongoose.Types.ObjectId
  mode: ConflictMode
}

export interface CreatePlanResult {
  plan: SerializedPlan
  outcome: 'created' | 'merged' | 'replaced' | 'conflict'
  existingPlan?: SerializedPlan
}

/**
 * Apply create / merge / replace / fail logic for a single (date, tag) slot.
 * - merge:    append items into the active plan if one exists, else create.
 * - replace:  overwrite an existing active plan's items, else create.
 * - fail:     conflict result if an active plan already exists, else create.
 */
export async function createOrMergePlan(input: CreatePlanInput): Promise<CreatePlanResult> {
  const plannedDate = parsePlannedDateToUtcMidnight(input.plannedDateKey)
  const tag = input.tag.toLowerCase()

  const existing = await MealPlan.findOne({
    user: input.userId,
    plannedDate,
    tag,
    status: 'active',
  })

  if (existing) {
    if (input.mode === 'fail') {
      const snapshot = serializePlan(existing.toObject())
      return { plan: snapshot, outcome: 'conflict', existingPlan: snapshot }
    }
    if (input.mode === 'replace') {
      existing.items = input.items
      if (input.mealId) existing.mealId = input.mealId
      if (input.mealName) existing.mealName = input.mealName
      if (input.notes !== undefined) existing.notes = input.notes
      if (input.seriesId && !existing.seriesId) existing.seriesId = input.seriesId
      await existing.save()
      return { plan: serializePlan(existing.toObject()), outcome: 'replaced' }
    }
    // merge — append
    existing.items = [...existing.items, ...input.items]
    if (input.notes && !existing.notes) existing.notes = input.notes
    if (input.mealId && !existing.mealId) existing.mealId = input.mealId
    if (input.mealName && !existing.mealName) existing.mealName = input.mealName
    if (input.seriesId && !existing.seriesId) existing.seriesId = input.seriesId
    await existing.save()
    return { plan: serializePlan(existing.toObject()), outcome: 'merged' }
  }

  const created = await MealPlan.create({
    user: input.userId,
    plannedDate,
    tag,
    items: input.items,
    mealId: input.mealId,
    mealName: input.mealName,
    notes: input.notes,
    expectedNutrition: computeTotalNutrition(input.items),
    status: 'active',
    seriesId: input.seriesId,
  })
  return { plan: serializePlan(created.toObject()), outcome: 'created' }
}

export function emptyNutrition(): IMealNutrition {
  return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, saturatedFat: 0 }
}

export function addNutrition(target: IMealNutrition, src: IMealNutrition): void {
  target.calories += src.calories || 0
  target.protein += src.protein || 0
  target.carbs += src.carbs || 0
  target.fats += src.fats || 0
  target.fiber! += src.fiber || 0
  target.sugar! += src.sugar || 0
  target.sodium! += src.sodium || 0
  target.saturatedFat! += src.saturatedFat || 0
}

export function roundNutrition(n: IMealNutrition): IMealNutrition {
  return {
    calories: Math.round(n.calories * 10) / 10,
    protein: Math.round(n.protein * 10) / 10,
    carbs: Math.round(n.carbs * 10) / 10,
    fats: Math.round(n.fats * 10) / 10,
    fiber: Math.round((n.fiber ?? 0) * 10) / 10,
    sugar: Math.round((n.sugar ?? 0) * 10) / 10,
    sodium: Math.round((n.sodium ?? 0) * 1000) / 1000,
    saturatedFat: Math.round((n.saturatedFat ?? 0) * 10) / 10,
  }
}

/**
 * Clone an existing item array as a fresh snapshot (drop sub-doc _id) for
 * planting into a new plan/log. Mirrors the pattern in /api/meals/[id]/log.
 */
export function cloneItemsForSnapshot(items: IMealItem[]): IMealItem[] {
  return items.map(item => ({
    foodId: item.foodId,
    variantId: item.variantId,
    variantName: item.variantName,
    name: item.name,
    brand: item.brand,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    servings: item.servings ?? 1,
    nutrition: item.nutrition,
    servingLabel: item.servingLabel,
    loggedQuantity: item.loggedQuantity,
    loggedUnit: item.loggedUnit,
    loggedGramsPerServing: item.loggedGramsPerServing,
    loggedMlPerServing: item.loggedMlPerServing,
  }))
}
