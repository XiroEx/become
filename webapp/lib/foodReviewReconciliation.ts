import {
  computeAutomaticReviewState,
  type FoodForReview,
  type FoodReviewFlagState,
  type ReviewIssueCode,
} from './foodReview'

export type ReviewOwnership = 'automatic' | 'manual' | 'legacy'
export type ReviewReconciliationAction =
  | 'none'
  | 'set'
  | 'clear'
  | 'refresh'
  | 'adopt-proven-auto'

export interface ReviewReconciliationFood extends FoodForReview {
  _id?: unknown
  needsReview?: boolean
  reviewFlag?: FoodReviewFlagState
  createdAt?: Date
  updatedAt?: Date
}

export interface ReviewStateSnapshot {
  needsReview: boolean
  reviewFlag?: FoodReviewFlagState
}

export interface ReviewReconciliationPlan {
  ownership: ReviewOwnership
  action: ReviewReconciliationAction
  reason:
    | 'automatic-current'
    | 'automatic-state-changed'
    | 'automatic-evidence-changed'
    | 'manual-preserved'
    | 'legacy-preserved'
    | 'legacy-created-flag-proven'
  liveIssueCodes: ReviewIssueCode[]
  before: ReviewStateSnapshot
  after?: ReviewStateSnapshot
}

function sameCodes(a: readonly ReviewIssueCode[], b: readonly ReviewIssueCode[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((code, index) => code === right[index])
}

function sameInstant(a: Date | undefined, b: Date | undefined): boolean {
  if (!(a instanceof Date) || !(b instanceof Date)) return false
  return Number.isFinite(a.getTime()) && a.getTime() === b.getTime()
}

/**
 * The only legacy ownership inference we permit: a stored true flag whose
 * document has never been updated since creation. The create APIs did not
 * accept a caller-supplied review flag; they derived it from the rules. A
 * later admin decision necessarily changes updatedAt.
 */
export function isProvenAutomaticLegacyFlag(food: ReviewReconciliationFood): boolean {
  return food.needsReview === true
    && food.reviewFlag == null
    && sameInstant(food.createdAt, food.updatedAt)
}

/**
 * Produce a write-free, deterministic plan for one Food. The plan never
 * proposes nutrition edits, slug rewrites, merges, or deletes: macro and slug
 * findings remain evidence attached to the review flag only.
 */
export function planFoodReviewReconciliation(
  food: ReviewReconciliationFood,
  options: { at?: Date } = {},
): ReviewReconciliationPlan {
  const at = options.at ?? new Date()
  const automatic = computeAutomaticReviewState(food, { at, origin: 'reconcile' })
  const before: ReviewStateSnapshot = {
    needsReview: food.needsReview === true,
    ...(food.reviewFlag ? { reviewFlag: food.reviewFlag } : {}),
  }
  const liveIssueCodes = automatic.reviewFlag.issueCodes

  if (food.reviewFlag?.owner === 'manual') {
    return {
      ownership: 'manual',
      action: 'none',
      reason: 'manual-preserved',
      liveIssueCodes,
      before,
    }
  }

  if (food.reviewFlag?.owner !== 'automatic') {
    if (isProvenAutomaticLegacyFlag(food)) {
      return {
        ownership: 'legacy',
        action: 'adopt-proven-auto',
        reason: 'legacy-created-flag-proven',
        liveIssueCodes,
        before,
        // Adoption records ownership only. It deliberately leaves the stored
        // boolean unchanged; a later normal apply can reconcile it once the
        // row is unambiguously automatic-owned.
        after: {
          needsReview: true,
          reviewFlag: {
            ...automatic.reviewFlag,
            origin: 'legacy-created-flag',
          },
        },
      }
    }
    return {
      ownership: 'legacy',
      action: 'none',
      reason: 'legacy-preserved',
      liveIssueCodes,
      before,
    }
  }

  const storedCodes = food.reviewFlag.issueCodes ?? []
  const stateChanged = before.needsReview !== automatic.needsReview
  const evidenceChanged = food.reviewFlag.ruleVersion !== automatic.reviewFlag.ruleVersion
    || !sameCodes(storedCodes, liveIssueCodes)

  if (!stateChanged && !evidenceChanged) {
    return {
      ownership: 'automatic',
      action: 'none',
      reason: 'automatic-current',
      liveIssueCodes,
      before,
    }
  }

  return {
    ownership: 'automatic',
    action: stateChanged
      ? (automatic.needsReview ? 'set' : 'clear')
      : 'refresh',
    reason: stateChanged ? 'automatic-state-changed' : 'automatic-evidence-changed',
    liveIssueCodes,
    before,
    after: {
      needsReview: automatic.needsReview,
      reviewFlag: automatic.reviewFlag,
    },
  }
}
