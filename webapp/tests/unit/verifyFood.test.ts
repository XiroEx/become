// Run with: npm run test:file tests/unit/verifyFood.test.ts
//
// The write gate is the whole safety story of the verification pipeline, so it
// is tested as a pure function. Everything else in verifyFood.ts is I/O.
//
// The asymmetry under test: refusing to correct costs one stale row; a
// confident wrong correction costs every user who logs that food afterwards.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canWrite, storedPer100, flagStatusFor, gramsFromServingText, WRITE_CONFIDENCE_FLOOR } from '../../lib/nutrition/verifyFood'
import type { EvidenceBundle } from '../../lib/nutrition/evidence'

const bundle = (hasIndependentSource: boolean): EvidenceBundle => ({
  items: [],
  hasIndependentSource,
})

const corrected = (over: Record<string, unknown> = {}) =>
  ({
    verdict: 'corrected' as const,
    problem: 'calories_wrong',
    confidence: 0.95,
    correction: { caloriesPer100: 16 },
    ...over,
  })

test('only a corrected verdict can write', () => {
  for (const v of ['confirmed', 'insufficient', 'conflicted'] as const) {
    const r = canWrite(bundle(true), null, { ...corrected(), verdict: v })
    assert.equal(r.ok, false, `${v} must not write`)
    assert.equal(r.reason, v)
  }
  assert.equal(canWrite(bundle(true), null, corrected()).ok, true)
})

test('a correction with nothing in it is not a correction', () => {
  const r = canWrite(bundle(true), null, corrected({ correction: null }))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_correction_supplied')
})

test('confidence below the floor records but does not write', () => {
  const justUnder = WRITE_CONFIDENCE_FLOOR - 0.01
  const r = canWrite(bundle(true), null, corrected({ confidence: justUnder }))
  assert.equal(r.ok, false)
  assert.match(r.reason!, /below_confidence_floor/)
  assert.equal(canWrite(bundle(true), null, corrected({ confidence: WRITE_CONFIDENCE_FLOOR })).ok, true)
})

test('our own record echoed back is not grounds to rewrite it', () => {
  // The failure mode that would let the pipeline "verify" anything.
  const r = canWrite(bundle(false), null, corrected())
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_independent_source')

  // A search hit supplies that independence on its own.
  const withSearch = canWrite(bundle(false), { found: true, sources: [{ sourceDomain: 'missionfoods.com' }] }, corrected())
  assert.equal(withSearch.ok, true)

  // But a search that found nothing does not.
  assert.equal(canWrite(bundle(false), { found: false, sources: [] }, corrected()).ok, false)
})

test('identity beats numbers: a disowned name is never silently rewritten', () => {
  // A barcode can resolve confidently to a product whose name is nothing like
  // our record. That means the RECORD is mislabelled — rewriting its macros
  // would quietly turn one food into another.
  const r = canWrite(
    bundle(true),
    { found: true, sources: [{ sourceDomain: 'walmart.com', nameMatchesRecord: false }] },
    corrected(),
  )
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'name_mismatch_needs_human')

  // One dissenting source is enough to stop the write, even alongside agreement.
  const mixed = canWrite(
    bundle(true),
    {
      found: true,
      sources: [
        { sourceDomain: 'missionfoods.com', nameMatchesRecord: true },
        { sourceDomain: 'walmart.com', nameMatchesRecord: false },
      ],
    },
    corrected(),
  )
  assert.equal(mixed.ok, false)
})

test('storedPer100 refuses a serving it cannot weigh', () => {
  // "1 slice" with no gram weight cannot be normalised, and guessing produces a
  // per-100 basis that is wrong by an unknown factor.
  assert.equal(
    storedPer100({ _id: 'x', variants: [{ isDefault: true, servingUnit: 'each', nutrition: { calories: 25 } } as never] }),
    null,
  )
  assert.equal(storedPer100({ _id: 'x', variants: [] }), null)
  assert.equal(storedPer100({ _id: 'x' }), null)
})

test('storedPer100 scales the default variant to a per-100 basis', () => {
  const out = storedPer100({
    _id: 'x',
    variants: [
      { isDefault: false, gramsPerServing: 10, nutrition: { calories: 999 } },
      { isDefault: true, gramsPerServing: 42, displayLabel: '1 tortilla (42g)', nutrition: { calories: 25, protein: 4, carbs: 14, fats: 2 } },
    ],
  })
  assert.ok(out)
  // 25 kcal in 42 g -> 59.52 per 100.
  assert.equal(out!.caloriesPer100, 59.52)
  assert.equal(out!.proteinPer100, 9.52)
  assert.equal(out!.servingGrams, 42)
  assert.equal(out!.servingLabel, '1 tortilla (42g)')
})

test('a refused correction is never reported back as corrected', () => {
  // The reviewer can return "corrected" and still be blocked by the write gate
  // (low confidence, no independent source, name mismatch). Telling the
  // reporter we corrected it would be a claim they cannot check and we did not
  // earn.
  assert.equal(flagStatusFor('corrected', true), 'corrected')
  assert.equal(flagStatusFor('corrected', false), 'insufficient')
  assert.equal(flagStatusFor('confirmed', false), 'confirmed')
  assert.equal(flagStatusFor('insufficient', false), 'insufficient')
  // conflicted has no status of its own; nothing changed, so it reads as
  // insufficient and the reasoning string carries the distinction.
  assert.equal(flagStatusFor('conflicted', false), 'insufficient')
})

test('grams are recovered from the serving text the vision runner writes', () => {
  // The vision node pins the plate-scan schema, so the serving arrives as prose
  // rather than as servingSize + servingUnit. Reading only `matches` and
  // structured fields silently discarded a perfectly good read of a real label.
  assert.equal(gramsFromServingText('3 tortillas (54g)'), 54)
  assert.equal(gramsFromServingText('1 tortilla (18 g)'), 18)
  assert.equal(gramsFromServingText('1 cup (240ml)'), 240)
  assert.equal(gramsFromServingText('54g'), 54)

  // Parenthesised weight wins over a count that happens to precede it.
  assert.equal(gramsFromServingText('2 bars (40g each)'), 40)

  // Nothing convertible: better to have no photo basis than a wrong one.
  assert.equal(gramsFromServingText('1 tortilla'), undefined)
  assert.equal(gramsFromServingText('a handful'), undefined)
  assert.equal(gramsFromServingText(''), undefined)
  assert.equal(gramsFromServingText(undefined), undefined)
  assert.equal(gramsFromServingText('0 g'), undefined)
})
