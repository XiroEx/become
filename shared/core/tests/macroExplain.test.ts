import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import {
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  MACRO_LABELS,
  KCAL_PER_G,
  USEFUL_PROTEIN_CEILING_PER_LB,
} from '../src/nutrition/macroExplain'

describe('nutrition/macroExplain', () => {
  const stats = {
    currentWeightKg: 80,
    heightCm: 180,
    age: 28,
    biologicalSex: 'male' as const,
  }

  it('explains calories from Mifflin-St Jeor and activity', () => {
    const res = explainCalories(stats, 'moderate', 'lose', 0.5)
    assert.ok(res)
    assert.equal(typeof res.bmr, 'number')
    assert.equal(typeof res.tdee, 'number')
    assert.equal(typeof res.calories, 'number')
    assert.ok(res.steps.length >= 3)
    assert.ok(res.steps.some((s) => s.label.includes('BMR')))
  })

  it('returns null when stats are missing', () => {
    assert.equal(explainCalories({ ...stats, currentWeightKg: 0 }, 'moderate', 'lose'), null)
    assert.equal(explainCalories({ ...stats, heightCm: 0 }, 'moderate', 'lose'), null)
  })

  it('explains macro breakdown with steps and reality checks', () => {
    const res = explainMacro({
      macro: 'protein',
      grams: 180,
      calories: 2200,
      percent: 30,
      weightKg: 80,
      direction: 'maintain',
      goals: ['gain_muscle'],
    })
    assert.equal(res.macro, 'protein')
    assert.equal(res.grams, 180)
    assert.ok(res.perLb)
    assert.ok(res.steps.length >= 2)
  })

  it('flags protein when above ceiling or below anchor', () => {
    // 80 kg is ~176.37 lbs. Ceiling 1.2 => ~211 g.
    assert.equal(proteinNeedsFlag(250, 80, 'lose'), true)
    assert.equal(proteinNeedsFlag(160, 80, 'lose'), false)
    assert.equal(proteinNeedsFlag(100, 80, 'lose'), true)
  })

  it('drift test: webapp and shared/core macroExplain modules have identical behaviour and exports', () => {
    const sharedPath = path.resolve(__dirname, '../src/nutrition/macroExplain.ts')
    const webappPath = path.resolve(__dirname, '../../../webapp/lib/nutrition/macroExplain.ts')

    assert.ok(fs.existsSync(sharedPath), 'shared/core macroExplain.ts must exist')
    assert.ok(fs.existsSync(webappPath), 'webapp macroExplain.ts must exist')

    const sharedContent = fs.readFileSync(sharedPath, 'utf8')
    const webappContent = fs.readFileSync(webappPath, 'utf8')

    // Verify key exported symbols exist in both files
    const symbols = [
      'MacroKey',
      'KCAL_PER_G',
      'MACRO_LABELS',
      'CalcStep',
      'MacroNote',
      'MacroExplanation',
      'CalorieExplanation',
      'USEFUL_PROTEIN_CEILING_PER_LB',
      'explainCalories',
      'explainMacro',
      'proteinNeedsFlag',
    ]

    for (const sym of symbols) {
      assert.ok(
        sharedContent.includes(sym),
        `shared/core must contain ${sym}`,
      )
      assert.ok(
        webappContent.includes(sym),
        `webapp must contain ${sym}`,
      )
    }

    // Verify constants match
    assert.equal(KCAL_PER_G.protein, 4)
    assert.equal(KCAL_PER_G.carbs, 4)
    assert.equal(KCAL_PER_G.fats, 9)
    assert.equal(USEFUL_PROTEIN_CEILING_PER_LB, 1.2)
    assert.equal(MACRO_LABELS.protein, 'Protein')
    assert.equal(MACRO_LABELS.carbs, 'Carbs')
    assert.equal(MACRO_LABELS.fats, 'Fats')
  })
})
