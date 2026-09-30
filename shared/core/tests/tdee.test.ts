import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  calcBmr,
  calcTdee,
  activityFromTrainingDays,
  directionForGoal,
  computeNutritionTargets,
  splitForPreset,
  gramsFromPercent,
  percentFromGrams,
  splitFromGrams,
  recommendedPresetForGoal,
  calorieAdjustment,
  waterGoalOz,
  type TargetsInput,
} from '../src/nutrition/tdee'

const REFERENCE: TargetsInput = {
  currentWeightKg: 83.9,
  heightCm: 178,
  age: 30,
  biologicalSex: 'male',
  weeklyAvailability: 4,
}

describe('nutrition/tdee', () => {
  it('computes Mifflin-St Jeor TDEE from body stats + training days', () => {
    assert.equal(activityFromTrainingDays(4), 'moderate')
    assert.equal(calcTdee(REFERENCE, 'moderate'), 2800)
  })

  it('buckets training days onto activity multipliers', () => {
    assert.equal(activityFromTrainingDays(0), 'sedentary')
    assert.equal(activityFromTrainingDays(2), 'light')
    assert.equal(activityFromTrainingDays(3), 'moderate')
    assert.equal(activityFromTrainingDays(5), 'active')
    assert.equal(activityFromTrainingDays(6), 'very_active')
    assert.equal(activityFromTrainingDays(undefined), 'moderate')
  })

  it('computes nutrition targets for reference user', () => {
    const targets = computeNutritionTargets(REFERENCE)
    assert.ok(targets)
    assert.equal(targets.tdee, 2800)
    // Macro calories sum to target calories
    const macroCals = targets.protein * 4 + targets.carbs * 4 + targets.fats * 9
    assert.ok(Math.abs(macroCals - targets.calories) <= 15)
  })

  it('adjusts calories within safe bounds', () => {
    assert.equal(calorieAdjustment(2500, 'maintain'), 0)
    assert.equal(calorieAdjustment(2500, 'lose'), -500)
    assert.equal(calorieAdjustment(2500, 'gain'), 300)
    // Deficit cap: cannot exceed 20% of TDEE (1600 * 0.2 = 320)
    assert.equal(calorieAdjustment(1600, 'lose'), -320)
  })

  it('recommends presets according to direction and goal', () => {
    assert.equal(recommendedPresetForGoal('lose', ['lose_weight']), 'high_protein')
    assert.equal(recommendedPresetForGoal('gain', ['gain_muscle']), 'high_protein')
    assert.equal(recommendedPresetForGoal('maintain', ['general_health']), 'recommended')
  })

  it('converts macro percentages to grams and back', () => {
    const proteinG = gramsFromPercent(2000, 30, 4)
    const carbsG = gramsFromPercent(2000, 40, 4)
    const fatG = gramsFromPercent(2000, 30, 9)
    assert.equal(proteinG, 150)
    assert.equal(carbsG, 200)
    assert.equal(fatG, 67)

    assert.equal(percentFromGrams(2000, proteinG, 4), 30)
    assert.equal(percentFromGrams(2000, carbsG, 4), 40)
    assert.equal(percentFromGrams(2000, fatG, 9), 30)

    const split = splitFromGrams(proteinG, carbsG, fatG)
    assert.equal(split.protein, 30)
    assert.equal(split.carbs, 40)
    assert.equal(split.fats, 30)
  })
})
