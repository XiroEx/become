// Run with: npx tsx --test tests/unit/nutritionMacros.test.ts
//
// Macro splits used to be: protein from g/lb, fat a flat 25%, carbs whatever was
// left. Carbs absorbed the entire remainder, so a 6'5" member on a surplus was
// handed 453g of carbs (56% of intake) while protein sat at 19%. The bigger the
// calorie target, the worse it got.
//
// Every macro is now an explicit share of calories, with protein bounded by
// bodyweight. These tests exist to stop a number like 453 shipping again.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeNutritionTargets,
  splitForPreset,
  recommendedPresetForGoal,
  MACRO_PRESET_SPLITS,
  RECOMMENDED_SPLITS,
  type MacroPreset,
  type NutritionDirection,
  type TargetsInput,
} from '../../lib/nutrition/tdee'

/** The member from the bug report: 6'5", 175 lb, gaining. */
const ADRIAN: TargetsInput = {
  currentWeightKg: 79.4,
  heightCm: 195.6,
  age: 25,
  biologicalSex: 'male',
  goals: ['gain_muscle'],
  direction: 'gain',
  activityLevel: 'moderate',
}

const PRESETS: MacroPreset[] = ['recommended', 'balanced', 'high_protein', 'low_carb']
const DIRECTIONS: NutritionDirection[] = ['lose', 'maintain', 'gain']

test('every split adds up to 100%', () => {
  for (const s of [...Object.values(MACRO_PRESET_SPLITS), ...Object.values(RECOMMENDED_SPLITS)]) {
    assert.equal(s.protein + s.carbs + s.fats, 100, `${JSON.stringify(s)} does not total 100`)
  }
})

test('REGRESSION: the 453g carb case is gone', () => {
  const t = computeNutritionTargets({ ...ADRIAN })!
  assert.ok(t.carbs < 400, `carbs still ${t.carbs}g`)
  assert.ok(t.split.carbs <= 50, `carbs still ${t.split.carbs}% of intake`)
  assert.ok(t.split.protein >= 25, `protein only ${t.split.protein}% of intake`)
})

test('a lower-carb option genuinely exists for someone who wants it', () => {
  const rec = computeNutritionTargets({ ...ADRIAN, macroPreset: 'recommended' })!
  const low = computeNutritionTargets({ ...ADRIAN, macroPreset: 'low_carb' })!
  assert.ok(low.carbs < rec.carbs * 0.7, `low_carb ${low.carbs}g vs recommended ${rec.carbs}g`)
})

test('macros always reconstruct the calorie target', () => {
  for (const preset of PRESETS) {
    for (const direction of DIRECTIONS) {
      const t = computeNutritionTargets({ ...ADRIAN, direction, macroPreset: preset })!
      const fromMacros = t.protein * 4 + t.carbs * 4 + t.fats * 9
      const drift = Math.abs(fromMacros - t.calories)
      assert.ok(drift <= 12, `${preset}/${direction} drifts ${drift} cal from the target`)
    }
  }
})

test('no body type produces an absurd macro anywhere in the grid', () => {
  const bodies: (TargetsInput & { label: string; currentWeightKg: number })[] = [
    { label: 'tall lean male', currentWeightKg: 79.4, heightCm: 195.6, age: 25, biologicalSex: 'male' },
    { label: 'short female', currentWeightKg: 54, heightCm: 152, age: 40, biologicalSex: 'female' },
    { label: 'heavy male', currentWeightKg: 145, heightCm: 183, age: 35, biologicalSex: 'male' },
    { label: 'older male', currentWeightKg: 82, heightCm: 178, age: 68, biologicalSex: 'male' },
    { label: 'undisclosed', currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'prefer_not_to_say' },
  ]

  for (const b of bodies) {
    for (const preset of PRESETS) {
      for (const direction of DIRECTIONS) {
        for (const activityLevel of ['sedentary', 'moderate', 'very_active'] as const) {
          const t = computeNutritionTargets({ ...b, direction, macroPreset: preset, activityLevel })
          assert.ok(t, `${b.label} produced no targets`)
          const where = `${b.label}/${preset}/${direction}/${activityLevel}`
          const lbs = b.currentWeightKg * 2.20462

          // Nothing unphysiological, and nothing that reads as a typo. Carbs are
          // bounded PROPORTIONALLY — at 4,900 cal every macro is large and that
          // is arithmetic, not a bug.
          assert.ok(t.carbs > 0, `${where}: ${t.carbs}g carbs`)
          assert.ok(t.carbs * 4 <= t.calories * 0.55, `${where}: carbs are ${t.split.carbs}% of intake`)
          assert.ok(t.protein > 0 && t.protein <= 250, `${where}: ${t.protein}g protein`)
          assert.ok(t.fats >= 20, `${where}: ${t.fats}g fat`)
          // Ceiling rather than the preset's nominal share: when the protein cap
          // binds, the leftover redistributes and lifts fat a few points above the
          // preset. Half the plate is the line nothing may cross.
          assert.ok(t.fats * 9 <= t.calories * 0.5, `${where}: fat is ${t.split.fats}% of intake`)
          // The calorie target itself must be sane — every macro scales with it,
          // so a bad TDEE would show up here rather than as an odd gram figure.
          assert.ok(t.calories >= 1200 && t.calories <= 6000, `${where}: ${t.calories} cal`)

          // Protein stays in a defensible g/lb band.
          const perLb = t.protein / lbs
          assert.ok(perLb >= 0.6 && perLb <= 1.65, `${where}: ${perLb.toFixed(2)} g/lb protein`)

          // Carbs can never dominate the plate again.
          assert.ok(t.split.carbs <= 55, `${where}: carbs ${t.split.carbs}%`)
        }
      }
    }
  }
})

