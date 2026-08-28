// Run with: npx tsx --test tests/unit/macroManualPercent.test.ts
//
// This repo does not carry jsdom/testing-library. Keep the client wiring pinned
// with the same source-level regression style used by the other Nutrition
// Goals component tests (see macroPresetPersistence.test.ts).
//
// Card: "Allow setting macros in manual mode as percentages". Manual
// (macroPreset 'custom') used to only accept grams — the percent next to each
// field was read-only. These assertions pin the g/% toggle and the fact that
// it only appears in Manual, converts through the shared tdee helpers, and
// keeps grams as the value actually persisted.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(__dirname, '../../app/dashboard/nutrition/goals/page.tsx'),
  'utf8',
)

describe('Nutrition Goals manual macro percent entry', () => {
  it('the g/% toggle only renders in Manual (macroPreset custom)', () => {
    assert.match(source, /\{macroPreset === 'custom' && \(\s*<div className="flex items-center rounded-lg border/)
  })

  it('percent mode is gated on Manual, not just the toggle state', () => {
    assert.match(source, /const isPercentMode = macroPreset === 'custom' && macroInputMode === '%'/)
  })

  it('converts through the shared tdee percent helpers, not ad-hoc math', () => {
    assert.match(source, /gramsFromPercent,\s*percentFromGrams,/)
    assert.match(source, /gramsFromPercent\(goals\.calories, rawValue, MACRO_KCAL_PER_G\[key\]\)/)
    assert.match(source, /percentFromGrams\(goals\.calories, goals\[key\], MACRO_KCAL_PER_G\[key\]\)/)
  })

  it('a typed percentage still writes grams into goals state, not a percent field', () => {
    assert.match(source, /setGoals\(prev => \(\{ \.\.\.prev, \[key\]: grams \}\)\)/)
  })

  it('every macro input reads/writes through the shared field helpers', () => {
    for (const key of ['protein', 'carbs', 'fats']) {
      assert.match(source, new RegExp(`value=\\{macroFieldValue\\('${key}'\\)\\}`))
      assert.match(source, new RegExp(`onChange=\\{\\(e\\) => handleMacroFieldChange\\('${key}', Number\\(e\\.target\\.value\\)\\)\\}`))
    }
  })
})
