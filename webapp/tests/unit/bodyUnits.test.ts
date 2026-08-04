import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  lbsToKg,
  kgToLbs,
  toKg,
  fromKg,
  roundWeight,
  displayWeight,
  ftInToCm,
  cmToFtIn,
  roundHeightCm,
} from '@/lib/bodyUnits'
import { computeNutritionTargets, calcTdee } from '@/lib/nutrition/tdee'

/**
 * These tests exist because the same member saw different calorie targets on
 * different screens. Onboarding rounded lbs→kg to 0.1 kg, the nutrition goals
 * page didn't round at all, and settings had a third copy. A member with no way
 * to tell which screen is lying stops trusting all of them.
 *
 * The invariant: ONE conversion, so ONE answer, everywhere.
 */

describe('bodyUnits conversion', () => {
  it('converts exactly and round-trips', () => {
    assert.equal(lbsToKg(210), 210 / 2.20462)
    assert.equal(kgToLbs(95), 95 * 2.20462)
    // Round-tripping must not drift — this is what rounding at conversion time
    // used to break (210 → 95.3 → 210.1).
    assert.equal(Math.round(kgToLbs(lbsToKg(210))), 210)
    assert.equal(Math.round(kgToLbs(lbsToKg(185))), 185)
  })

  it('honours the member unit instead of assuming pounds', () => {
    assert.equal(toKg(95, 'kg'), 95)
    assert.equal(toKg(210, 'lbs'), 210 / 2.20462)
    // Unspecified means lbs — the historical default, and what the log stored
    // before entries carried a unit.
    assert.equal(toKg(210), 210 / 2.20462)
    assert.equal(fromKg(95, 'kg'), 95)
    assert.equal(Math.round(fromKg(95, 'lbs')), 209)
  })

  it('rounds only for display', () => {
    assert.equal(roundWeight(95.2543871), 95.3)
    assert.equal(displayWeight(95.2543871, 'lbs'), 210)
    assert.equal(displayWeight(95.2543871, 'kg'), 95.3)
    // 6'0" is 182.88 cm and stays that way in storage.
    assert.equal(ftInToCm(6, 0), 182.88)
    assert.equal(roundHeightCm(182.88), 183)
  })

  it('never renders a height as 5\'12"', () => {
    assert.deepEqual(cmToFtIn(182.88), { ft: 6, inches: 0 })
    assert.deepEqual(cmToFtIn(180), { ft: 5, inches: 11 })   // 70.87 in → 71
    assert.deepEqual(cmToFtIn(177.8), { ft: 5, inches: 10 })
    // 181.7 cm is 71.5 in — rounds to 72, which must be 6'0", not 5'12".
    assert.deepEqual(cmToFtIn(181.7), { ft: 6, inches: 0 })
  })
})

describe('cross-screen target parity', () => {
  // The profile that exposed the bug: 25 y/o male, 6'0", 210 lb, 5 days, cutting.
  //   BMR  = 10(95.2544) + 6.25(182.88) − 5(25) + 5 = 1975.54
  //   TDEE = 1975.54 × 1.725 = 3407.8 → 3408
  //   cut  = 3408 − 500 = 2908
  const TYPED = { age: 25, sex: 'male' as const, heightFt: 6, heightIn: 0, weightLbs: 210, days: 5 }

  /** What onboarding stores on the profile from the typed answers. */
  const onboardingProfile = {
    age: TYPED.age,
    biologicalSex: TYPED.sex,
    heightCm: ftInToCm(TYPED.heightFt, TYPED.heightIn),
    currentWeightKg: lbsToKg(TYPED.weightLbs),
  }

  /** What the goals page derives from the LOGGED weight for the same member. */
  const goalsPageStats = {
    ...onboardingProfile,
    currentWeightKg: toKg(TYPED.weightLbs, 'lbs'),
  }

  it('produces the documented TDEE', () => {
    assert.equal(calcTdee(onboardingProfile, 'active'), 3408)
  })

  it('gives the same calories and macros on both screens', () => {
    const fromOnboarding = computeNutritionTargets({
      ...onboardingProfile,
      goals: ['lose_weight'],
      direction: 'lose',
      weeklyAvailability: TYPED.days,
    })
    const fromGoalsPage = computeNutritionTargets({
      ...goalsPageStats,
      goals: ['lose_weight'],
      direction: 'lose',
      activityLevel: 'active',
    })

    assert.ok(fromOnboarding && fromGoalsPage)
    assert.equal(fromOnboarding.calories, 2908)
    // Macros are explicit shares now (lose = 35/35/30), with protein bounded by
    // bodyweight rather than set by it. 1.0 g/lb is the FLOOR the cut must clear.
    assert.deepEqual(fromOnboarding.split, { protein: 34, carbs: 35, fats: 30 })
    assert.ok(fromOnboarding.protein >= 210, 'must clear the 1.0 g/lb cutting floor')
    // The actual regression this test exists for: these two were 2910 and 2909.
    assert.deepEqual(fromGoalsPage, fromOnboarding)
  })

  it('macros always re-total to the calorie target', () => {
    const t = computeNutritionTargets({
      ...onboardingProfile,
      goals: ['lose_weight'],
      direction: 'lose',
      weeklyAvailability: TYPED.days,
    })!
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fats * 9
    // Gram rounding can move this a few calories; more than that means the
    // split no longer describes the target.
    assert.ok(Math.abs(fromMacros - t.calories) <= 5, `${fromMacros} vs ${t.calories}`)
  })

  it('does not read a metric member\'s weight as pounds', () => {
    // A member tracking in kg logs "95". Read as lbs that is 43 kg, and the
    // deficit target comes out roughly 800 cal low — starvation-adjacent advice
    // from a rounding assumption.
    const asKg = computeNutritionTargets({
      age: 25,
      biologicalSex: 'male',
      heightCm: 182.88,
      currentWeightKg: toKg(95, 'kg'),
      goals: ['lose_weight'],
      direction: 'lose',
      activityLevel: 'active',
    })!
    const asPoundsByMistake = computeNutritionTargets({
      age: 25,
      biologicalSex: 'male',
      heightCm: 182.88,
      currentWeightKg: toKg(95, 'lbs'),
      goals: ['lose_weight'],
      direction: 'lose',
      activityLevel: 'active',
    })!
    assert.ok(
      asKg.calories - asPoundsByMistake.calories > 700,
      'the unit must change the answer — if it does not, someone assumed lbs again'
    )
    // 10(95) + 6.25(182.88) − 5(25) + 5 = 1973 → ×1.725 = 3403 → −500 = 2903
    assert.equal(asKg.calories, 2903)
  })
})
