import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildServingChoiceGroups,
  variantForServingChoice,
} from '@/lib/nutrition/servingOptions'
import { scalingFactor } from '@/lib/foodMath'

const nutrition = { calories: 100, protein: 1, carbs: 1, fats: 1 }

describe('servingOptions', () => {
  it('derives arbitrary cup math from a 100 g native food with "1 cup (122g)" label', () => {
    const variant = {
      servingSize: 100,
      servingUnit: 'g' as const,
      alternateServings: [{ label: '1 cup (122g)', multiplier: 1.22 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    const cupServing = groups.servings.find(choice => choice.label === '1 cup (122g)')
    const cupUnit = groups.volume.find(choice => choice.unit === 'cup')

    assert.ok(cupServing)
    assert.ok(cupUnit)
    assert.equal(cupServing.quantity, 1)
    assert.equal(cupServing.unit, 'cup')

    const effective = variantForServingChoice({ ...variant, nutrition }, cupUnit)
    assert.equal(Math.round(scalingFactor(effective, 1, 'cup') * 100), 122)
    assert.equal(Math.round(scalingFactor(effective, 0.5, 'cup') * 100), 61)
  })

  it('uses native cup plus gramsPerServing as a weight bridge', () => {
    const variant = {
      servingSize: 1,
      servingUnit: 'cup' as const,
      displayLabel: '1 cup (148g)',
      gramsPerServing: 148,
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    assert.ok(groups.weight.some(choice => choice.unit === 'g'))
    assert.ok(groups.volume.some(choice => choice.unit === 'cup'))

    const gramChoice = groups.weight.find(choice => choice.unit === 'g')
    const effective = variantForServingChoice({ ...variant, nutrition }, gramChoice)
    assert.equal(Math.round(scalingFactor(effective, 148, 'g') * 100), 100)
  })

  it('does not invent weight or volume options for bare serving labels', () => {
    const variant = {
      servingSize: 1,
      servingUnit: 'serving' as const,
      displayLabel: '1 serving',
      alternateServings: [],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    assert.equal(groups.weight.length, 0)
    assert.equal(groups.volume.length, 0)
    assert.equal(groups.servings.length, 1)
  })

  it('keeps ml-native bottle labels in volume only when no mass bridge exists', () => {
    const variant = {
      servingSize: 100,
      servingUnit: 'ml' as const,
      displayLabel: '1 bottle (355 ml)',
      mlPerServing: 355,
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    assert.ok(groups.volume.some(choice => choice.unit === 'ml'))
    assert.equal(groups.weight.length, 0)
  })

  it('normalizes upstream unit codes in labels before creating serving choices', () => {
    const variant = {
      servingSize: 100,
      servingUnit: 'g' as const,
      alternateServings: [{ label: '2.5 ONZ', multiplier: 0.7087375 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    assert.ok(groups.servings.some(choice => choice.label === '2.5 oz' && choice.unit === 'oz'))
  })
})
