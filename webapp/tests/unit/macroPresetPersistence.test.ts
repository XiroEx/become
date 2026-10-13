// Run with: npm run test:file tests/unit/macroPresetPersistence.test.ts
//
// This repo does not carry jsdom/testing-library. Keep the client wiring pinned
// with the same source-level regression style used by the other Nutrition
// Goals component tests.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(__dirname, '../../app/dashboard/nutrition/goals/page.tsx'),
  'utf8',
)

describe('Nutrition Goals macro preset persistence', () => {
  it('restores the saved preset returned by the goals API', () => {
    assert.match(
      source,
      /MACRO_PRESET_KEYS\.includes\(goalsData\.macroPreset as MacroPreset\)[^]*?setMacroPreset\(goalsData\.macroPreset as MacroPreset\)/,
    )
  })

  it('saves the selected preset together with its calorie and gram targets', () => {
    assert.match(source, /JSON\.stringify\(\{ \.\.\.goals, macroPreset \}\)/)
  })
})
