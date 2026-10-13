import type { Unit } from '@/lib/units'

/**
 * Practical step sizes for the estimate-review quantity control.
 *
 * Metric base units move one unit at a time, kitchen and imperial units use
 * familiar quarter-unit increments, and countable servings keep half steps so
 * amounts such as half an avocado remain representable.
 */
const STEP_BY_UNIT: Record<Unit, number> = {
  mg: 1,
  g: 1,
  kg: 0.01,
  oz: 0.25,
  lb: 0.25,
  ml: 1,
  liter: 0.01,
  fl_oz: 0.25,
  cup: 0.25,
  tbsp: 0.25,
  tsp: 0.25,
  pint: 0.25,
  quart: 0.25,
  each: 0.5,
  slice: 0.5,
  scoop: 0.5,
  serving: 0.5,
}

const DEFAULT_COUNT_STEP = 0.5

/** Unknown AI count nouns ("avocado", "bite", etc.) retain half-unit steps. */
export function servingQuantityStep(unit: string): number {
  const normalized = unit.trim().toLowerCase()
  return STEP_BY_UNIT[normalized as Unit] ?? DEFAULT_COUNT_STEP
}
