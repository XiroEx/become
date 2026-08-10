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
    assert.equal(groups.servings.some(choice => choice.label === '100 g'), false)
    assert.equal(cupServing.quantity, 1)
    assert.equal(cupServing.unit, 'cup')

    const effective = variantForServingChoice({ ...variant, nutrition }, cupUnit)
    assert.equal(Math.round(scalingFactor(effective, 1, 'cup') * 100), 122)
    assert.equal(Math.round(scalingFactor(effective, 0.5, 'cup') * 100), 61)
  })

  it('uses a volume-only display label plus gram serving weight as a bridge', () => {
    const variant = {
      servingSize: 100,
      servingUnit: 'g' as const,
      displayLabel: '1 cup',
      gramsPerServing: 240,
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    const cupServing = groups.servings.find(choice => choice.label === '1 cup')
    const cupUnit = groups.volume.find(choice => choice.unit === 'cup')

    assert.ok(cupServing)
    assert.ok(cupUnit)
    assert.equal(groups.servings.some(choice => choice.label === '100 g'), false)
    assert.equal(cupServing.quantity, 1)
    assert.equal(cupServing.unit, 'cup')

    const effective = variantForServingChoice({ ...variant, nutrition }, cupServing)
    assert.equal(Math.round(scalingFactor(effective, 1, 'cup') * 100), 240)
  })

  it('hides numeric-only primary labels but keeps meaningful discrete servings', () => {
    const variant = {
      servingSize: 1,
      servingUnit: 'each' as const,
      displayLabel: '1',
      alternateServings: [{ label: '1 large (50g)', multiplier: 1 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)

    assert.equal(groups.servings.some(choice => choice.label === '1'), false)
    assert.ok(groups.servings.some(choice =>
      choice.label === '1 large (50g)' &&
      choice.quantity === 1 &&
      choice.unit === 'each' &&
      choice.gramsPerServing === 50
    ))
    assert.ok(groups.weight.some(choice => choice.unit === 'g'))
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
  // A volume-only label on a gram-native food. The label and the servingSize
  // describe the SAME serving, so the label itself supplies the density; before
  // this the choice could not convert to grams, got dropped, and the picker
  // defaulted to the bare "100 g" alternate — 344 cal for a 110 cal scoop.
  it('keeps a volume-only named serving on a mass-native food (no explicit bridge)', () => {
    const variant = {
      servingSize: 32,
      servingUnit: 'g' as const,
      displayLabel: '1/3 c',
      alternateServings: [{ label: '100 g', multiplier: 3.125 }],
      nutrition: { calories: 110, protein: 24, carbs: 3, fats: 0 },
    }

    const groups = buildServingChoiceGroups(variant)
    const primary = groups.servings.find(choice => choice.id === 'serving-primary')
    assert.ok(primary, 'the food\'s own serving must be offered')
    assert.equal(primary.label, '1/3 c')
    // It must also be FIRST, since the picker defaults to servings[0].
    assert.equal(groups.servings[0]?.id, 'serving-primary')

    // And it must scale to the label's numbers, not the storage reference's.
    const effective = variantForServingChoice(variant, primary)
    const factor = scalingFactor(effective, primary.quantity, primary.unit)
    assert.equal(Math.round(variant.nutrition.calories * factor), 110)
    assert.equal(Math.round(variant.nutrition.protein * factor), 24)
  })

  it('keeps a mass-only named serving on a volume-native food (the mirror case)', () => {
    // A bare "250 g" label would be suppressed as redundant with the weight
    // selector, so the mirror needs a NAMED mass serving to be meaningful.
    const variant = {
      servingSize: 240,
      servingUnit: 'ml' as const,
      displayLabel: '1 patty (85 g)',
      alternateServings: [{ label: '100 ml', multiplier: 0.41667 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    assert.equal(groups.servings[0]?.id, 'serving-primary')
    assert.equal(groups.servings[0]?.label, '1 patty (85 g)')
  })

  it('leaves a same-dimension named serving untouched', () => {
    // The new label-derived bridge must only engage when the label's dimension
    // differs from the storage unit. A gram label on a gram-native food needs
    // no bridge and must keep converting natively.
    const variant = {
      servingSize: 100,
      servingUnit: 'g' as const,
      displayLabel: '1 bar (45 g)',
      alternateServings: [{ label: '100 g', multiplier: 1 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    const primary = groups.servings.find(choice => choice.id === 'serving-primary')
    assert.ok(primary)
    assert.equal(primary.unit, 'g')
    assert.equal(primary.quantity, 45)
  })
})