test('a bigger calorie target no longer dilutes protein', () => {
  // The old model kept protein in absolute grams, so its SHARE fell as calories
  // rose — the root cause of the carb blowout.
  const low = computeNutritionTargets({ ...ADRIAN, activityLevel: 'sedentary' })!
  const high = computeNutritionTargets({ ...ADRIAN, activityLevel: 'very_active' })!
  assert.ok(high.calories > low.calories + 500, 'test needs a real calorie gap')
  assert.ok(
    Math.abs(high.split.protein - low.split.protein) <= 6,
    `protein share moved ${low.split.protein}% -> ${high.split.protein}% with calories`,
  )
})

test('the suggested preset follows the goal', () => {
  assert.equal(recommendedPresetForGoal('gain', ['gain_muscle']), 'high_protein')
  assert.equal(recommendedPresetForGoal('lose', ['lose_weight']), 'high_protein')
  assert.equal(recommendedPresetForGoal('maintain', ['general_health']), 'recommended')
})

test('"prefer not to say" still gets real targets', () => {
  // Declining to state used to return null, which seeded nothing and left the
  // member on the hardcoded 2000/150/200/65 defaults.
  const t = computeNutritionTargets({
    currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'prefer_not_to_say',
    direction: 'maintain', activityLevel: 'moderate',
  })
  assert.ok(t, 'undisclosed sex must still produce targets')
  const male = computeNutritionTargets({ currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'male', direction: 'maintain', activityLevel: 'moderate' })!
  const female = computeNutritionTargets({ currentWeightKg: 70, heightCm: 170, age: 30, biologicalSex: 'female', direction: 'maintain', activityLevel: 'moderate' })!
  assert.ok(t!.calories < male.calories && t!.calories > female.calories, 'should sit between the two')
})

test('missing body stats still refuse to invent a number', () => {
  for (const partial of [
    { heightCm: 180, age: 30, biologicalSex: 'male' },
    { currentWeightKg: 80, age: 30, biologicalSex: 'male' },
    { currentWeightKg: 80, heightCm: 180, biologicalSex: 'male' },
  ] as TargetsInput[]) {
    assert.equal(computeNutritionTargets(partial), null, 'sparse stats must return null, not a guess')
  }
})

test('splitForPreset is the single source of truth for both screens', () => {
  assert.deepEqual(splitForPreset('balanced', 'gain'), MACRO_PRESET_SPLITS.balanced)
  assert.deepEqual(splitForPreset('recommended', 'lose'), RECOMMENDED_SPLITS.lose)
  assert.deepEqual(splitForPreset('custom', 'gain'), RECOMMENDED_SPLITS.gain)
})

test('the deficit scales with the member instead of being a flat 500', () => {
  // A flat 500 is ~17% of a 2,940 TDEE but ~30% of a 1,667 one. The small member
  // was driven straight into the 1,200 calorie floor by a cut nobody would
  // prescribe; the large member should be completely unaffected.
  const small = computeNutritionTargets({
    currentWeightKg: 59.87, heightCm: 157.5, age: 42, biologicalSex: 'female',
    direction: 'lose', activityLevel: 'light',
  })!
  assert.ok(small.calories > 1200, 'a small member must not be floored by her own deficit')
  const smallPct = (small.tdee - small.calories) / small.tdee
  assert.ok(smallPct <= 0.21, `deficit is ${Math.round(smallPct * 100)}% of TDEE`)

  // Unchanged for anyone big enough that 500 was already proportionate.
  const large = computeNutritionTargets({
    currentWeightKg: 95.25, heightCm: 182.88, age: 25, biologicalSex: 'male',
    direction: 'lose', activityLevel: 'active',
  })!
  assert.equal(large.tdee - large.calories, 500)
})

test('no direction ever pushes anyone below the calorie floor by design', () => {
  for (const direction of DIRECTIONS) {
    for (const activityLevel of ['sedentary', 'light'] as const) {
      const t = computeNutritionTargets({
        currentWeightKg: 45, heightCm: 145, age: 70, biologicalSex: 'female',
        direction, activityLevel,
      })!
      assert.ok(t.calories >= 1200, `${direction}/${activityLevel}: ${t.calories} cal`)
    }
  }
})
