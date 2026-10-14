import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import {
  REVIEW_ISSUE_CODES,
  FOOD_REVIEW_ORIGINS,
  parseReviewIssueCodes,
  parseReviewOrigins,
  emptyIssueCounts,
  parseFoodReviewFacetResult,
  buildFoodAdminFilter,
  FOOD_REVIEW_FACET_PIPELINE,
} from '../../lib/foodReview'
import { GET, handleAdminFoodsList } from '../../app/api/admin/foods/route'
import Food from '../../models/Food'

describe('Admin Food Review Queue Filters', () => {
  describe('parseReviewIssueCodes', () => {
    test('accepts single valid issue code', () => {
      const res = parseReviewIssueCodes('slug_collision')
      assert.deepEqual(res, { valid: true, codes: ['slug_collision'] })
    })

    test('accepts multiple comma-separated valid issue codes with whitespace', () => {
      const res = parseReviewIssueCodes(' slug_collision , macros_inconsistent , no_nutrition ')
      assert.deepEqual(res, {
        valid: true,
        codes: ['slug_collision', 'macros_inconsistent', 'no_nutrition'],
      })
    })

    test('validates against all REVIEW_ISSUE_CODES', () => {
      for (const code of REVIEW_ISSUE_CODES) {
        const res = parseReviewIssueCodes(code)
        assert.equal(res.valid, true)
      }
    })

    test('rejects unknown issue code with 400 error details', () => {
      const res = parseReviewIssueCodes('unknown_code')
      assert.deepEqual(res, { valid: false, invalid: 'unknown_code' })
    })

    test('rejects comma-separated list if any issue code is unknown', () => {
      const res = parseReviewIssueCodes('slug_collision,not_a_real_code')
      assert.deepEqual(res, { valid: false, invalid: 'not_a_real_code' })
    })
  })

  describe('parseReviewOrigins', () => {
    test('accepts single valid origin', () => {
      const res = parseReviewOrigins('rules')
      assert.deepEqual(res, { valid: true, origins: ['rules'] })
    })

    test('accepts multiple comma-separated valid origins', () => {
      const res = parseReviewOrigins('rules, import, legacy-created-flag')
      assert.deepEqual(res, {
        valid: true,
        origins: ['rules', 'import', 'legacy-created-flag'],
      })
    })

    test('validates all origins in FOOD_REVIEW_ORIGINS', () => {
      for (const origin of FOOD_REVIEW_ORIGINS) {
        const res = parseReviewOrigins(origin)
        assert.equal(res.valid, true)
      }
    })

    test('rejects unknown origin', () => {
      const res = parseReviewOrigins('invalid_origin')
      assert.deepEqual(res, { valid: false, invalid: 'invalid_origin' })
    })

    test('rejects if any origin in list is unknown', () => {
      const res = parseReviewOrigins('rules,unknown_origin')
      assert.deepEqual(res, { valid: false, invalid: 'unknown_origin' })
    })
  })

  describe('buildFoodAdminFilter', () => {
    test('returns empty object when no filters provided', () => {
      const filter = buildFoodAdminFilter({})
      assert.deepEqual(filter, {})
    })

    test('builds flagged filter', () => {
      const filter = buildFoodAdminFilter({ flagged: true })
      assert.deepEqual(filter, { needsReview: true })
    })

    test('builds single issue filter', () => {
      const filter = buildFoodAdminFilter({ issues: ['slug_collision'] })
      assert.deepEqual(filter, { 'reviewFlag.issueCodes': 'slug_collision' })
    })

    test('builds multi-issue filter with $in', () => {
      const filter = buildFoodAdminFilter({
        issues: ['slug_collision', 'macros_inconsistent'],
      })
      assert.deepEqual(filter, {
        'reviewFlag.issueCodes': { $in: ['slug_collision', 'macros_inconsistent'] },
      })
    })

    test('combines flagged and issue filter with $and', () => {
      const filter = buildFoodAdminFilter({
        flagged: true,
        issues: ['macros_inconsistent'],
      })
      assert.deepEqual(filter, {
        $and: [
          { needsReview: true },
          { 'reviewFlag.issueCodes': 'macros_inconsistent' },
        ],
      })
    })

    test('builds non-legacy origin filter', () => {
      const filter = buildFoodAdminFilter({ origins: ['rules'] })
      assert.deepEqual(filter, { 'reviewFlag.origin': 'rules' })
    })

    test('builds multi-origin filter without legacy', () => {
      const filter = buildFoodAdminFilter({ origins: ['rules', 'import'] })
      assert.deepEqual(filter, { 'reviewFlag.origin': { $in: ['rules', 'import'] } })
    })

    test('builds legacy origin filter covering legacy-created-flag and missing provenance', () => {
      const filter = buildFoodAdminFilter({ origins: ['legacy-created-flag'] })
      assert.deepEqual(filter, {
        $or: [
          { 'reviewFlag.origin': 'legacy-created-flag' },
          { 'reviewFlag.origin': { $exists: false } },
          { reviewFlag: { $exists: false } },
          { reviewFlag: null },
          { 'reviewFlag.origin': null },
        ],
      })
    })

    test('builds legacy-exclusion filter excluding legacy and unprovenanced rows', () => {
      const filter = buildFoodAdminFilter({
        flagged: true,
        excludeLegacy: true,
      })
      assert.deepEqual(filter, {
        $and: [
          { needsReview: true },
          { 'reviewFlag.origin': { $in: ['import', 'rules', 'admin', 'reconcile'] } },
        ],
      })
    })

    test('combines q search, source, flagged, issue, and legacy-exclusion in $and without collision', () => {
      const filter = buildFoodAdminFilter({
        q: 'apple',
        source: 'usda',
        flagged: true,
        issues: ['calories_out_of_range'],
        excludeLegacy: true,
      })
      const andArr = filter.$and as Array<Record<string, unknown>>
      assert.ok(Array.isArray(andArr))
      assert.equal(andArr.length, 5)
      assert.deepEqual(andArr[0], { needsReview: true })
      assert.deepEqual(andArr[1], { source: 'usda' })
      assert.ok('$or' in andArr[2])
      assert.deepEqual(andArr[3], { 'reviewFlag.issueCodes': 'calories_out_of_range' })
      assert.deepEqual(andArr[4], {
        'reviewFlag.origin': { $in: ['import', 'rules', 'admin', 'reconcile'] },
      })
    })
  })

  describe('Facet aggregation and counts parsing', () => {
    test('FOOD_REVIEW_FACET_PIPELINE matches needsReview: true and facets into total, byIssue, legacy', () => {
      assert.equal(FOOD_REVIEW_FACET_PIPELINE.length, 2)
      assert.deepEqual(FOOD_REVIEW_FACET_PIPELINE[0], { $match: { needsReview: true } })
      const facetStage = (FOOD_REVIEW_FACET_PIPELINE[1] as { $facet: Record<string, unknown> }).$facet
      assert.ok(facetStage.total)
      assert.ok(facetStage.byIssue)
      assert.ok(facetStage.legacy)
    })

    test('emptyIssueCounts initializes all 6 issue codes to 0', () => {
      const counts = emptyIssueCounts()
      for (const code of REVIEW_ISSUE_CODES) {
        assert.equal(counts[code], 0)
      }
      assert.equal(Object.keys(counts).length, 6)
    })

    test('parseFoodReviewFacetResult parses empty aggregation result to zeroes', () => {
      const parsed = parseFoodReviewFacetResult(undefined)
      assert.equal(parsed.flaggedCount, 0)
      assert.equal(parsed.legacyCount, 0)
      assert.equal(parsed.legacyFlaggedCount, 0)
      for (const code of REVIEW_ISSUE_CODES) {
        assert.equal(parsed.issueCounts[code], 0)
      }
    })

    test('parseFoodReviewFacetResult reproduces snapshot with real numbers instead of 999+', () => {
      // Library snapshot (prod, 2026-09-21):
      // needsReview 1,043 — 663 automatic (335 macros, 327 slug collisions, 12 no nutrition, 2 calories)
      // and 380 legacy rows with no provenance.
      const mockFacet = {
        total: [{ count: 1043 }],
        byIssue: [
          { _id: 'macros_inconsistent', count: 335 },
          { _id: 'slug_collision', count: 327 },
          { _id: 'no_nutrition', count: 12 },
          { _id: 'calories_out_of_range', count: 2 },
        ],
        legacy: [{ count: 380 }],
      }

      const parsed = parseFoodReviewFacetResult(mockFacet)
      assert.equal(parsed.flaggedCount, 1043)
      assert.equal(parsed.legacyCount, 380)
      assert.equal(parsed.legacyFlaggedCount, 380)
      assert.equal(parsed.issueCounts.macros_inconsistent, 335)
      assert.equal(parsed.issueCounts.slug_collision, 327)
      assert.equal(parsed.issueCounts.no_nutrition, 12)
      assert.equal(parsed.issueCounts.calories_out_of_range, 2)
      assert.equal(parsed.issueCounts.negative_nutrition, 0)
      assert.equal(parsed.issueCounts.bridge_conflict, 0)
    })
  })

  describe('GET /api/admin/foods HTTP endpoint', () => {
    test('returns 401 when unauthenticated', async () => {
      const req = new NextRequest('http://localhost/api/admin/foods')
      const res = await GET(req)
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'Unauthorized')
    })

    test('returns 400 for unknown issue code', async () => {
      const req = new NextRequest('http://localhost/api/admin/foods?issue=bogus_issue')
      const res = await handleAdminFoodsList(req, { skipAuth: true })
      assert.equal(res.status, 400)
      const json = await res.json()
      assert.ok(json.error.includes('Invalid issue code'))
    })

    test('returns 400 for unknown origin', async () => {
      const req = new NextRequest('http://localhost/api/admin/foods?origin=bogus_origin')
      const res = await handleAdminFoodsList(req, { skipAuth: true })
      assert.equal(res.status, 400)
      const json = await res.json()
      assert.ok(json.error.includes('Invalid origin'))
    })

    test('accepts valid issue, origin, and excludeLegacy parameters returning counts', async () => {
      const origFind = Food.find
      const origCount = Food.countDocuments
      const origAggregate = Food.aggregate

      let capturedFilter: unknown = null

      ;(Food.find as unknown) = (filter: unknown) => {
        capturedFilter = filter
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [],
              }),
            }),
          }),
        }
      }
      ;(Food.countDocuments as unknown) = async () => 42
      ;(Food.aggregate as unknown) = async () => [
        {
          total: [{ count: 1043 }],
          byIssue: [{ _id: 'slug_collision', count: 327 }],
          legacy: [{ count: 380 }],
        },
      ]

      try {
        const req = new NextRequest(
          'http://localhost/api/admin/foods?flagged=1&issue=slug_collision&origin=rules&excludeLegacy=1',
        )
        const res = await handleAdminFoodsList(req, { skipAuth: true })
        assert.equal(res.status, 200)
        const json = await res.json()

        assert.equal(json.total, 42)
        assert.equal(json.flaggedCount, 1043)
        assert.equal(json.legacyCount, 380)
        assert.equal(json.legacyFlaggedCount, 380)
        assert.equal(json.issueCounts.slug_collision, 327)
        assert.equal(json.issueCounts.macros_inconsistent, 0)

        // Verify filter was composed properly
        const andFilter = (capturedFilter as { $and: unknown[] }).$and
        assert.ok(Array.isArray(andFilter))
        assert.deepEqual(andFilter[0], { needsReview: true })
        assert.deepEqual(andFilter[1], { 'reviewFlag.issueCodes': 'slug_collision' })
        assert.deepEqual(andFilter[2], { 'reviewFlag.origin': 'rules' })
        assert.deepEqual(andFilter[3], {
          'reviewFlag.origin': { $in: ['import', 'rules', 'admin', 'reconcile'] },
        })
      } finally {
        Food.find = origFind
        Food.countDocuments = origCount
        Food.aggregate = origAggregate
      }
    })
  })
})
