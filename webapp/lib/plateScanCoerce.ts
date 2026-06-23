import mongoose from 'mongoose'
import type { IPlateScanItem } from '@/models/PlateScan'
import type { IMealNutrition } from '@/models/Meal'

function num(v: unknown, d = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : d
}

export function coerceItem(raw: Record<string, unknown>): IPlateScanItem | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const n = (raw.nutrition ?? {}) as Record<string, unknown>
  const nutrition: IMealNutrition = {
    calories: num(n.calories), protein: num(n.protein), carbs: num(n.carbs), fats: num(n.fats),
  }
  const foodId = typeof raw.foodId === 'string' && mongoose.Types.ObjectId.isValid(raw.foodId)
    ? new mongoose.Types.ObjectId(raw.foodId) : undefined
  const matchKind = raw.matchKind === 'food' || raw.matchKind === 'meal' || raw.matchKind === 'recipe'
    ? raw.matchKind : undefined
  return {
    foodId,
    name: name.slice(0, 200),
    brand: typeof raw.brand === 'string' ? raw.brand.slice(0, 120) : undefined,
    estimatedServing: typeof raw.estimatedServing === 'string' ? raw.estimatedServing.slice(0, 80) : undefined,
    servingSize: num(raw.servingSize, 1),
    servingUnit: typeof raw.servingUnit === 'string' && raw.servingUnit ? raw.servingUnit : 'serving',
    servings: num(raw.servings, 1),
    nutrition,
    confidence: raw.confidence != null ? num(raw.confidence) : undefined,
    matchKind,
  }
}
