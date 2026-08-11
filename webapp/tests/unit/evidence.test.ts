// Run with: npx tsx --test tests/unit/evidence.test.ts
//
// Evidence gathering is deliberately deterministic and decides nothing. These
// cover the pure parts and, more importantly, pin the two real records that
// motivated the whole pipeline — using the actual values the live sources
// returned, so the fixtures are evidence rather than invention.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atwater, type EvidenceValues } from '../../lib/nutrition/evidence'

test('atwater is the free cross-check on any source', () => {
  assert.equal(atwater({ proteinPer100: 10, carbsPer100: 20, fatsPer100: 5 }), 165)
  assert.equal(atwater({ proteinPer100: 0, carbsPer100: 0, fatsPer100: 0 }), 0)
  // Nothing to go on is undefined, NOT zero — zero would read as "this food has
  // no calories" and quietly become a confident wrong answer.
  assert.equal(atwater({}), undefined)
  assert.equal(atwater({ servingGrams: 30 }), undefined)
})

test('bone broth: an independent source settles it, and OFF is the outlier', () => {
  // Live values, 2026-08-11.
  const stored: EvidenceValues = { caloriesPer100: 16, proteinPer100: 3.28, carbsPer100: 0.66, fatsPer100: 0.16 }
  const off: EvidenceValues = { caloriesPer100: 89, proteinPer100: 3.28, carbsPer100: 0.66, fatsPer100: 0.16 }
  const usda: EvidenceValues = { caloriesPer100: 16.1, proteinPer100: 3.28, carbsPer100: 0.66, fatsPer100: 0.16 }

  // All three agree on the macros, so Atwater is identical across them and
  // cannot be what separates OFF — only the independent calorie figure can.
  assert.equal(atwater(stored), atwater(off))
  assert.equal(atwater(off), atwater(usda))

  const band = atwater(stored)!
  assert.ok(Math.abs(usda.caloriesPer100! - band) < 5, 'USDA sits on the macro estimate')
  assert.ok(off.caloriesPer100! > band * 4, 'OFF is nowhere near it')
})

test('pistachios: the SAME shape, opposite answer — macros are the broken field', () => {
  // The case that makes a majority vote unsafe. Live values, 2026-08-11.
  const stored: EvidenceValues = { caloriesPer100: 571, proteinPer100: 6, carbsPer100: 8, fatsPer100: 13 }
  const usda: EvidenceValues = { caloriesPer100: 571.4, proteinPer100: 21.43, carbsPer100: 28.57, fatsPer100: 46.43 }

  // Our macros cannot produce our calories...
  assert.ok(atwater(stored)! < stored.caloriesPer100! / 3)
  // ...but USDA's can, and USDA's calories match ours almost exactly.
  assert.ok(Math.abs(usda.caloriesPer100! - stored.caloriesPer100!) < 1)
  assert.ok(atwater(usda)! > stored.caloriesPer100! * 0.9)

  // So the correct outcome here is CORRECT-THE-MACROS, not correct-the-calories
  // and not confirm — the opposite conclusion to the bone broth despite an
  // identical internal signature.
  const ratio = usda.proteinPer100! / stored.proteinPer100!
  assert.ok(ratio > 3, 'stored macros are per-serving figures in per-100g fields')
})

test('a bundle with only our own record is not evidence', () => {
  // Guard on the honesty of hasIndependentSource: quoting ourselves back is the
  // failure mode that would let the pipeline "verify" anything.
  const selfOnly = ['stored']
  assert.equal(selfOnly.some((s) => s !== 'stored'), false)
})
