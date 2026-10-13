import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildServingChoiceGroups,
  servingChoiceDisplayLabel,
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
    // The primary is now a COUNTABLE serving, not a cup shortcut: pick it and
    // the box reads "1 serving", so "4" means four cups without any arithmetic.
    // The cup weight rides along as the bridge and the caption.
    assert.equal(cupServing.quantity, 1)
    assert.equal(cupServing.unit, 'serving')
    assert.deepEqual(cupServing.perServing, { quantity: 240, unit: 'g' })

    const effective = variantForServingChoice({ ...variant, nutrition }, cupServing)
    // One serving and one cup must be the same amount of food.
    assert.equal(Math.round(scalingFactor(effective, 1, 'serving') * 100), 240)
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

  it('a same-dimension named serving becomes a countable serving that knows its weight', () => {
    // Previously "1 bar (45 g)" on a gram-native food was left as a 45 g gram
    // shortcut, and deriveBridge deliberately stayed out of same-dimension
    // labels. A countable serving cannot rely on that: without its own weight
    // the maths falls back to the 100 g basis and one bar counts as 100 g.
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
    assert.equal(primary.unit, 'serving')
    assert.equal(primary.quantity, 1)
    assert.equal(primary.gramsPerServing, 45, 'the bar weight rides along as the bridge')

    const effective = variantForServingChoice(variant, primary)
    assert.equal(Math.round(scalingFactor(effective, 1, 'serving') * 100), 45)
    assert.equal(Math.round(scalingFactor(effective, 4, 'serving') * 100), 180, 'four bars, no arithmetic')
    // And grams still convert natively, exactly as before.
    assert.equal(Math.round(scalingFactor(effective, 45, 'g') * 100), 45)
  })
  it('prefers a stored bridge over one derived from the label text', () => {
    // Sardines: the label calls it "1 can (3.75 oz)" = 106 g, but the nutrition
    // is recorded against the 92 g drained weight the variant stores. Scaling by
    // the label's 106 g overstated the can by 16%.
    const variant = {
      servingSize: 1,
      servingUnit: 'each' as const,
      displayLabel: '1 can (3.75 oz)',
      gramsPerServing: 92,
      nutrition: { calories: 191, protein: 23, carbs: 0, fats: 11 },
    }

    const groups = buildServingChoiceGroups(variant)
    const primary = groups.servings.find(choice => choice.id === 'serving-primary')
    assert.ok(primary)
    const effective = variantForServingChoice(variant, primary)
    assert.equal(effective.gramsPerServing, 92)
  })

  it('still accepts a derived bridge for a dimension the variant does not store', () => {
    // Per-field, not all-or-nothing: gramsPerServing is stored and kept, while
    // mlPerServing has no stored value and is filled in from the label. The
    // derived ml is computed FROM the stored grams, so the pair agrees.
    const variant = {
      servingSize: 100,
      servingUnit: 'g' as const,
      displayLabel: '1 cup',
      gramsPerServing: 120,
      mlPerServing: undefined as number | undefined,
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    const primary = groups.servings.find(choice => choice.id === 'serving-primary')
    assert.ok(primary)
    const effective = variantForServingChoice(variant, primary)
    assert.equal(effective.gramsPerServing, 120)
    assert.ok(effective.mlPerServing != null && effective.mlPerServing > 0)
  })
  it('does NOT let a stored bridge override an alternate serving', () => {
    // Spinach stores gramsPerServing 30 for its own "1 cup raw" serving, and
    // offers "1 cup cooked (180 g)" as an alternate. The alternate weighs what
    // ITS label says; scaling it by the stored 30 g is a six-fold error.
    const variant = {
      servingSize: 1,
      servingUnit: 'cup' as const,
      displayLabel: '1 cup raw (30 g)',
      gramsPerServing: 30,
      alternateServings: [{ label: '1 cup cooked (180 g)', multiplier: 1 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    const cooked = groups.servings.find(choice => choice.label.includes('cooked'))
    assert.ok(cooked)
    const effective = variantForServingChoice(variant, cooked)
    assert.equal(Math.round(effective.gramsPerServing!), 180)

    // ...while the primary still gets the stored value.
    const primary = groups.servings.find(choice => choice.id === 'serving-primary')
    assert.ok(primary)
    assert.equal(variantForServingChoice(variant, primary).gramsPerServing, 30)
  })

  it('does not drop the whole number off a "1¾ cup" fractional serving', () => {
    // A native mass/volume-unit food with a fractional servingSize and no
    // explicit gram/ml bridge — formatQuantity renders its own label as
    // "1¾ cup" (glyph attached directly to the leading digit, no space). The
    // picker parses that label straight back to derive the per-serving bridge,
    // and the old QUANTITY_WITH_UNIT_RE had no alternative for "digit+glyph"
    // stuck together, so it silently dropped the "1" and read the label as
    // 0.75 cup — a food described as "1¾ cup" was logged as if "1" of it were
    // worth 0.75 cup / 3⁄7 of the true nutrition.
    const variant = {
      servingSize: 1.75,
      servingUnit: 'cup' as const,
      nutrition: { calories: 400, protein: 10, carbs: 10, fats: 10 },
    }

    const groups = buildServingChoiceGroups(variant)
    const primary = groups.servings.find(choice => choice.id === 'serving-primary')
    assert.ok(primary)
    assert.equal(primary.label, '1¾ cup')
    assert.equal(primary.quantity, 1)
    assert.equal(primary.unit, 'serving')
    assert.deepEqual(primary.perServing, { quantity: 1.75, unit: 'cup' })
    assert.equal(Math.round(primary.mlPerServing!), 420) // 1.75 cup, not 0.75 cup (180 ml)
    // The exact display bug this collapse causes: the label's only "noun" is
    // the bare unit word "cup", so a UI must not show it next to the "1" in
    // the quantity box — that would read "1 cup" for a 1¾-cup serving.
    assert.equal(primary.measurableAsServing, true)

    const effective = variantForServingChoice(variant, primary)
    // "1" of the food's own named serving must be the WHOLE 1¾-cup portion —
    // full nutrition, not the 0.75/1.75 ≈ 43% a dropped "1" produced.
    assert.equal(scalingFactor(effective, 1, 'serving'), 1)
  })

  it('parses a whole+glyph amount out of an alternate serving label too', () => {
    const variant = {
      servingSize: 100,
      servingUnit: 'g' as const,
      alternateServings: [{ label: '1¾ cup (210g)', multiplier: 2.1 }],
      nutrition,
    }

    const groups = buildServingChoiceGroups(variant)
    const cupServing = groups.servings.find(choice => choice.label === '1¾ cup (210g)')
    assert.ok(cupServing)
    assert.equal(cupServing.quantity, 1.75)
    assert.equal(cupServing.unit, 'cup')
  })

  describe('measurableAsServing — flags a countable serving derived from a bare unit label', () => {
    // The reported bug: a food whose own serving is "3/4 cup" collapses to a
    // countable {1, 'serving'} choice (so N servings needs no math), but the
    // label's only "noun" IS the unit word "cup" — a UI showing just that
    // noun next to the "1" quantity box reads "1 cup", a different amount
    // than the food's real 3/4-cup serving. This flag tells a consumer when
    // the label has no descriptive noun of its own to fall back to the
    // generic word "serving" instead.
    it('flags a fractional-cup native serving ("3/4 cup") as measurable', () => {
      const variant = {
        servingSize: 0.75,
        servingUnit: 'cup' as const,
        displayLabel: '3/4 cup',
        gramsPerServing: 180,
        nutrition,
      }
      const groups = buildServingChoiceGroups(variant)
      const primary = groups.servings.find(choice => choice.id === 'serving-primary')
      assert.ok(primary)
      assert.equal(primary.unit, 'serving', 'still collapses to a countable serving')
      assert.equal(primary.label, '3/4 cup', 'the raw label is untouched — data layer, not display')
      assert.equal(primary.measurableAsServing, true)
    })

    it('flags a whole-number cup label ("1 cup") as measurable too — not just fractions', () => {
      const variant = {
        servingSize: 100,
        servingUnit: 'g' as const,
        displayLabel: '1 cup',
        gramsPerServing: 240,
        nutrition,
      }
      const groups = buildServingChoiceGroups(variant)
      const primary = groups.servings.find(choice => choice.id === 'serving-primary')
      assert.ok(primary)
      assert.equal(primary.unit, 'serving')
      assert.equal(primary.measurableAsServing, true)
    })

    it('flags a bare fraction+unit label ("1/3 c") as measurable', () => {
      const variant = {
        servingSize: 32,
        servingUnit: 'g' as const,
        displayLabel: '1/3 c',
        alternateServings: [{ label: '100 g', multiplier: 3.125 }],
        nutrition: { calories: 110, protein: 24, carbs: 3, fats: 0 },
      }
      const groups = buildServingChoiceGroups(variant)
      const primary = groups.servings.find(choice => choice.id === 'serving-primary')
      assert.ok(primary)
      assert.equal(primary.measurableAsServing, true)
    })

    it('does NOT flag a discrete named serving ("1 portion (85 g)") — the noun is real', () => {
      const variant = {
        servingSize: 100,
        servingUnit: 'g' as const,
        displayLabel: '1 portion (85 g)',
        gramsPerServing: 85,
        nutrition,
      }
      const groups = buildServingChoiceGroups(variant)
      const primary = groups.servings.find(choice => choice.id === 'serving-primary')
      assert.ok(primary)
      assert.equal(primary.unit, 'serving')
      assert.equal(primary.label, '1 portion (85 g)')
      assert.ok(!primary.measurableAsServing, '"portion" is a real noun, not a bare unit word')
    })

    it('does NOT flag a discrete named serving ("1 bar (45 g)") either', () => {
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
      assert.ok(!primary.measurableAsServing)
    })

    it('does NOT flag a measurable choice that stays as its own unit (not countable)', () => {
      // "2 bars (90 g)" is a different amount from the food's own 45 g bar, so
      // it stays a measurable-unit SHORTCUT (quantity 90, unit 'g') rather
      // than becoming a countable serving — measurableAsServing only applies
      // to the countable-serving collapse, not every measurable choice.
      const variant = {
        servingSize: 100,
        servingUnit: 'g' as const,
        displayLabel: '1 bar (45 g)',
        gramsPerServing: 45,
        alternateServings: [{ label: '2 bars (90 g)', multiplier: 0.9 }],
        nutrition,
      }
      const groups = buildServingChoiceGroups(variant)
      const two = groups.servings.find(choice => choice.label === '2 bars (90 g)')
      assert.ok(two)
      assert.equal(two.unit, 'g')
      assert.ok(!two.measurableAsServing)
    })
  })

  describe('servingChoiceDisplayLabel — names the real amount behind the generic "serving" word', () => {
    // Bare "serving" alone can't tell a 3/4-cup serving from a 1-cup one apart
    // — the follow-up ask was to name the amount in parens instead of hiding
    // it entirely, without bringing back the misleading "1 cup" reading.
    it('appends the raw label in parens for a measurable-as-serving choice', () => {
      assert.equal(
        servingChoiceDisplayLabel({ label: '3/4 cup', measurableAsServing: true }),
        'serving (3/4 cup)',
      )
    })

    it('leaves a discrete named serving untouched', () => {
      assert.equal(
        servingChoiceDisplayLabel({ label: '1 portion (85 g)', measurableAsServing: false }),
        '1 portion (85 g)',
      )
    })

    it('treats an undefined flag the same as false', () => {
      assert.equal(servingChoiceDisplayLabel({ label: '1 bar (45 g)' }), '1 bar (45 g)')
    })
  })
})
