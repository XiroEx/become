import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FOOD_REVIEW_RULE_VERSION,
  type FoodReviewFlagState,
} from '../../lib/foodReview'
import {
  isProvenAutomaticLegacyFlag,
  planFoodReviewReconciliation,
  type ReviewReconciliationFood,
} from '../../lib/foodReviewReconciliation'

const now = new Date('2026-08-23T12:00:00.000Z')

const cleanFood = {
  slug: 'balanced-food',
  variants: [{
    isDefault: true,
    servingSize: 100,
    servingUnit: 'g',
    nutrition: { calories: 400, protein: 30, carbs: 45, fats: 11.1 },
  }],
}

const emptyFood = {
  slug: 'empty-food',
  variants: [{
    isDefault: true,
    servingSize: 100,
    servingUnit: 'g',
    nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
  }],
}

function automaticFlag(overrides: Partial<FoodReviewFlagState> = {}): FoodReviewFlagState {
  return {
    owner: 'automatic',
    issueCodes: [],
    ruleVersion: FOOD_REVIEW_RULE_VERSION,
    origin: 'rules',
    updatedAt: now,
    ...overrides,
  }
}

test('clears a stale true flag only when automatic rules own it', () => {
  const plan = planFoodReviewReconciliation({
    ...cleanFood,
    needsReview: true,
    reviewFlag: automaticFlag({ issueCodes: ['no_nutrition'] }),
  }, { at: now })

  assert.equal(plan.action, 'clear')
  assert.equal(plan.after?.needsReview, false)
  assert.deepEqual(plan.after?.reviewFlag?.issueCodes, [])
})

test('sets a false automatic flag when live rules find an issue', () => {
  const plan = planFoodReviewReconciliation({
    ...emptyFood,
    needsReview: false,
    reviewFlag: automaticFlag(),
  }, { at: now })

  assert.equal(plan.action, 'set')
  assert.equal(plan.after?.needsReview, true)
  assert.deepEqual(plan.after?.reviewFlag?.issueCodes, ['no_nutrition'])
})

test('refreshes stale automatic evidence without changing the boolean', () => {
  const plan = planFoodReviewReconciliation({
    ...emptyFood,
    needsReview: true,
    reviewFlag: automaticFlag({ issueCodes: ['macros_inconsistent'], ruleVersion: 'old' }),
  }, { at: now })

  assert.equal(plan.action, 'refresh')
  assert.equal(plan.after?.needsReview, true)
  assert.deepEqual(plan.after?.reviewFlag?.issueCodes, ['no_nutrition'])
})

test('preserves an explicit manual false even when live rules would flag it', () => {
  const plan = planFoodReviewReconciliation({
    ...emptyFood,
    needsReview: false,
    reviewFlag: {
      owner: 'manual',
      issueCodes: [],
      ruleVersion: FOOD_REVIEW_RULE_VERSION,
      origin: 'admin',
      updatedAt: now,
    },
  }, { at: now })

  assert.equal(plan.ownership, 'manual')
  assert.equal(plan.action, 'none')
  assert.equal(plan.reason, 'manual-preserved')
  assert.deepEqual(plan.liveIssueCodes, ['no_nutrition'])
})

test('adopts only an untouched legacy true flag as proven automatic', () => {
  const untouched: ReviewReconciliationFood = {
    ...cleanFood,
    needsReview: true,
    createdAt: now,
    updatedAt: now,
  }
  const changedLater: ReviewReconciliationFood = {
    ...untouched,
    updatedAt: new Date(now.getTime() + 1),
  }

  assert.equal(isProvenAutomaticLegacyFlag(untouched), true)
  assert.equal(planFoodReviewReconciliation(untouched, { at: now }).action, 'adopt-proven-auto')
  assert.equal(isProvenAutomaticLegacyFlag(changedLater), false)
  assert.equal(planFoodReviewReconciliation(changedLater, { at: now }).action, 'none')
})

test('a successfully applied automatic target is idempotent on rerun', () => {
  const first = planFoodReviewReconciliation({
    ...emptyFood,
    needsReview: false,
    reviewFlag: automaticFlag(),
  }, { at: now })
  assert.ok(first.after?.reviewFlag)

  const second = planFoodReviewReconciliation({
    ...emptyFood,
    needsReview: first.after!.needsReview,
    reviewFlag: first.after!.reviewFlag,
  }, { at: new Date(now.getTime() + 1000) })

  assert.equal(second.action, 'none')
  assert.equal(second.reason, 'automatic-current')
})

test('macro and slug findings remain evidence-only reconciliation output', () => {
  const plan = planFoodReviewReconciliation({
    slug: 'collision-3',
    variants: [{
      isDefault: true,
      servingSize: 100,
      servingUnit: 'g',
      nutrition: { calories: 400, protein: 0, carbs: 0, fats: 0 },
    }],
    needsReview: false,
    reviewFlag: automaticFlag(),
  }, { at: now })

  assert.equal(plan.action, 'set')
  assert.deepEqual(plan.liveIssueCodes, ['macros_inconsistent', 'slug_collision'])
  assert.deepEqual(Object.keys(plan.after ?? {}).sort(), ['needsReview', 'reviewFlag'])
})
