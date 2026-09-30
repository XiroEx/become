import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDayOccurrences,
  buildServingChoiceGroups,
  convert,
  convertWithBridge,
  defaultTimeForTag,
  familyOf,
  findLogForTag,
  localDateFromPlannedIso,
  nutritionForQuantity,
  nutritionGoalLine,
  plannedDateKey,
  realServing,
  scalingFactor,
  servingQuantityStep,
  unusedTags,
  variantForServingChoice,
} from '../src/index'

const CHICKEN_BREAST = {
  servingSize: 100,
  servingUnit: 'g' as const,
  alternateServings: [
    { label: '1 breast (172 g)', multiplier: 1.72 },
    { label: '1 oz', multiplier: 0.283495 },
  ],
  nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6, sodium: 74 },
}

const WHOLE_MILK = {
  servingSize: 240,
  servingUnit: 'ml' as const,
  displayLabel: '1 cup',
  alternateServings: [{ label: '1 cup', multiplier: 1 }],
  nutrition: { calories: 149, protein: 7.7, carbs: 11.7, fats: 8 },
}

const LARGE_EGG = {
  servingSize: 1,
  servingUnit: 'each' as const,
  nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
}

const PROTEIN_BAR = {
  servingSize: 1,
  servingUnit: 'each' as const,
  displayLabel: '1 bar (60 g)',
  gramsPerServing: 60,
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7, fiber: 9 },
}

const BROCCOLI = {
  servingSize: 100,
  servingUnit: 'g' as const,
  displayLabel: '1 portion (85 g)',
  gramsPerServing: 85,
  nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
}

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

describe('@become/core nutrition logic', () => {
  it('mass-native scaling and conversions', () => {
    assert.deepEqual(realServing(CHICKEN_BREAST), { grams: 100 })
    assert.equal(familyOf('g'), 'mass')
    assert.equal(scalingFactor(CHICKEN_BREAST, 200, 'g'), 2)
    const n = nutritionForQuantity(CHICKEN_BREAST, 200, 'g')
    assert.equal(n.calories, 330)
    assert.equal(n.protein, 62)
    assert.ok(Math.abs(convert(1, 'oz', 'g') - 28.3495) < 0.001)
  })

  it('volume-native scaling', () => {
    assert.deepEqual(realServing(WHOLE_MILK), { ml: 240 })
    assert.equal(familyOf('cup'), 'volume')
    assert.equal(scalingFactor(WHOLE_MILK, 2, 'cup'), 2)
    const n = nutritionForQuantity(WHOLE_MILK, 2, 'cup')
    assert.equal(n.calories, 298)
    assert.equal(n.protein, 15.4)
  })

  it('discrete unbridged counts', () => {
    assert.equal(realServing(LARGE_EGG), null)
    assert.equal(scalingFactor(LARGE_EGG, 3, 'each'), 3)
    const n = nutritionForQuantity(LARGE_EGG, 3, 'each')
    assert.equal(n.calories, 216)
  })

  it('bridges and portion scaling', () => {
    assert.deepEqual(realServing(PROTEIN_BAR), { grams: 60 })
    assert.equal(scalingFactor(PROTEIN_BAR, 120, 'g'), 2)
    assert.equal(convertWithBridge(120, 'g', 'each', PROTEIN_BAR), 2)

    const groups = buildServingChoiceGroups(BROCCOLI)
    const choice = groups.servings[0]!
    assert.equal(choice.unit, 'serving')
    const effective = variantForServingChoice(BROCCOLI, choice)
    assert.equal(scalingFactor(effective, 4, 'serving'), 3.4)
    assert.equal(Math.round(nutritionForQuantity(effective, 4, 'serving').calories), 120)
  })

  it('variants scaling', () => {
    const choco = WHEY_VARIANTS[0]!
    const vanilla = WHEY_VARIANTS[1]!
    assert.equal(scalingFactor(choco, 64, 'g'), 2)
    assert.equal(scalingFactor(vanilla, 60, 'g'), 2)
    assert.equal(nutritionForQuantity(choco, 1, 'scoop').calories, 130)
    assert.equal(nutritionForQuantity(vanilla, 1, 'scoop').calories, 120)
  })

  it('day occurrences with untimed logs and plans', () => {
    const logs = [
      { _id: 'b', loggedAt: '2026-09-30T08:00:00Z', tags: ['breakfast'] },
      { _id: 'l', loggedAt: '2026-09-30T12:30:00Z', tags: ['lunch'] },
      { _id: 'u', loggedAt: '2026-09-30T00:00:00Z', tags: ['bed'], untimed: true },
    ]
    const plans = [{ _id: 'p', tag: 'dinner', status: 'active' }]
    const windows = [
      { tag: 'breakfast', startMinutes: 420, endMinutes: 540 },
      { tag: 'lunch', startMinutes: 720, endMinutes: 840 },
      { tag: 'dinner', startMinutes: 1080, endMinutes: 1260 },
      { tag: 'bed', startMinutes: null, endMinutes: null },
    ]
    const occ = buildDayOccurrences(logs, plans, windows)
    assert.deepEqual(
      occ.map(o => `${o.tag}${o.planned ? '(planned)' : ''}`),
      ['breakfast', 'lunch', 'dinner(planned)', 'bed']
    )
    assert.deepEqual(unusedTags(occ, ['breakfast', 'lunch', 'dinner', 'snack', 'bed']), ['snack'])
  })

  it('nutrition utilities', () => {
    assert.equal(servingQuantityStep('g'), 1)
    assert.equal(servingQuantityStep('oz'), 0.25)
    assert.equal(servingQuantityStep('each'), 0.5)

    const line = nutritionGoalLine({
      calories: 2500,
      targetWeight: 200,
      unit: 'lbs',
      direction: 'lose',
      paceStatus: 'on',
    })
    assert.equal(line, '2,500 cal/day, on track for 200 lbs')

    const logs = [
      { tags: ['breakfast'], mealName: undefined },
      { tags: ['dinner'], mealName: 'Closed Meal' },
    ]
    assert.equal(findLogForTag(logs, 'breakfast', ['breakfast', 'lunch', 'dinner']), logs[0])
    assert.equal(findLogForTag(logs, 'dinner', ['breakfast', 'lunch', 'dinner']), undefined)

    assert.deepEqual(defaultTimeForTag('breakfast'), [8, 0])
    assert.equal(plannedDateKey(new Date('2026-09-30T12:00:00Z')), '2026-09-30')
  })
})
