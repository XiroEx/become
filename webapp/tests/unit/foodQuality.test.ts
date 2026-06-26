import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assessFoodImportQuality,
  foodSearchIrrelevancePenalty,
  isGarbledFoodName,
  shouldSkipBackgroundImportForQuery,
  stripFoodQualifiers,
} from '@/lib/nutrition/foodQuality'

describe('foodQuality', () => {
  it('strips trailing prep qualifiers for search scoring', () => {
    assert.equal(stripFoodQualifiers('Bananas, raw'), 'Bananas')
    assert.equal(stripFoodQualifiers('Chicken breast, cooked, grilled'), 'Chicken breast')
  })

  it('penalizes low-relevance meat-adjacent results only when query is generic', () => {
    assert.equal(foodSearchIrrelevancePenalty('Fat, beef tallow', undefined, 'beef'), 300)
    assert.equal(foodSearchIrrelevancePenalty('Fat, beef tallow', undefined, 'beef tallow'), 0)
    assert.equal(foodSearchIrrelevancePenalty('Impossible Steak Bites', 'Impossible', 'steak'), 200)
    assert.equal(foodSearchIrrelevancePenalty('Impossible Steak Bites', 'Impossible', 'impossible steak'), 0)
    assert.equal(foodSearchIrrelevancePenalty('Frankfurter, beef', undefined, 'beef'), 150)
    assert.equal(foodSearchIrrelevancePenalty('Frankfurter, beef', undefined, 'beef hot dog'), 0)
  })

  it('uses query-sensitive skips for automatic background imports', () => {
    assert.equal(shouldSkipBackgroundImportForQuery({ name: 'Fat, beef tallow' }, 'beef'), true)
    assert.equal(shouldSkipBackgroundImportForQuery({ name: 'Fat, beef tallow' }, 'beef tallow'), false)
  })

  it('flags intrinsically bad import payloads', () => {
    const result = assessFoodImportQuality({
      name: 'Protein Bar',
      category: 'Snack',
      servingSize: 100,
      servingUnit: 'g',
      nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    })
    assert.equal(result.ok, false)
    assert.ok(result.reasons.includes('zero-nutrition'))
  })

  it('allows legitimate near-zero beverages', () => {
    const result = assessFoodImportQuality({
      name: 'Sparkling Water',
      category: 'Beverage',
      servingSize: 355,
      servingUnit: 'ml',
      nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    })
    assert.equal(result.ok, true)
  })

  it('detects garbled names without rejecting normal uppercase brands', () => {
    assert.equal(isGarbledFoodName('____ 1234 !!!!'), true)
    assert.equal(isGarbledFoodName('PEPSI ZERO SUGAR'), false)
  })
})
