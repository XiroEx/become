// Run with: npm run test:file tests/unit/planPaceConnectedToCalories.test.ts
//
// The Plan card's pace picker (0.5/1/1.5 lb a week) wrote to Goal.target.paceKgPerWeek
// and only ever fed the ETA text on that same card — the Nutrition Goals page's
// "Lose Weight: TDEE - 500" tile and the Daily Targets below it never knew the pace
// existed, so they always showed the flat default no matter which chip was tapped.
// No jsdom/testing-library in this repo (see customExerciseTrackingType.test.ts), so
// the wiring is verified by source scan, the same approach weightLogSheet.test.tsx
// and nadine-fixes.test.ts use for React components here.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('PlanCard surfaces a pace change instead of keeping it to itself', () => {
  const SRC = readSource('components/goals/PlanCard.tsx')

  it('accepts an onPaceChange callback', () => {
    assert.match(SRC, /onPaceChange\?:\s*\(info:/)
  })

  it('fires it with the fresh pace and direction right after the PUT succeeds', () => {
    assert.match(SRC, /onPaceChange\?\.\(\{ paceKgPerWeek: kg, direction: fresh\.nutrition\.direction \}\)/)
  })
})

describe('the Nutrition Goals page reads the Plan pace and reacts to it', () => {
  const SRC = readSource('app/dashboard/nutrition/goals/page.tsx')

  it('fetches the active Goal (where the chosen pace lives), not just the NutritionGoal doc', () => {
    assert.match(SRC, /fetch\(`\/api\/goals\?tz=\$\{new Date\(\)\.getTimezoneOffset\(\)\}`, \{ headers \}\)/)
    assert.match(SRC, /planPaceKgPerWeek/)
    assert.match(SRC, /planPaceDirection/)
  })

  it('wires PlanCard to a handler instead of ignoring pace changes', () => {
    assert.match(SRC, /<PlanCard[^]*?onPaceChange=/)
    assert.match(SRC, /handlePlanPaceChange/)
  })

  it('the calorie adjustment goes through calorieAdjustment(), not the flat DIRECTION_ADJUSTMENT lookup', () => {
    assert.match(SRC, /calorieAdjustment\(baseTdee, goalType, paceLb\)/)
  })

  it('the "Lose/Gain Weight" tiles recompute their label instead of a module-level constant', () => {
    // GOAL_CARDS used to be a top-level const built once from DIRECTION_ADJUSTMENT,
    // so the badge could never reflect a pace picked after the module loaded.
    assert.doesNotMatch(SRC, /^const GOAL_CARDS/m)
    assert.match(SRC, /const goalCards = useMemo\(/)
    assert.match(SRC, /\[tdee, planPaceDirection, planPaceKgPerWeek\]/)
  })

  it('a pace change for the currently active direction recomputes targets immediately, with the fresh value (not stale state)', () => {
    assert.match(SRC, /const handlePlanPaceChange = useCallback\(\(paceKgPerWeek: number, direction: GoalType\) => \{/)
    assert.match(SRC, /applyTargets\(macroPreset, goals\.goalType, goals\.activityLevel, undefined, undefined, paceKgPerWeek\)/)
  })
})

describe('the pace-aware calorie math still exists after a weigh-in recompute', () => {
  const SRC = readSource('app/dashboard/nutrition/goals/page.tsx')

  it('handleWeightLogged still calls applyTargets the same way (pinned by weightLogSheet.test.tsx)', () => {
    assert.match(SRC, /applyTargets\(macroPreset, goals\.goalType, goals\.activityLevel, nextTdee \?\? undefined, nextStats\)/)
  })
})
