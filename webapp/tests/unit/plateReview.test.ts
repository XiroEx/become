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
} from '../../lib/nutrition/plateReview'

import * as corePlateReview from '../../../shared/core/src/nutrition/plateReview'

describe('plateReview pure module', () => {
  describe('serving parsing & amount formatting', () => {
    it('parses typical AI strings', () => {
      assert.deepEqual(parseServing('1 kiwi'), { qty: 1, unit: 'kiwi' })
      assert.deepEqual(parseServing('2 kiwis'), { qty: 2, unit: 'kiwi' })
      assert.deepEqual(parseServing('~150 g'), { qty: 150, unit: 'g' })
      assert.deepEqual(parseServing('1 cup (240 g)'), { qty: 1, unit: 'cup' })
      assert.deepEqual(parseServing('3/4 cup'), { qty: 0.75, unit: 'cup' })
      assert.deepEqual(parseServing('6 bites'), { qty: 6, unit: 'bite' })
      assert.deepEqual(parseServing(''), { qty: 1, unit: 'serving' })
      assert.deepEqual(parseServing(undefined), { qty: 1, unit: 'serving' })
    })

    it('formats amount with proper unit and pluralization', () => {
      assert.equal(formatAmount(1, 'kiwi'), '1 kiwi')
      assert.equal(formatAmount(2, 'kiwi'), '2 kiwis')
      assert.equal(formatAmount(150, 'g'), '150 g')
      assert.equal(formatAmount(6, 'bite'), '6 bites')
    })

    it('normalizes units correctly', () => {
      assert.equal(normUnit('Grams'), 'g')
      assert.equal(normUnit('milliliters'), 'ml')
      assert.equal(normUnit('ounces'), 'oz')
      assert.equal(normUnit('liters'), 'l')
      assert.equal(normUnit('cup'), 'cup')
    })

    it('identifies known dimensional units', () => {
      assert.equal(toKnownUnit('g'), 'g')
      assert.equal(toKnownUnit('ml'), 'ml')
      assert.equal(toKnownUnit('oz'), 'oz')
      assert.equal(toKnownUnit('cup'), 'cup')
      assert.equal(toKnownUnit('tbsp'), 'tbsp')
      assert.equal(toKnownUnit('kiwi'), null)
    })
  })

  describe('nutrition scaling and math', () => {
    it('scales nutrition with rounding', () => {
      const item = {
        name: 'Rice',
        estimatedServing: '100 g',
        nutrition: { calories: 130, protein: 2.7, carbs: 28.2, fats: 0.3 },
        confidence: 0.9,
      }
      const scaled = scaledNutrition(item, 2)
      assert.equal(scaled.calories, 260)
      assert.equal(scaled.protein, 5.4)
      assert.equal(scaled.carbs, 56.4)
      assert.equal(scaled.fats, 0.6)
    })

    it('calculates running totals excluding removed items', () => {
      const items: ReviewItem[] = [
        {
          name: 'Chicken',
          estimatedServing: '100 g',
          nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
          confidence: 0.95,
          multiplier: 1,
          unitLabel: 'g',
          removed: false,
        },
        {
          name: 'Rice',
          estimatedServing: '100 g',
          nutrition: { calories: 130, protein: 2.7, carbs: 28.2, fats: 0.3 },
          confidence: 0.9,
          multiplier: 2,
          unitLabel: 'g',
          removed: false,
        },
        {
          name: 'Sauce',
          estimatedServing: '1 tbsp',
          nutrition: { calories: 50, protein: 0, carbs: 10, fats: 1 },
          confidence: 0.8,
          multiplier: 1,
          unitLabel: 'tbsp',
          removed: true,
        },
      ]
      const totals = runningTotal(items)
      assert.equal(totals.calories, 165 + 260)
      assert.equal(totals.protein, Math.round((31 + 5.4) * 10) / 10)
      assert.equal(totals.carbs, 56.4)
      assert.equal(totals.fats, Math.round((3.6 + 0.6) * 10) / 10)
    })

    it('normalizes confidence between 0 and 1, handling 1-5 scale', () => {
      assert.equal(normalizeConfidence(0.8), 0.8)
      assert.equal(normalizeConfidence(4), 0.8)
      assert.equal(normalizeConfidence(5), 1)
      assert.equal(normalizeConfidence(undefined), 0)
    })

    it('perUnit preserves exact intermediate precision', () => {
      assert.equal(perUnit(0.4), 0.4)
      assert.equal(perUnit(undefined), 0)
      assert.equal(perUnit(NaN), 0)
    })
  })

  describe('food alignment and DB matching', () => {
    const matchChicken: DbMatch = {
      kind: 'food',
      id: 'food_chicken',
      name: 'Chicken Breast',
      servingSize: 100,
      servingUnit: 'g',
      nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
      source: 'db',
      confidence: 1,
    }

    const matchEgg: DbMatch = {
      kind: 'food',
      id: 'food_egg',
      name: 'Large Egg',
      servingSize: 1,
      servingUnit: 'each',
      nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
      source: 'db',
      confidence: 1,
    }

    it('aligns dimensional units with scalingFactor', () => {
      const aligned = alignedServingsOfFood(200, 'g', matchChicken)
      assert.equal(aligned, 2)
    })

    it('aligns discrete units by count', () => {
      const aligned = alignedServingsOfFood(2, 'egg', matchEgg)
      assert.equal(aligned, 2)
    })

    it('applies matches, updating macros while keeping natural count', () => {
      const items: ReviewItem[] = [
        {
          name: 'chicken breast',
          estimatedServing: '200 g',
          nutrition: { calories: 1.5, protein: 0.3, carbs: 0, fats: 0.03 },
          confidence: 0.8,
          multiplier: 200,
          unitLabel: 'g',
          removed: false,
        },
      ]
      const matched = applyMatches(items, [matchChicken])
      assert.equal(matched.length, 1)
      assert.equal(matched[0]!.name, 'Chicken Breast')
      assert.equal(matched[0]!.matchChecked, true)
      assert.equal(matched[0]!.matchServingReliable, true)
      assert.equal(matched[0]!.match?.id, 'food_chicken')
      assert.equal(matched[0]!.multiplier, 200)
      assert.ok(Math.abs(matched[0]!.nutrition.calories - 1.65) < 0.001)
    })

    it('guards against empty match macros overriding real AI estimates', () => {
      const items: ReviewItem[] = [
        {
          name: 'Blueberries',
          estimatedServing: '100 g',
          nutrition: { calories: 0.57, protein: 0.007, carbs: 0.14, fats: 0.003 },
          confidence: 0.85,
          multiplier: 100,
          unitLabel: 'g',
          removed: false,
        },
      ]
      const brokenMatch: DbMatch = {
        kind: 'food',
        id: 'broken_bb',
        name: 'Broken Blueberries',
        servingSize: 100,
        servingUnit: 'g',
        nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        source: 'db',
        confidence: 1,
      }
      const result = applyMatches(items, [brokenMatch])
      assert.equal(result[0]!.match, null)
      assert.equal(result[0]!.matchChecked, true)
      assert.equal(result[0]!.nutrition.calories, 0.57)
    })
  })

  describe('conversions to ReviewItem, scan items, and metadata', () => {
    it('toReviewItems converts PlateEstimate properly', () => {
      const est = {
        items: [
          {
            name: 'Apple',
            estimatedServing: '1 medium',
            nutrition: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3 },
            confidence: 0.9,
          },
        ],
        total: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3 },
      }
      const reviewItems = toReviewItems(est)
      assert.equal(reviewItems.length, 1)
      assert.equal(reviewItems[0]!.name, 'Apple')
      assert.equal(reviewItems[0]!.multiplier, 1)
      assert.equal(reviewItems[0]!.unitLabel, 'medium')
      assert.equal(reviewItems[0]!.origServing?.label, '1 medium')
    })

    it('buildScanItems filters removed items and builds item shape', () => {
      const items: ReviewItem[] = [
        {
          name: 'Apple',
          estimatedServing: '1 medium',
          nutrition: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3 },
          confidence: 0.9,
          multiplier: 1,
          unitLabel: 'medium',
          removed: false,
        },
        {
          name: 'Pear',
          estimatedServing: '1 medium',
          nutrition: { calories: 100, protein: 1, carbs: 26, fats: 0.2 },
          confidence: 0.8,
          multiplier: 1,
          unitLabel: 'medium',
          removed: true,
        },
      ]
      const scanItems = buildScanItems(items)
      assert.equal(scanItems.length, 1)
      assert.equal(scanItems[0]!.name, 'Apple')
      assert.equal(scanItems[0]!.servings, 1)
    })

    it('combinedServingLabel formats nicely', () => {
      assert.equal(combinedServingLabel('1 cup (240 g)', 1), '1 cup (240 g)')
      assert.equal(combinedServingLabel('1 cup (240 g)', 2), '2 × 1 cup (240 g)')
    })
  })

  describe('1:1 parity with @become/core copy', () => {
    it('exports all 19 functions with identical output in shared/core', () => {
      assert.equal(typeof corePlateReview.scaledNutrition, 'function')
      assert.equal(typeof corePlateReview.runningTotal, 'function')
      assert.equal(typeof corePlateReview.normalizeConfidence, 'function')
      assert.equal(typeof corePlateReview.normUnit, 'function')
      assert.equal(typeof corePlateReview.parseServing, 'function')
      assert.equal(typeof corePlateReview.formatAmount, 'function')
      assert.equal(typeof corePlateReview.perUnitNutrition, 'function')
      assert.equal(typeof corePlateReview.toKnownUnit, 'function')
      assert.equal(typeof corePlateReview.alignedServingsOfFood, 'function')
      assert.equal(typeof corePlateReview.variantFromMatch, 'function')
      assert.equal(typeof corePlateReview.buildVariantForItem, 'function')
      assert.equal(typeof corePlateReview.matchingChoiceId, 'function')
      assert.equal(typeof corePlateReview.combinedServingLabel, 'function')
      assert.equal(typeof corePlateReview.toReviewItems, 'function')
      assert.equal(typeof corePlateReview.entryToReviewItem, 'function')
      assert.equal(typeof corePlateReview.perUnit, 'function')
      assert.equal(typeof corePlateReview.buildScanItems, 'function')
      assert.equal(typeof corePlateReview.buildGenerationFeedbackMetadata, 'function')
      assert.equal(typeof corePlateReview.applyMatches, 'function')

      // Check parseServing parity
      const parsedWeb = parseServing('3/4 cup (240 g)')
      const parsedCore = corePlateReview.parseServing('3/4 cup (240 g)')
      assert.deepEqual(parsedWeb, parsedCore)

      // Check runningTotal parity
      const items: ReviewItem[] = [
        {
          name: 'Oats',
          estimatedServing: '50 g',
          nutrition: { calories: 190, protein: 7, carbs: 34, fats: 3 },
          confidence: 1,
          multiplier: 1.5,
          unitLabel: 'g',
          removed: false,
        },
      ]
      assert.deepEqual(runningTotal(items), corePlateReview.runningTotal(items))
    })
  })
})
