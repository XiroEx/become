// Run with: npx tsx --test tests/unit/foodReviewBridge.test.ts
//
// The bridge_conflict rule. It used to flag any gram-native variant whose
// gramsPerServing differed from its servingSize, which is the NORMAL shape of
// every OpenFoodFacts / USDA import: servingSize 100 is the per-100 math
// reference and gramsPerServing carries the real serving weight. That fired on
// 2543 of 3656 OFF imports and buried ~700 genuine issues under false
// positives, taking the review queue from 3941 down to 709 once narrowed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReviewIssues } from '../../lib/foodReview'
import type { IFood } from '../../models/Food'

const food = (variant: Record<string, unknown>) =>
  ({
    name: 'Test Food',
    slug: 'test-food',
    variants: [
      {
        name: 'Default',
        isDefault: true,
        alternateServings: [],
        nutrition: { calories: 100, protein: 5, carbs: 10, fats: 4 },
        ...variant,
      },
    ],
  }) as unknown as IFood

const codes = (f: IFood) => computeReviewIssues(f).map((i) => i.code)

test('the standard per-100 import shape is NOT a conflict', () => {
  // Cinnamon Toast Crunch, verbatim: nutrition per 100 g, real serving 40 g.
  assert.ok(
    !codes(food({ servingSize: 100, servingUnit: 'g', gramsPerServing: 40, displayLabel: '40g' })).includes(
      'bridge_conflict',
    ),
  )
  // A 142 g turnover and a 28 g bag of chips, same shape, also fine.
  assert.ok(
    !codes(food({ servingSize: 100, servingUnit: 'g', gramsPerServing: 142 })).includes('bridge_conflict'),
  )
  assert.ok(
    !codes(food({ servingSize: 100, servingUnit: 'ml', mlPerServing: 355 })).includes('bridge_conflict'),
  )
})

test('a real contradiction is still flagged', () => {
  // servingSize is NOT the per-100 reference here, so the two genuinely
  // disagree about the same serving: 32 g or 45 g?
  assert.ok(
    codes(food({ servingSize: 32, servingUnit: 'g', gramsPerServing: 45 })).includes('bridge_conflict'),
  )
  assert.ok(
    codes(food({ servingSize: 240, servingUnit: 'ml', mlPerServing: 355 })).includes('bridge_conflict'),
  )
})

test('agreeing values raise nothing, at any serving size', () => {
  assert.ok(!codes(food({ servingSize: 32, servingUnit: 'g', gramsPerServing: 32 })).includes('bridge_conflict'))
  assert.ok(
    !codes(food({ servingSize: 100, servingUnit: 'g', gramsPerServing: 100 })).includes('bridge_conflict'),
  )
  // Sub-gram drift is rounding, not a conflict.
  assert.ok(
    !codes(food({ servingSize: 32, servingUnit: 'g', gramsPerServing: 32.4 })).includes('bridge_conflict'),
  )
})

test('narrowing the bridge rule did not disable the other checks', () => {
  const broken = food({
    servingSize: 100,
    servingUnit: 'g',
    gramsPerServing: 40,
    // 4*10 + 4*2 + 9*1 = 57, nowhere near the stated 500.
    nutrition: { calories: 500, protein: 10, carbs: 2, fats: 1 },
  })
  assert.ok(codes(broken).includes('macros_inconsistent'))
  assert.ok(!codes(broken).includes('bridge_conflict'))
})
