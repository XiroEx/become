// Run with: npm run test:file tests/unit/nutritionDrift.test.ts
//
// Lockstep drift test for copied pure nutrition modules (NP-017 / NP-061).
//
// Shared pure domain logic lives in `@become/core` (`shared/core/src/`), imported by
// `expo/` through Metro and eventually by `webapp/` once published.
// Today, the webapp maintains its own source files under `webapp/lib/` to satisfy
// isolated Docker build contexts.
//
// This test asserts that every copied nutrition module in `shared/core/src/` is
// strictly in lockstep with its web source in `webapp/lib/` (after canonical import
// rewrites). If any web module is modified without syncing the copy, this test
// fails the webapp CI job.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const WEBAPP_LIB = path.resolve(__dirname, '../../lib')
const SHARED_CORE_SRC = path.resolve(__dirname, '../../../shared/core/src')

interface ModuleSpec {
  name: string
  webRelative: string
  sharedRelative: string
  rewrite: (src: string) => string
}

export const NUTRITION_MODULES: ModuleSpec[] = [
  {
    name: 'units',
    webRelative: 'units.ts',
    sharedRelative: 'units.ts',
    rewrite: s => s,
  },
  {
    name: 'foodMath',
    webRelative: 'foodMath.ts',
    sharedRelative: 'foodMath.ts',
    rewrite: s =>
      s
        .replace(
          "import type { IFoodNutrition, IFoodVariant } from '@/models/Food'",
          "import type { IFoodNutrition, IFoodVariant } from './nutrition/types'"
        )
        .replace("from '@/lib/units'", "from './units'"),
  },
  {
    name: 'mealPlanTimes',
    webRelative: 'mealPlanTimes.ts',
    sharedRelative: 'mealPlanTimes.ts',
    rewrite: s => s,
  },
  {
    name: 'mealPlanDates',
    webRelative: 'mealPlanDates.ts',
    sharedRelative: 'mealPlanDates.ts',
    rewrite: s => s,
  },
  {
    name: 'servingOptions',
    webRelative: 'nutrition/servingOptions.ts',
    sharedRelative: 'nutrition/servingOptions.ts',
    rewrite: s =>
      s
        .replace("from '@/lib/units'", "from '../units'")
        .replace(
          "import type { IFoodVariant } from '@/models/Food'",
          "import type { IFoodVariant } from './types'"
        )
        .replace("from '@/lib/foodMath'", "from '../foodMath'"),
  },
  {
    name: 'servingQuantityStep',
    webRelative: 'nutrition/servingQuantityStep.ts',
    sharedRelative: 'nutrition/servingQuantityStep.ts',
    rewrite: s =>
      s.replace("import type { Unit } from '@/lib/units'", "import type { Unit } from '../units'"),
  },
  {
    name: 'dayOrder',
    webRelative: 'nutrition/dayOrder.ts',
    sharedRelative: 'nutrition/dayOrder.ts',
    rewrite: s =>
      s.replaceAll("from '@/lib/nutrition/mealSchedule'", "from './mealSchedule'"),
  },
  {
    name: 'mealSchedule',
    webRelative: 'nutrition/mealSchedule.ts',
    sharedRelative: 'nutrition/mealSchedule.ts',
    rewrite: s =>
      s.replace("from '@/lib/mealPlanTimes'", "from '../mealPlanTimes'"),
  },
  {
    name: 'logTagMatch',
    webRelative: 'nutrition/logTagMatch.ts',
    sharedRelative: 'nutrition/logTagMatch.ts',
    rewrite: s => s,
  },
  {
    name: 'goalLine',
    webRelative: 'nutrition/goalLine.ts',
    sharedRelative: 'nutrition/goalLine.ts',
    rewrite: s => s,
  },
  {
    name: 'plateReview',
    webRelative: 'nutrition/plateReview.ts',
    sharedRelative: 'nutrition/plateReview.ts',
    rewrite: s =>
      s
        .replace("from '@/lib/units'", "from '../units'")
        .replace("from '@/lib/foodMath'", "from '../foodMath'")
        .replace("from '@/lib/nutrition/servingOptions'", "from './servingOptions'")
        .replace(
          "import type { ServingUnit } from '@/models/Food'",
          "import type { ServingUnit } from './types'"
        )
        .replace(
          "import type { PlateEstimate, EstimatedPlateItem } from '@/lib/nutrition/aiSeams'",
          "import type { PlateEstimate, EstimatedPlateItem } from './types'"
        )
        .replace(
          "import type { IFoodEntry } from '@/lib/nutritionTypes'",
          "import type { IFoodEntry } from './types'"
        )
        .replace(
          "import type { QuantityPickerVariant } from '@/components/nutrition/QuantityPicker'",
          "import type { QuantityPickerVariant } from './types'"
        ),
  },
  {
    name: 'nutritionTrend',
    webRelative: 'dashboard/nutritionTrend.ts',
    sharedRelative: 'nutrition/nutritionTrend.ts',
    rewrite: s => s,
  },
]

describe('nutrition lockstep drift (NP-017 / NP-061)', () => {
  it('covers all 12 pure nutrition modules', () => {
    assert.equal(NUTRITION_MODULES.length, 12)
  })

  for (const mod of NUTRITION_MODULES) {
    it(`fails if ${mod.name} in shared/core differs from its web source`, () => {
      const webPath = path.join(WEBAPP_LIB, mod.webRelative)
      const sharedPath = path.join(SHARED_CORE_SRC, mod.sharedRelative)

      assert.ok(fs.existsSync(webPath), `Web source missing: ${webPath}`)
      assert.ok(fs.existsSync(sharedPath), `Shared core copy missing: ${sharedPath}`)

      const webContent = fs.readFileSync(webPath, 'utf8')
      const sharedContent = fs.readFileSync(sharedPath, 'utf8')
      const expectedShared = mod.rewrite(webContent)

      assert.equal(
        sharedContent,
        expectedShared,
        `Lockstep drift detected in ${mod.name}! Run 'node scripts/vendor-nutrition.mjs' to sync.`
      )
    })
  }

  it('fails when any synthetic modification is introduced into a web source', () => {
    const mod = NUTRITION_MODULES.find(m => m.name === 'units')!
    const webPath = path.join(WEBAPP_LIB, mod.webRelative)
    const webContent = fs.readFileSync(webPath, 'utf8')
    const driftedContent = webContent + '\n// drifted change\n'
    const expected = mod.rewrite(driftedContent)
    const sharedContent = fs.readFileSync(path.join(SHARED_CORE_SRC, mod.sharedRelative), 'utf8')

    assert.notEqual(
      sharedContent,
      expected,
      'Drift check must catch differences between web source and shared core'
    )
  })

  it('fails when any synthetic modification is introduced into plateReview', () => {
    const mod = NUTRITION_MODULES.find(m => m.name === 'plateReview')!
    const webPath = path.join(WEBAPP_LIB, mod.webRelative)
    const webContent = fs.readFileSync(webPath, 'utf8')
    const driftedContent = webContent + '\n// drifted change\n'
    const expected = mod.rewrite(driftedContent)
    const sharedContent = fs.readFileSync(path.join(SHARED_CORE_SRC, mod.sharedRelative), 'utf8')

    assert.notEqual(
      sharedContent,
      expected,
      'Drift check must catch differences between web source and shared core for plateReview'
    )
  })
})
