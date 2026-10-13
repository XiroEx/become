// Run with: npm run test:file tests/unit/nutritionParity.test.ts
//
// Acceptance test (e015c7fa):
// For the fixture foods, the native copies return the same grams, units and nutrition
// as the web modules across:
//   1. Mass-native foods
//   2. Volume-native foods
//   3. Discrete foods (unbridged count)
//   4. Bridged servings (mass/volume bridge, realServing, scalingFactor)
//   5. Multi-variant foods
//   6. Day ordering with untimed logs and plans

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Web modules (source of truth)
import * as webUnits from '../../lib/units'
import * as webFoodMath from '../../lib/foodMath'
import * as webServingOptions from '../../lib/nutrition/servingOptions'
import * as webServingStep from '../../lib/nutrition/servingQuantityStep'
import * as webDayOrder from '../../lib/nutrition/dayOrder'
import * as webMealSchedule from '../../lib/nutrition/mealSchedule'
import * as webMealPlanTimes from '../../lib/mealPlanTimes'
import * as webMealPlanDates from '../../lib/mealPlanDates'
import * as webLogTagMatch from '../../lib/nutrition/logTagMatch'
import * as webGoalLine from '../../lib/nutrition/goalLine'
import * as webNutritionTrend from '../../lib/dashboard/nutritionTrend'

// Native copies in @become/core
import * as coreUnits from '../../../shared/core/src/units'
import * as coreFoodMath from '../../../shared/core/src/foodMath'
import * as coreServingOptions from '../../../shared/core/src/nutrition/servingOptions'
import * as coreServingStep from '../../../shared/core/src/nutrition/servingQuantityStep'
import * as coreDayOrder from '../../../shared/core/src/nutrition/dayOrder'
import * as coreMealSchedule from '../../../shared/core/src/nutrition/mealSchedule'
import * as coreMealPlanTimes from '../../../shared/core/src/mealPlanTimes'
import * as coreMealPlanDates from '../../../shared/core/src/mealPlanDates'
import * as coreLogTagMatch from '../../../shared/core/src/nutrition/logTagMatch'
import * as coreGoalLine from '../../../shared/core/src/nutrition/goalLine'
import * as coreNutritionTrend from '../../../shared/core/src/nutrition/nutritionTrend'

// ── Fixture foods ─────────────────────────────────────────────────────────────

/** 1. Mass-native: Chicken Breast (100g basis) */
const CHICKEN_BREAST = {
  servingSize: 100,
  servingUnit: 'g' as const,
  alternateServings: [
    { label: '1 breast (172 g)', multiplier: 1.72 },
    { label: '1 oz', multiplier: 0.283495 },
  ],
  nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6, sodium: 74 },
}

/** 2. Volume-native: Whole Milk (240 ml basis) */
const WHOLE_MILK = {
  servingSize: 240,
  servingUnit: 'ml' as const,
  displayLabel: '1 cup',
  alternateServings: [{ label: '1 cup', multiplier: 1 }],
  nutrition: { calories: 149, protein: 7.7, carbs: 11.7, fats: 8 },
}

/** 3. Discrete unbridged: Large Egg (1 each) */
const LARGE_EGG = {
  servingSize: 1,
  servingUnit: 'each' as const,
  nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
}

/** 4. Discrete with gram bridge: Protein Bar (1 bar = 60g) */
const PROTEIN_BAR = {
  servingSize: 1,
  servingUnit: 'each' as const,
  displayLabel: '1 bar (60 g)',
  gramsPerServing: 60,
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7, fiber: 9 },
}

/** 5. Mass-native with portion bridge: Broccoli Florets (100g basis, 85g portion) */
const BROCCOLI = {
  servingSize: 100,
  servingUnit: 'g' as const,
  displayLabel: '1 portion (85 g)',
  gramsPerServing: 85,
  nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
}

/** 6. Multi-variant: Whey Protein Powder */
const WHEY_VARIANTS = [
  {
    name: 'Chocolate',
    isDefault: true,
    servingSize: 1,
    servingUnit: 'scoop' as const,
    gramsPerServing: 32,
    alternateServings: [{ label: '1 rounded scoop', multiplier: 1.1 }],
    nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
  },
  {
    name: 'Vanilla',
    isDefault: false,
    servingSize: 1,
    servingUnit: 'scoop' as const,
    gramsPerServing: 30,
    alternateServings: [],
    nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1.5 },
  },
]

