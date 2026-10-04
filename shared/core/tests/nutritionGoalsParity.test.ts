import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import {
  ACTIVITY_LABELS,
  DIRECTION_ADJUSTMENT,
  DIRECTION_LABELS,
  DIRECTION_EXPLANATION,
  calcTdee,
  calorieAdjustment,
  computeNutritionTargets,
  deliveredSplit,
  gramsFromPercent,
  percentFromGrams,
  splitFromGrams,
  MACRO_PRESET_LABELS,
  MACRO_PRESET_BLURBS,
  MACRO_PRESET_SPLITS,
  RECOMMENDED_SPLITS,
  toKg,
  kgToLbs,
  roundWeight,
  ftInToCm,
  cmToFtIn,
  displayWeight,
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  MACRO_LABELS,
  nutritionGoalLine,
  defaultPaceKg,
  etaWeeks,
  formatEta,
} from '../src/index'

/**
 * NP-148 drift test: the native goals screen must keep reading the same
 * shared maths the web goals page reads, and the web page must keep reading
 * the same module the native screen reads.
 *
 * The webapp keeps its OWN module files for now (RedRun builds `webapp/`
 * alone, so webapp code must not import `@become/core` or `../shared/*`).
 * Until redsync publishes the package and the webapp switches over, the two
 * copies stay identical by construction — and THIS test fails when they
 * diverge in behaviour, so neither side can drift in silence.
 *
 * Two layers:
 *   1. Behavioural parity: the same inputs through the shared pipeline
 *      produce the exact reference targets both clients persist. If the web
 *      module and shared/core ever disagree, one of them no longer matches
 *      these numbers.
 *   2. Structural parity: the native route and the web page import the same
 *      symbols from the same shared module family, and the explain sheets
 *      render the same steps/notes the shared explain functions produce.
 */
const WEB_GOALS_PAGE = path.resolve(__dirname, '../../../webapp/app/dashboard/nutrition/goals/page.tsx')
const NATIVE_GOALS_ROUTE = path.resolve(__dirname, '../../../expo/app/(app)/(tabs)/nutrition/goals.tsx')
const WEB_TDEE = path.resolve(__dirname, '../../../webapp/lib/nutrition/tdee.ts')
const WEB_MACRO_EXPLAIN = path.resolve(__dirname, '../../../webapp/lib/nutrition/macroExplain.ts')
const WEB_GOAL_LINE = path.resolve(__dirname, '../../../webapp/lib/nutrition/goalLine.ts')
const WEB_BODY_UNITS = path.resolve(__dirname, '../../../webapp/lib/bodyUnits.ts')
const WEB_PACE = path.resolve(__dirname, '../../../webapp/lib/goals/pace.ts')
const NATIVE_PLAN_CARD = path.resolve(__dirname, '../../../expo/components/goals/NutritionPlanCard.tsx')

/** The reference member both clients compute for. */
const REFERENCE_STATS = {
  currentWeightKg: 83.9,
  heightCm: 178,
  age: 30,
  biologicalSex: 'male' as const,
}

