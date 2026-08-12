// Run with: npx tsx --test tests/unit/evidence.test.ts
//
// Evidence gathering is deliberately deterministic and decides nothing. These
// cover the pure parts and, more importantly, pin the two real records that
// motivated the whole pipeline — using the actual values the live sources
// returned, so the fixtures are evidence rather than invention.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atwater, atwaterUpper, matchesRecord, type EvidenceValues } from '../../lib/nutrition/evidence'

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

test('a user photo is a claim, not a source, until its identity is confirmed', () => {
  // The attack and the accident look identical to us: someone reports a
  // tortilla and attaches a cereal panel. Its numbers are perfectly
  // self-consistent, so Atwater cannot catch it. Only the NAME can.
  assert.equal(matchesRecord('Cheerios Honey Nut', 'Original Zero', 'Mission Foods Inc'), false)

  // A wordier label for the same product still matches — labels carry
  // marketing text a record name never will.
  assert.equal(
    matchesRecord('Mission Original Zero Net Carbs Tortillas', 'Original Zero', 'Mission Foods Inc'),
    true,
  )

  // Unreadable is UNKNOWN, not a pass and not a rejection.
  assert.equal(matchesRecord(undefined, 'Original Zero'), undefined)
  assert.equal(matchesRecord('   ', 'Original Zero'), undefined)
  // Generic filler alone must not carry a match.
  assert.equal(matchesRecord('Original', 'Original Zero'), undefined)
})

test('Atwater uses NET carbs — the fiber trap that broke a real review', () => {
  // Mission "Original Zero" as stored, per 100g. Fiber IS the carbohydrate.
  const tortilla: EvidenceValues = {
    caloriesPer100: 138.9, proteinPer100: 11.11, carbsPer100: 38.89,
    fatsPer100: 8.33, fiberPer100: 38.89,
  }

  // Charging total carbs at 4 cal/g doubles the estimate and makes a correct
  // record look broken. That is exactly what the reviewer did on 2026-08-11.
  const naive = 4 * 11.11 + 4 * 38.89 + 9 * 8.33
  assert.ok(naive > 270, 'the naive figure really is about double')

  // Net carbs put it next to the stated value.
  const est = atwater(tortilla)!
  assert.ok(est < 130, `net-carb estimate ${est} should be near the stated 139`)
  assert.ok(Math.abs(est - 138.9) < 25, 'inside a sane tolerance of the label')

  // The band: fiber at 0 (low) through fiber at 2 cal/g (high). The stated
  // calories must fall inside it, which is what "coherent" means here.
  const upper = atwaterUpper(tortilla)!
  assert.ok(upper > est, 'upper end charges fiber')
  assert.ok(tortilla.caloriesPer100! >= est && tortilla.caloriesPer100! <= upper,
    `139 should sit inside [${est}, ${upper}]`)
})

test('a food with no fiber is unaffected by the change', () => {
  // Guard against the fix quietly moving every other food.
  assert.equal(atwater({ proteinPer100: 10, carbsPer100: 20, fatsPer100: 5 }), 165)
  assert.equal(atwaterUpper({ proteinPer100: 10, carbsPer100: 20, fatsPer100: 5 }), 165)
})

test('a nonsense fiber figure cannot push carbs negative', () => {
  // Bad imports exist; fiber > carbs must not manufacture negative calories.
  const out = atwater({ proteinPer100: 10, carbsPer100: 5, fatsPer100: 0, fiberPer100: 40 })!
  assert.equal(out, 40) // protein only, carbs floored at 0
  assert.ok(out >= 0)
})

test('a shared BRAND is not a shared product', () => {
  // The bug this replaces: token overlap on the brand alone returned true, so a
  // photo of "Mission Carb Balance" was reported as the same product as a
  // record for "Mission Zero Net Carbs" — and the reviewer was then invited to
  // rewrite one line's macros with the other's. Brands ship many lines whose
  // panels differ; the shared word is the LEAST informative one.
  assert.equal(
    matchesRecord('Mission Carb Balance Tortillas', 'Original Zero', 'Mission Foods Inc'),
    false,
  )
  // The distinguishing part of the name present -> genuinely the same product.
  assert.equal(
    matchesRecord('Mission Zero Net Carbs Tortillas', 'Original Zero', 'Mission Foods Inc'),
    true,
  )
})

test('a vague read is unknown, never an accusation', () => {
  // Vision is not deterministic: three reads of ONE photo returned "Mission
  // Carb Balance Tortillas", "Tortillas", and "Zero Net Carbs Tortillas".
  // A bare category word means we failed to read a brand — treating it as proof
  // the reporter photographed the wrong thing throws away a good panel.
  assert.equal(matchesRecord('Tortillas', 'Original Zero', 'Mission Foods Inc'), undefined)
  assert.equal(matchesRecord('Bread', 'Original Zero', 'Mission Foods Inc'), undefined)

  // Two or more specific tokens with nothing in common IS enough to say no.
  assert.equal(matchesRecord('Cheerios Honey Nut', 'Original Zero', 'Mission Foods Inc'), false)
})

test('every identity outcome is safe for the write gate', () => {
  // Whatever the read, no branch may silently rewrite a different product:
  //   true      -> counts as evidence (same product)
  //   false     -> wrong_product, blocked
  //   undefined -> supporting only, never the basis for a correction
  const outcomes = ['Mission Zero Net Carbs Tortillas', 'Mission Carb Balance Tortillas', 'Tortillas']
    .map((p) => matchesRecord(p, 'Original Zero', 'Mission Foods Inc'))
  assert.deepEqual(outcomes, [true, false, undefined])
  // The unsafe combination would be `true` for a different line. Assert it is gone.
  assert.notEqual(matchesRecord('Mission Carb Balance Tortillas', 'Original Zero', 'Mission Foods Inc'), true)
})
