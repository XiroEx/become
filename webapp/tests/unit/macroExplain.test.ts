// Run with: npm run test:file tests/unit/macroExplain.test.ts
//
// Pinned to two real members: the one on the onboarding screenshot, and the one
// who picked High Protein and was handed 348 g. The second is the reason this
// module exists.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  USEFUL_PROTEIN_CEILING_PER_LB,
} from '../../lib/nutrition/macroExplain'

const LB = 2.20462

test('the calorie chain reproduces the numbers on the card', () => {
  // 25M, 6'0" (182.88 cm), 210 lb (95.25 kg), active, losing.
  const out = explainCalories(
    { currentWeightKg: 210 / LB, heightCm: 72 * 2.54, age: 25, biologicalSex: 'male' },
    'active',
    'lose',
  )
  assert.ok(out)
  // The screenshot shows TDEE ~3,410 and a 2,910 target.
  assert.ok(Math.abs(out!.tdee - 3410) <= 15, `tdee ${out!.tdee} should be ~3410`)
  assert.equal(out!.calories, out!.tdee - 500) // large member: the 500 cap binds
  // Every step carries a visible value — a step with no number teaches nothing.
  assert.ok(out!.steps.length >= 4)
  for (const s of out!.steps) assert.ok(s.value.trim().length > 0, `${s.label} has no value`)
})

test('no invented arithmetic when the inputs are missing', () => {
  // Must decline exactly where calcBmr declines, or the sheet would explain a
  // target the card never showed.
  assert.equal(explainCalories({ heightCm: 180, age: 30, biologicalSex: 'male' }, 'moderate', 'lose'), null)
  assert.equal(explainCalories({ currentWeightKg: 80, age: 30, biologicalSex: 'male' }, 'moderate', 'lose'), null)
  assert.equal(explainCalories({ currentWeightKg: 80, heightCm: 180, biologicalSex: 'male' }, 'moderate', 'lose'), null)
})

test('fats explain their own small number', () => {
  // 81 g of fat next to 335 g of carbs looks like a mistake until you know fat
  // carries 9 cal per gram.
  const out = explainMacro({ macro: 'fats', grams: 81, calories: 2910, percent: 25, direction: 'lose' })
  assert.equal(out.caloriesFromMacro, 728)
  assert.ok(out.steps.some((s) => /9 cal per gram/.test(s.detail)))
  // No bodyweight check on anything but protein.
  assert.equal(out.perLb, undefined)
  assert.equal(out.note, undefined)
})

test('348 g protein: the maths is right AND the number is too high', () => {
  // High Protein (40%) on a 3,480 cal target, member at 200 lb.
  const out = explainMacro({
    macro: 'protein',
    grams: 348,
    calories: 3480,
    percent: 40,
    weightKg: 200 / LB,
    direction: 'gain',
    goals: ['gain_muscle'],
    presetLabel: 'High Protein',
  })

  assert.equal(out.caloriesFromMacro, 1392)
  assert.equal(out.perLb, 1.7)

  // It must NOT tell them the number is wrong — 40% of 3,480 really is 348 g.
  assert.equal(out.note?.tone, 'caution')
  assert.match(out.note!.text, /maths is right/i)
  // And it must not pretend 1.7 g/lb is what they need.
  assert.match(out.note!.text, /more protein than you need/i)
  // It offers the number that would do the same job (200 lb x 0.9 = 180 g).
  assert.match(out.note!.text, /180 g/)
  // Nothing is silently changed.
  assert.equal(out.grams, 348)
})

test('a protein figure inside the band is affirmed, not warned about', () => {
  // The screenshot member: 210 g at 210 lb = 1.0 g/lb while cutting. Correct.
  const out = explainMacro({
    macro: 'protein',
    grams: 210,
    calories: 2910,
    percent: 29,
    weightKg: 210 / LB,
    direction: 'lose',
    goals: [],
  })
  assert.equal(out.perLb, 1)
  assert.equal(out.note?.tone, 'info')
})

test('too LITTLE protein is flagged too', () => {
  // Under-eating protein in a deficit costs lean mass — the failure that is
  // easy to miss because the number looks unthreatening.
  const out = explainMacro({
    macro: 'protein',
    grams: 90,
    calories: 2400,
    percent: 15,
    weightKg: 200 / LB,
    direction: 'lose',
    goals: [],
  })
  assert.equal(out.note?.tone, 'caution')
  assert.match(out.note!.text, /low side/i)
})

test('the card flags before anyone taps', () => {
  const heavy = 200 / LB
  assert.equal(proteinNeedsFlag(348, heavy, 'gain', ['gain_muscle']), true)
  assert.equal(proteinNeedsFlag(180, heavy, 'gain', ['gain_muscle']), false)
  assert.equal(proteinNeedsFlag(90, heavy, 'lose'), true)
  // Exactly at the ceiling is fine; only past it is worth interrupting for.
  assert.equal(proteinNeedsFlag(Math.round(200 * USEFUL_PROTEIN_CEILING_PER_LB), heavy, 'lose'), false)
  // Without a weight there is nothing to compare against, so we stay quiet
  // rather than guess.
  assert.equal(proteinNeedsFlag(348, undefined, 'gain'), false)
})

test('a small member is explained the deficit they actually got, not the cap', () => {
  // DIRECTION_ADJUSTMENT is a CEILING; calorieAdjustment scales it to 20% of
  // TDEE. Reading the constant would show a 500 cal cut to someone given ~300.
  const out = explainCalories(
    { currentWeightKg: 52, heightCm: 158, age: 30, biologicalSex: 'female' },
    'sedentary',
    'lose',
  )
  assert.ok(out)
  const cut = out!.tdee - out!.calories
  assert.ok(cut < 500, `expected a scaled cut, got ${cut}`)
  assert.equal(cut, Math.round(out!.tdee * 0.2))
  // And the step must state the real figure.
  const step = out!.steps.find((s) => /Deficit/.test(s.label))
  assert.ok(step && step.value.includes(String(cut)), `step said ${step?.value}, cut was ${cut}`)
})