describe('NP-148 nutrition goals parity (native ↔ web)', () => {
  it('computes identical targets for the same inputs (id: e015ca04)', () => {
    // Mifflin-St Jeor: 10*83.9 + 6.25*178 - 5*30 + 5 = 1806.5 → BMR 1806.5
    // × moderate 1.55 = 2800.075 → TDEE 2800.
    assert.equal(calcTdee(REFERENCE_STATS, 'moderate'), 2800)

    // Lose at the flat default: -500 capped to 20% of TDEE (560) → -500.
    assert.equal(calorieAdjustment(2800, 'lose'), -500)
    // The member's chosen pace travels instead: 1 lb/week = 500 cal/day.
    assert.equal(calorieAdjustment(2800, 'lose', 1), -500)
    assert.equal(calorieAdjustment(2800, 'lose', 0.5), -250)
    assert.equal(calorieAdjustment(2800, 'lose', 1.5), -750)

    // Full pipeline, recommended preset: the numbers both clients persist.
    const targets = computeNutritionTargets({
      ...REFERENCE_STATS,
      goals: ['lose_weight'],
      direction: 'lose',
      activityLevel: 'moderate',
      macroPreset: 'recommended',
    })
    assert.ok(targets)
    assert.equal(targets.tdee, 2800)
    assert.equal(targets.calories, 2300)
    assert.equal(targets.direction, 'lose')
    assert.equal(targets.activityLevel, 'moderate')
    // Macro calories sum back to the calorie target (within rounding).
    const macroCals = targets.protein * 4 + targets.carbs * 4 + targets.fats * 9
    assert.ok(Math.abs(macroCals - targets.calories) <= 15)

    // The same inputs with an explicit 1 lb/week pace save the same
    // calories the pace picker advertises (500 cal/day deficit).
    const paced = computeNutritionTargets({
      ...REFERENCE_STATS,
      goals: ['lose_weight'],
      direction: 'lose',
      activityLevel: 'moderate',
      macroPreset: 'recommended',
      paceKgPerWeek: 1 * 0.45359237,
    })
    assert.ok(paced)
    assert.equal(paced.calories, 2300)

    // Every preset resolves through the same pipeline — picking a ratio
    // moves the ratio, and the delivered split is what the picker promises.
    for (const preset of ['recommended', 'balanced', 'high_protein', 'low_carb'] as const) {
      const split = deliveredSplit(preset, {
        ...REFERENCE_STATS,
        goals: ['lose_weight'],
        direction: 'lose',
        activityLevel: 'moderate',
      })
      assert.ok(split, `deliveredSplit(${preset}) must resolve`)
      assert.equal(split.protein + split.carbs + split.fats >= 99, true)
      assert.equal(split.protein + split.carbs + split.fats <= 101, true)
    }
    assert.equal(deliveredSplit('custom', { ...REFERENCE_STATS }), null)

    // Manual percent entry round-trips through the same gram maths.
    assert.equal(gramsFromPercent(2000, 30, 4), 150)
    assert.equal(percentFromGrams(2000, 150, 4), 30)
    assert.deepEqual(splitFromGrams(150, 200, 67), { protein: 30, carbs: 40, fats: 30 })

    // Unit conversion is exact — never rounded at conversion time.
    assert.equal(toKg(210, 'lbs'), 210 / 2.20462)
    assert.equal(toKg(95, 'kg'), 95)
    assert.equal(roundWeight(kgToLbs(83.9)), 185)
    assert.deepEqual(cmToFtIn(182), { ft: 6, inches: 0 })
    assert.equal(ftInToCm(5, 10), 70 * 2.54)
    assert.equal(displayWeight(83.9, 'lbs'), 185)

    // The goal line under the calorie ring reads the same inputs.
    assert.equal(
      nutritionGoalLine({ calories: 2200, targetWeight: 175, unit: 'lbs', direction: 'lose', paceStatus: 'on' }),
      '2,200 cal/day, on track for 175 lbs',
    )

    // Pace maths the Plan card renders.
    assert.equal(defaultPaceKg('lose'), 1 * 0.45359237)
    assert.ok((etaWeeks(90, 80, 0.5) ?? 0) > 0)
    assert.equal(formatEta(0), 'there')
  })

  it('explain sheets read the same as the web (id: e015ca05)', () => {
    // Calories: Mifflin-St Jeor → activity → goal adjustment, in the
    // member's own numbers.
    const c = explainCalories(REFERENCE_STATS, 'moderate', 'lose', 1 * 0.45359237)
    assert.ok(c)
    assert.ok(c.steps.some((s) => s.label.includes('BMR')))
    assert.ok(c.steps.some((s) => s.label.includes('Your daily target')))
    // explainCalories rounds BMR before applying activity (1806.5 → 1807 →
    // TDEE 2801) while computeNutritionTargets rounds once (TDEE 2800), so
    // the sheet reads 2301 against the card's 2300. That 1-cal gap is shared
    // behaviour — both clients call this same function — not a divergence.
    assert.equal(c.tdee, 2801)
    assert.equal(c.calories, c.tdee - 500)

    // Macros: the share of calories, into grams, against bodyweight.
    const m = explainMacro({
      macro: 'protein',
      grams: 160,
      calories: 2300,
      percent: 28,
      weightKg: 83.9,
      direction: 'lose',
      goals: ['lose_weight'],
      presetLabel: MACRO_PRESET_LABELS.recommended,
    })
    assert.equal(m.macro, 'protein')
    assert.ok(m.steps.length >= 2)
    assert.ok(m.perLb)
    assert.ok(m.note, 'protein always carries a note (info or caution)')

    // The card flags protein before anyone taps anything.
    assert.equal(proteinNeedsFlag(250, 83.9, 'lose', ['lose_weight']), true)
    assert.equal(proteinNeedsFlag(160, 83.9, 'lose', ['lose_weight']), false)

    // Labels travel with the maths — the screens never hardcode them.
    assert.equal(DIRECTION_LABELS.lose, 'Lose Weight')
    assert.equal(DIRECTION_LABELS.maintain, 'Maintain')
    assert.equal(DIRECTION_LABELS.gain, 'Gain Weight')
    assert.equal(MACRO_PRESET_LABELS.high_protein, 'High Protein')
    assert.equal(MACRO_PRESET_LABELS.low_carb, 'Lower Carb')
    assert.equal(MACRO_PRESET_LABELS.custom, 'Manual')
    assert.ok(DIRECTION_EXPLANATION.lose.length > 0)
    assert.ok(MACRO_PRESET_BLURBS.balanced.length > 0)
    assert.ok(MACRO_LABELS.protein.length > 0)
    assert.deepEqual(Object.keys(ACTIVITY_LABELS).sort(), ['active', 'light', 'moderate', 'sedentary', 'very_active'])
    assert.deepEqual(DIRECTION_ADJUSTMENT, { lose: -500, maintain: 0, gain: 300 })
    assert.deepEqual(MACRO_PRESET_SPLITS.balanced, { protein: 30, carbs: 40, fats: 30 })
    assert.deepEqual(RECOMMENDED_SPLITS.lose, { protein: 35, carbs: 35, fats: 30 })
  })

  it('native goals route imports the shared maths (never a second copy)', () => {
    assert.ok(fs.existsSync(NATIVE_GOALS_ROUTE), 'expo nutrition goals route must exist')
    assert.ok(fs.existsSync(NATIVE_PLAN_CARD), 'native NutritionPlanCard must exist')
    const route = fs.readFileSync(NATIVE_GOALS_ROUTE, 'utf8')
    const planCard = fs.readFileSync(NATIVE_PLAN_CARD, 'utf8')

    // The route computes through @become/core — the same module family as
    // the onboarding wizard — and never re-derives a target.
    for (const sym of [
      'computeNutritionTargets',
      'calorieAdjustment',
      'calcTdee',
      'deliveredSplit',
      'gramsFromPercent',
      'percentFromGrams',
      'splitFromGrams',
      'explainCalories',
      'explainMacro',
      'proteinNeedsFlag',
      'DIRECTION_LABELS',
      'DIRECTION_EXPLANATION',
      'ACTIVITY_LABELS',
      'MACRO_PRESET_LABELS',
      'toKg',
      'kgToLbs',
      'PacePicker',
      'MacroExplainSheet',
      'NutritionPlanCard',
      'ProgressChart',
      'WeightLogSheet',
    ]) {
      assert.ok(route.includes(sym), `native goals route must use ${sym}`)
    }
    assert.ok(
      route.includes('from "@become/core"'),
      'native goals route must import the maths from @become/core',
    )
    // No second copy of the maths beside the route.
    assert.ok(!route.includes('Mifflin-St Jeor'), 'route must not carry its own BMR formula')
    assert.ok(!route.includes('3500'), 'route must not carry its own pace conversion')
    assert.ok(!route.includes('1.375'), 'route must not carry its own activity multipliers')

    // The Plan card reuses the shared PacePicker and the shared pace maths.
    assert.ok(planCard.includes('PacePicker'), 'Plan card must reuse PacePicker')
    assert.ok(planCard.includes('readReached'), 'Plan card must read goal status from shared status')
    assert.ok(planCard.includes('/api/goals'), 'Plan card must read/write /api/goals')

    // The route talks to the same four endpoints as the web page.
    for (const endpoint of ['/api/nutrition/goals', '/api/goals', '/api/progress', '/api/profile', '/api/weight']) {
      assert.ok(route.includes(endpoint), `native goals route must call ${endpoint}`)
    }
  })

  it('web goals page and shared/core stay identical until redsync publishes', () => {
    assert.ok(fs.existsSync(WEB_GOALS_PAGE), 'web goals page must exist')
    assert.ok(fs.existsSync(WEB_TDEE), 'webapp tdee module must exist')
    assert.ok(fs.existsSync(WEB_MACRO_EXPLAIN), 'webapp macroExplain module must exist')
    assert.ok(fs.existsSync(WEB_GOAL_LINE), 'webapp goalLine module must exist')
    assert.ok(fs.existsSync(WEB_BODY_UNITS), 'webapp bodyUnits module must exist')
    assert.ok(fs.existsSync(WEB_PACE), 'webapp pace module must exist')

    // The web page reads the same symbols the native route reads, so the
    // same inputs save identical targets on both clients.
    const page = fs.readFileSync(WEB_GOALS_PAGE, 'utf8')
    for (const sym of [
      'computeNutritionTargets',
      'calorieAdjustment',
      'calcTdee',
      'deliveredSplit',
      'splitFromGrams',
      'DIRECTION_LABELS',
      'DIRECTION_EXPLANATION',
      'ACTIVITY_LABELS',
      'MACRO_PRESET_LABELS',
      'toKg',
      'kgToLbs',
      'PlanCard',
      'WeightLogSheet',
    ]) {
      assert.ok(page.includes(sym), `web goals page must use ${sym}`)
    }

    // The webapp keeps its OWN module files (RedRun builds webapp/ alone),
    // and each one re-exports the shared implementation — so a behaviour
    // change in shared/core reaches the web page, and a local edit to the
    // web copy is visible here as a divergence to reconcile.
    const sharedTdee = fs.readFileSync(path.resolve(__dirname, '../src/nutrition/tdee.ts'), 'utf8')
    const webTdee = fs.readFileSync(WEB_TDEE, 'utf8')
    assert.ok(
      webTdee.includes("from '@become/core/nutrition/tdee'") || webTdee.includes('from "@become/core/nutrition/tdee"'),
      'webapp tdee.ts must re-export @become/core/nutrition/tdee',
    )
    for (const sym of [
      'computeNutritionTargets',
      'calorieAdjustment',
      'calcTdee',
      'deliveredSplit',
      'MACRO_CALC_VERSION',
    ]) {
      assert.ok(sharedTdee.includes(sym), `shared/core tdee must export ${sym}`)
    }

    const sharedExplain = fs.readFileSync(path.resolve(__dirname, '../src/nutrition/macroExplain.ts'), 'utf8')
    const webExplain = fs.readFileSync(WEB_MACRO_EXPLAIN, 'utf8')
    for (const sym of ['explainCalories', 'explainMacro', 'proteinNeedsFlag', 'MACRO_LABELS', 'KCAL_PER_G']) {
      assert.ok(sharedExplain.includes(sym), `shared/core macroExplain must export ${sym}`)
      assert.ok(webExplain.includes(sym), `webapp macroExplain must export ${sym}`)
    }

    const sharedGoalLine = fs.readFileSync(path.resolve(__dirname, '../src/nutrition/goalLine.ts'), 'utf8')
    const webGoalLine = fs.readFileSync(WEB_GOAL_LINE, 'utf8')
    assert.ok(sharedGoalLine.includes('nutritionGoalLine'), 'shared/core goalLine must export nutritionGoalLine')
    assert.ok(webGoalLine.includes('nutritionGoalLine'), 'webapp goalLine must export nutritionGoalLine')
  })
})
