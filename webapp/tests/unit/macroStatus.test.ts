// Run with: npm run test:file tests/unit/macroStatus.test.ts
//
// Before this, every surface did `current > goal ? red : normal`:
//   • one gram over a 335g carb target looked as alarming as 200g over
//   • exceeding PROTEIN was flagged red, though eating more protein than
//     planned is a good outcome
//   • the summary card's mini bars had no over-state at all
//   • fats' identity colour was amber — the same amber as "slightly over"

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  macroStatus,
  macroBarClass,
  macroChipClass,
  macroStrokeColor,
  MACRO_COLORS,
  MACRO_KINDS,
  OVER_TOLERANCE,
} from '../../lib/nutrition/macroStatus'

const GOAL = 200

test('nothing logged reads as empty, not as a failure', () => {
  assert.equal(macroStatus(0, GOAL), 'empty')
  assert.equal(macroStatus(0, GOAL, 'floor'), 'empty')
  // A missing or nonsense goal must never colour the bar.
  assert.equal(macroStatus(50, 0), 'empty')
  assert.equal(macroStatus(50, NaN), 'empty')
})

test('a ceiling target walks under -> hit -> warn -> over', () => {
  assert.equal(macroStatus(100, GOAL), 'under')       // 50%
  assert.equal(macroStatus(190, GOAL), 'hit')         // 95% — target met
  assert.equal(macroStatus(200, GOAL), 'hit')         // exactly on target
  assert.equal(macroStatus(205, GOAL), 'warn')        // 2.5% over — grace band
  assert.equal(macroStatus(210, GOAL), 'warn')        // exactly 5% over
  assert.equal(macroStatus(211, GOAL), 'over')        // past the band
  assert.equal(macroStatus(400, GOAL), 'over')
})

test('REGRESSION: a single gram over is no longer treated like a blowout', () => {
  // The old rule was `current > goal ? red : normal`.
  assert.equal(macroStatus(GOAL + 1, GOAL), 'warn')
  assert.notEqual(macroStatus(GOAL + 1, GOAL), macroStatus(GOAL * 2, GOAL))
})

test('REGRESSION: exceeding protein is a win, never a warning', () => {
  for (const current of [200, 220, 260, 400]) {
    const s = macroStatus(current, GOAL, 'floor')
    assert.equal(s, 'hit', `${current}g of a ${GOAL}g protein floor should read as hit`)
    assert.notEqual(macroBarClass(s, MACRO_COLORS.protein), 'bg-red-500')
    assert.notEqual(macroBarClass(s, MACRO_COLORS.protein), 'bg-orange-500')
  }
  // Still shows progress while short of the target.
  assert.equal(macroStatus(120, GOAL, 'floor'), 'under')
})

test('protein is a floor and everything else is a ceiling', () => {
  assert.equal(MACRO_KINDS.protein, 'floor')
  assert.equal(MACRO_KINDS.calories, 'ceiling')
  assert.equal(MACRO_KINDS.carbs, 'ceiling')
  assert.equal(MACRO_KINDS.fats, 'ceiling')
})

test('the grace band is exactly 5%', () => {
  assert.equal(OVER_TOLERANCE, 0.05)
  assert.equal(macroStatus(GOAL * (1 + OVER_TOLERANCE), GOAL), 'warn')
  assert.equal(macroStatus(GOAL * (1 + OVER_TOLERANCE) + 0.01, GOAL), 'over')
})

test('REGRESSION: no macro identity colour collides with a status colour', () => {
  // Fats used to BE the warning colour — an amber fats bar at 40% was
  // indistinguishable from an amber "just over target" bar.
  const statusColours = ['bg-emerald-500', 'bg-orange-500', 'bg-red-500']
  for (const [macro, colour] of Object.entries(MACRO_COLORS)) {
    assert.ok(!statusColours.includes(colour), `${macro} identity colour ${colour} collides with a status colour`)
  }
  // Fats is yellow; the warning is a darker, redder orange. Same family, split
  // by lightness, so the green -> orange -> red progression still reads.
  assert.equal(MACRO_COLORS.fats, 'bg-yellow-400')
  assert.equal(macroBarClass('warn', MACRO_COLORS.fats), 'bg-orange-500')
  assert.notEqual(MACRO_COLORS.fats, macroBarClass('warn', MACRO_COLORS.fats))
})

test('each status maps to a distinct bar colour', () => {
  const identity = MACRO_COLORS.carbs
  assert.equal(macroBarClass('under', identity), identity)
  assert.equal(macroBarClass('empty', identity), identity)
  assert.equal(macroBarClass('hit', identity), 'bg-emerald-500')
  assert.equal(macroBarClass('warn', identity), 'bg-orange-500')
  assert.equal(macroBarClass('over', identity), 'bg-red-500')
})

test('chips and ring strokes follow the same three states', () => {
  assert.match(macroChipClass('warn'), /orange/)
  assert.match(macroChipClass('over'), /red/)
  assert.match(macroChipClass('hit'), /emerald/)
  assert.equal(macroStrokeColor('warn', '#fff'), '#f97316')
  assert.equal(macroStrokeColor('over', '#fff'), '#ef4444')
  assert.equal(macroStrokeColor('hit', '#fff'), '#10b981')
  assert.equal(macroStrokeColor('under', 'url(#grad)'), 'url(#grad)')
})

test('a realistic day colours the way a member would expect', () => {
  // 2,910 cal target, 210p / 335c / 81f — the profile from the screenshot.
  assert.equal(macroStatus(2900, 2910, 'ceiling'), 'hit')   // on target
  assert.equal(macroStatus(3000, 2910, 'ceiling'), 'warn')  // 3% over
  assert.equal(macroStatus(3200, 2910, 'ceiling'), 'over')  // 10% over
  assert.equal(macroStatus(240, 210, 'floor'), 'hit')       // extra protein: good
  assert.equal(macroStatus(345, 335, 'ceiling'), 'warn')    // 3% over on carbs
  assert.equal(macroStatus(95, 81, 'ceiling'), 'over')      // 17% over on fats
})
