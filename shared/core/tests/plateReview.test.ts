import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  type ReviewItem,
  type DbMatch,
  scaledNutrition,
  runningTotal,
  normalizeConfidence,
  normUnit,
  parseServing,
  formatAmount,
  perUnitNutrition,
  toKnownUnit,
  alignedServingsOfFood,
  variantFromMatch,
  buildVariantForItem,
  matchingChoiceId,
  combinedServingLabel,
  toReviewItems,
  entryToReviewItem,
  perUnit,
  buildScanItems,
  buildGenerationFeedbackMetadata,
  applyMatches,
} from '../src/index'

describe('@become/core plateReview', () => {
  it('parses fractional and standard servings', () => {
    assert.deepEqual(parseServing('3/4 cup'), { qty: 0.75, unit: 'cup' })
    assert.deepEqual(parseServing('1 1/2 tbsp'), { qty: 1.5, unit: 'tbsp' })
    assert.deepEqual(parseServing('150 g'), { qty: 150, unit: 'g' })
    assert.deepEqual(parseServing('2 kiwis'), { qty: 2, unit: 'kiwi' })
  })

  it('formats amounts correctly', () => {
    assert.equal(formatAmount(1, 'kiwi'), '1 kiwi')
    assert.equal(formatAmount(2, 'kiwi'), '2 kiwis')
    assert.equal(formatAmount(150, 'g'), '150 g')
  })

  it('normalizes units', () => {
    assert.equal(normUnit('grams'), 'g')
    assert.equal(normUnit('milliliters'), 'ml')
    assert.equal(normUnit('ounces'), 'oz')
  })

  it('scales nutrition and computes running totals', () => {
    const items: ReviewItem[] = [
      {
        name: 'Item A',
        estimatedServing: '100 g',
        nutrition: { calories: 100, protein: 10, carbs: 10, fats: 2 },
        confidence: 0.9,
        multiplier: 2,
        unitLabel: 'g',
        removed: false,
      },
      {
        name: 'Item B',
        estimatedServing: '100 g',
        nutrition: { calories: 50, protein: 5, carbs: 5, fats: 1 },
        confidence: 0.8,
        multiplier: 1,
        unitLabel: 'g',
        removed: true,
      },
    ]
    const totals = runningTotal(items)
    assert.equal(totals.calories, 200)
    assert.equal(totals.protein, 20)
    assert.equal(totals.carbs, 20)
    assert.equal(totals.fats, 4)
  })

  it('applies DB matches and aligns quantities', () => {
    const match: DbMatch = {
      kind: 'food',
      id: 'food_1',
      name: 'Greek Yogurt',
      servingSize: 100,
      servingUnit: 'g',
      nutrition: { calories: 59, protein: 10, carbs: 3.6, fats: 0.4 },
      source: 'db',
      confidence: 1,
    }
    const items: ReviewItem[] = [
      {
        name: 'yogurt',
        estimatedServing: '150 g',
        nutrition: { calories: 1, protein: 0.1, carbs: 0.1, fats: 0.01 },
        confidence: 0.8,
        multiplier: 150,
        unitLabel: 'g',
        removed: false,
      },
    ]
    const matched = applyMatches(items, [match])
    assert.equal(matched[0]!.name, 'Greek Yogurt')
    assert.equal(matched[0]!.matchChecked, true)
    assert.equal(matched[0]!.matchServingReliable, true)
    assert.equal(matched[0]!.multiplier, 150)
  })

  it('buildScanItems filters removed items and preserves exact nutrition precision', () => {
    const items: ReviewItem[] = [
      {
        name: 'Coffee',
        estimatedServing: '325 ml',
        nutrition: { calories: 0.4, protein: 0.1, carbs: 0, fats: 0 },
        confidence: 1,
        multiplier: 325,
        unitLabel: 'ml',
        removed: false,
      },
      {
        name: 'Sugar',
        estimatedServing: '1 packet',
        nutrition: { calories: 15, protein: 0, carbs: 4, fats: 0 },
        confidence: 1,
        multiplier: 1,
        unitLabel: 'packet',
        removed: true,
      },
    ]
    const scanItems = buildScanItems(items)
    assert.equal(scanItems.length, 1)
    assert.equal(scanItems[0]!.name, 'Coffee')
    assert.equal(scanItems[0]!.nutrition.calories, 0.4)
  })
})
