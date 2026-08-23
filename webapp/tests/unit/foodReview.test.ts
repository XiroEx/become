import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReviewIssues, type FoodForReview } from '../../lib/foodReview'

const balancedNutrition = {
  calories: 400,
  protein: 30,
  carbs: 45,
  fats: 11.1,
}

function food(variants: FoodForReview['variants']): FoodForReview {
  return { slug: 'test-food', variants }
}

function codes(input: FoodForReview) {
  return computeReviewIssues(input).map(issue => issue.code)
}

test('reviews the declared default variant instead of whichever variant is first', () => {
  const result = codes(food([
    {
      isDefault: false,
      servingSize: 100,
      servingUnit: 'g',
      nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    },
    {
      isDefault: true,
      servingSize: 100,
      servingUnit: 'g',
      nutrition: balancedNutrition,
    },
  ]))

  assert.ok(!result.includes('no_nutrition'))
})

test('uses a gram bridge for a recipe saved as one serving', () => {
  const result = codes(food([{
    isDefault: true,
    servingSize: 1,
    servingUnit: 'serving',
    gramsPerServing: 50,
    nutrition: balancedNutrition,
  }]))

  // 400 cal / 50 g = 800 cal/100g, not 40,000 cal/100g.
  assert.ok(!result.includes('calories_out_of_range'))
})

test('normalizes ounce and cup storage bases before checking calorie density', () => {
  const ounce = codes(food([{
    isDefault: true,
    servingSize: 1,
    servingUnit: 'oz',
    nutrition: { calories: 200, protein: 20, carbs: 15, fats: 6.7 },
  }]))
  const cup = codes(food([{
    isDefault: true,
    servingSize: 1,
    servingUnit: 'cup',
    nutrition: { calories: 120, protein: 5, carbs: 20, fats: 2.2 },
  }]))

  assert.ok(!ounce.includes('calories_out_of_range'))
  assert.ok(!cup.includes('calories_out_of_range'))
})

test('skips density checks for discrete servings with no mass or volume bridge', () => {
  const result = codes(food([{
    isDefault: true,
    servingSize: 1,
    servingUnit: 'each',
    nutrition: balancedNutrition,
  }]))

  assert.ok(!result.includes('calories_out_of_range'))
})

test('still flags a genuinely impossible calorie density through a bridge', () => {
  const issues = computeReviewIssues(food([{
    isDefault: true,
    servingSize: 1,
    servingUnit: 'serving',
    gramsPerServing: 25,
    nutrition: balancedNutrition,
  }]))

  const issue = issues.find(candidate => candidate.code === 'calories_out_of_range')
  assert.equal(issue?.message, 'Calories per 100g = 1600, above 1000 threshold')
})