describe('native parity with web nutrition modules (e015c7fa)', () => {
  describe('1. Mass-native foods', () => {
    it('returns identical grams, units, scaling factor and nutrition across mass units', () => {
      const quantities = [
        { q: 100, u: 'g' as const },
        { q: 200, u: 'g' as const },
        { q: 4, u: 'oz' as const },
        { q: 0.5, u: 'lb' as const },
      ]

      for (const { q, u } of quantities) {
        const webFactor = webFoodMath.scalingFactor(CHICKEN_BREAST, q, u)
        const coreFactor = coreFoodMath.scalingFactor(CHICKEN_BREAST, q, u)
        assert.equal(coreFactor, webFactor)

        const webNutr = webFoodMath.nutritionForQuantity(CHICKEN_BREAST, q, u)
        const coreNutr = coreFoodMath.nutritionForQuantity(CHICKEN_BREAST, q, u)
        assert.deepEqual(coreNutr, webNutr)

        const webGrams = webFoodMath.realServing(CHICKEN_BREAST)
        const coreGrams = coreFoodMath.realServing(CHICKEN_BREAST)
        assert.deepEqual(coreGrams, webGrams)
      }
    })
  })

  describe('2. Volume-native foods', () => {
    it('returns identical volume conversions and scaled nutrition across volume units', () => {
      const volumeTests = [
        { q: 240, u: 'ml' as const },
        { q: 1, u: 'cup' as const },
        { q: 8, u: 'fl_oz' as const },
        { q: 2, u: 'tbsp' as const },
      ]

      for (const { q, u } of volumeTests) {
        const webFactor = webFoodMath.scalingFactor(WHOLE_MILK, q, u)
        const coreFactor = coreFoodMath.scalingFactor(WHOLE_MILK, q, u)
        assert.equal(coreFactor, webFactor)

        const webNutr = webFoodMath.nutritionForQuantity(WHOLE_MILK, q, u)
        const coreNutr = coreFoodMath.nutritionForQuantity(WHOLE_MILK, q, u)
        assert.deepEqual(coreNutr, webNutr)
      }

      const webReal = webFoodMath.realServing(WHOLE_MILK)
      const coreReal = coreFoodMath.realServing(WHOLE_MILK)
      assert.deepEqual(coreReal, webReal)
      assert.deepEqual(coreReal, { ml: 240 })
    })
  })

  describe('3. Discrete unbridged foods', () => {
    it('returns null for weight and scales macros strictly by discrete counts', () => {
      const webReal = webFoodMath.realServing(LARGE_EGG)
      const coreReal = coreFoodMath.realServing(LARGE_EGG)
      assert.equal(coreReal, null)
      assert.equal(webReal, null)

      for (const count of [1, 2, 3.5]) {
        const webFactor = webFoodMath.scalingFactor(LARGE_EGG, count, 'each')
        const coreFactor = coreFoodMath.scalingFactor(LARGE_EGG, count, 'each')
        assert.equal(coreFactor, webFactor)

        const webNutr = webFoodMath.nutritionForQuantity(LARGE_EGG, count, 'each')
        const coreNutr = coreFoodMath.nutritionForQuantity(LARGE_EGG, count, 'each')
        assert.deepEqual(coreNutr, webNutr)
      }
    })
  })

  describe('4. Discrete with gram bridge and portion bridging', () => {
    it('returns identical grams, units and nutrition for bridged protein bar', () => {
      const webReal = webFoodMath.realServing(PROTEIN_BAR)
      const coreReal = coreFoodMath.realServing(PROTEIN_BAR)
      assert.deepEqual(coreReal, { grams: 60 })
      assert.deepEqual(coreReal, webReal)

      // Bridge: 120 g -> 2 bars
      const webViaGrams = webFoodMath.nutritionForQuantity(PROTEIN_BAR, 120, 'g')
      const coreViaGrams = coreFoodMath.nutritionForQuantity(PROTEIN_BAR, 120, 'g')
      assert.deepEqual(coreViaGrams, webViaGrams)

      const webViaEach = webFoodMath.nutritionForQuantity(PROTEIN_BAR, 2, 'each')
      const coreViaEach = coreFoodMath.nutritionForQuantity(PROTEIN_BAR, 2, 'each')
      assert.deepEqual(coreViaEach, webViaEach)
      assert.deepEqual(coreViaGrams, coreViaEach)

      // convertWithBridge
      assert.equal(
        coreUnits.convertWithBridge(120, 'g', 'each', PROTEIN_BAR),
        webUnits.convertWithBridge(120, 'g', 'each', PROTEIN_BAR)
      )
      assert.equal(coreUnits.convertWithBridge(120, 'g', 'each', PROTEIN_BAR), 2)
    })

    it('returns identical serving choices and effective variants for broccoli portion', () => {
      const webGroups = webServingOptions.buildServingChoiceGroups(BROCCOLI)
      const coreGroups = coreServingOptions.buildServingChoiceGroups(BROCCOLI)
      assert.deepEqual(coreGroups, webGroups)

      const webChoice = webGroups.servings[0]!
      const coreChoice = coreGroups.servings[0]!
      assert.deepEqual(coreChoice, webChoice)

      const webEffective = webServingOptions.variantForServingChoice(BROCCOLI, webChoice)
      const coreEffective = coreServingOptions.variantForServingChoice(BROCCOLI, coreChoice)
      assert.deepEqual(coreEffective, webEffective)

      const webScaled = webFoodMath.nutritionForQuantity(webEffective, 4, 'serving')
      const coreScaled = coreFoodMath.nutritionForQuantity(coreEffective, 4, 'serving')
      assert.deepEqual(coreScaled, webScaled)
    })
  })

  describe('5. Multi-variant foods', () => {
    it('returns identical scaling and macros across variants', () => {
      for (const variant of WHEY_VARIANTS) {
        const webGroups = webServingOptions.buildServingChoiceGroups(variant)
        const coreGroups = coreServingOptions.buildServingChoiceGroups(variant)
        assert.deepEqual(coreGroups, webGroups)

        for (const scoops of [1, 2]) {
          const webNutr = webFoodMath.nutritionForQuantity(variant, scoops, 'scoop')
          const coreNutr = coreFoodMath.nutritionForQuantity(variant, scoops, 'scoop')
          assert.deepEqual(coreNutr, webNutr)
        }

        const grams = variant.gramsPerServing * 2
        const webGramsNutr = webFoodMath.nutritionForQuantity(variant, grams, 'g')
        const coreGramsNutr = coreFoodMath.nutritionForQuantity(variant, grams, 'g')
        assert.deepEqual(coreGramsNutr, webGramsNutr)
      }
    })
  })

  describe('6. Day ordering with untimed logs and plans', () => {
    it('produces identical occurrences and sorting for timed and untimed logs and plans', () => {
      const logs = [
        { _id: 'l1', loggedAt: '2026-09-30T08:00:00Z', tags: ['breakfast'] },
        { _id: 'l2', loggedAt: '2026-09-30T12:30:00Z', tags: ['lunch'] },
        { _id: 'l3', loggedAt: '2026-09-30T19:00:00Z', tags: ['dinner'] },
        // Untimed log:
        { _id: 'l_untimed', loggedAt: '2026-09-30T00:00:00Z', tags: ['snack'], untimed: true },
      ]
      const plans = [
        { _id: 'p1', tag: 'breakfast', status: 'active' },
        { _id: 'p2', tag: 'bed', status: 'active' },
      ]
      const windows = [
        { tag: 'breakfast', startMinutes: 420, endMinutes: 540 },
        { tag: 'lunch', startMinutes: 720, endMinutes: 840 },
        { tag: 'dinner', startMinutes: 1080, endMinutes: 1260 },
        { tag: 'bed', startMinutes: null, endMinutes: null },
      ]

      const webOcc = webDayOrder.buildDayOccurrences(logs, plans, windows)
      const coreOcc = coreDayOrder.buildDayOccurrences(logs, plans, windows)
      assert.deepEqual(coreOcc, webOcc)

      const webUnused = webDayOrder.unusedTags(webOcc, ['breakfast', 'lunch', 'dinner', 'snack', 'bed'])
      const coreUnused = coreDayOrder.unusedTags(coreOcc, ['breakfast', 'lunch', 'dinner', 'snack', 'bed'])
      assert.deepEqual(coreUnused, webUnused)
    })
  })

  describe('7. Pure nutrition helper utilities', () => {
    it('returns identical serving quantity steps across all units', () => {
      const units = ['g', 'oz', 'cup', 'tbsp', 'tsp', 'each', 'scoop', 'slice', 'custom']
      for (const u of units) {
        assert.equal(coreServingStep.servingQuantityStep(u), webServingStep.servingQuantityStep(u))
      }
    })

    it('returns identical goal line calculations', () => {
      const inputs = [
        { calories: 2500, targetWeight: 200, unit: 'lbs' as const, direction: 'lose' as const, paceStatus: 'on' as const },
        { calories: 2800, targetWeight: 90, unit: 'kg' as const, direction: 'gain' as const, paceStatus: 'ahead' as const },
        { calories: 2000, targetWeight: null, unit: 'lbs' as const, direction: null, paceStatus: null },
      ]
      for (const inp of inputs) {
        assert.equal(coreGoalLine.nutritionGoalLine(inp), webGoalLine.nutritionGoalLine(inp))
      }
    })

    it('returns identical log tag matching behavior', () => {
      const logs = [
        { tags: ['breakfast'], mealName: undefined },
        { tags: ['dinner'], mealName: 'Steak Dinner' },
      ]
      assert.deepEqual(
        coreLogTagMatch.findLogForTag(logs, 'breakfast', ['breakfast', 'lunch', 'dinner']),
        webLogTagMatch.findLogForTag(logs, 'breakfast', ['breakfast', 'lunch', 'dinner'])
      )
      assert.deepEqual(
        coreLogTagMatch.findLogForTag(logs, 'dinner', ['breakfast', 'lunch', 'dinner']),
        webLogTagMatch.findLogForTag(logs, 'dinner', ['breakfast', 'lunch', 'dinner'])
      )
    })

    it('returns identical meal plan times and dates helpers', () => {
      assert.deepEqual(coreMealPlanTimes.defaultTimeForTag('breakfast'), webMealPlanTimes.defaultTimeForTag('breakfast'))
      assert.deepEqual(coreMealPlanTimes.defaultTimeForTag('lunch'), webMealPlanTimes.defaultTimeForTag('lunch'))
      assert.deepEqual(coreMealPlanTimes.defaultTimeForTag('dinner'), webMealPlanTimes.defaultTimeForTag('dinner'))

      const date = new Date('2026-09-30T12:00:00.000Z')
      const iso = '2026-09-30T12:00:00.000Z'
      assert.equal(coreMealPlanDates.plannedDateKey(date), webMealPlanDates.plannedDateKey(date))
      assert.deepEqual(coreMealPlanDates.localDateFromPlannedIso(iso), webMealPlanDates.localDateFromPlannedIso(iso))
      assert.equal(coreMealPlanDates.addDaysToKey('2026-09-30', 3), webMealPlanDates.addDaysToKey('2026-09-30', 3))
    })

    it('returns identical 7-day nutrition trend summary and line', () => {
      const days = [
        { date: '2026-09-26', calories: 1650, protein: 90, hasData: true, mealCount: 3 },
        { date: '2026-09-27', calories: 1700, protein: 95, hasData: true, mealCount: 3 },
        { date: '2026-09-28', calories: 1600, protein: 85, hasData: true, mealCount: 2 },
        { date: '2026-09-29', calories: 1680, protein: 100, hasData: true, mealCount: 3 },
        { date: '2026-09-30', calories: 1640, protein: 90, hasData: true, mealCount: 3 },
        { date: '2026-10-01', calories: 1654, protein: 110, hasData: true, mealCount: 3 },
        { date: '2026-10-02', calories: 0, protein: 0, hasData: false, mealCount: 0 },
      ]
      const goals = { calories: 2000, protein: 150 }
      const webResult = webNutritionTrend.describeNutritionTrend(days, goals)
      const coreResult = coreNutritionTrend.describeNutritionTrend(days, goals)
      assert.deepEqual(coreResult, webResult)
    })
  })
})
