import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import {
  validateAdminFoodQueryParams,
  buildAdminFoodsFilter,
  buildAdminFoodsReviewFacet,
  parseAdminFoodsReviewFacetResult,
  handleAdminFoodsList,
  REVIEW_ISSUE_CODES,
  FOOD_REVIEW_ORIGINS,
} from '../../lib/adminFoods'

test('REVIEW_ISSUE_CODES contains the 6 required issue codes', () => {
  assert.equal(REVIEW_ISSUE_CODES.length, 6)
  assert.ok(REVIEW_ISSUE_CODES.includes('slug_collision'))
  assert.ok(REVIEW_ISSUE_CODES.includes('calories_out_of_range'))
  assert.ok(REVIEW_ISSUE_CODES.includes('negative_nutrition'))
  assert.ok(REVIEW_ISSUE_CODES.includes('macros_inconsistent'))
  assert.ok(REVIEW_ISSUE_CODES.includes('no_nutrition'))
  assert.ok(REVIEW_ISSUE_CODES.includes('bridge_conflict'))
})

test('FOOD_REVIEW_ORIGINS contains all required origins including legacy-created-flag', () => {
  assert.ok(FOOD_REVIEW_ORIGINS.includes('import'))
  assert.ok(FOOD_REVIEW_ORIGINS.includes('rules'))
  assert.ok(FOOD_REVIEW_ORIGINS.includes('admin'))
  assert.ok(FOOD_REVIEW_ORIGINS.includes('reconcile'))
  assert.ok(FOOD_REVIEW_ORIGINS.includes('legacy-created-flag'))
})

test('validateAdminFoodQueryParams accepts single valid issue code', () => {
  const params = new URLSearchParams('issue=slug_collision')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, true)
  assert.deepEqual(result.issues, ['slug_collision'])
})

test('validateAdminFoodQueryParams accepts multiple comma-separated issue codes', () => {
  const params = new URLSearchParams('issue=slug_collision,macros_inconsistent,no_nutrition')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, true)
  assert.deepEqual(result.issues, ['slug_collision', 'macros_inconsistent', 'no_nutrition'])
})

test('validateAdminFoodQueryParams accepts multiple issue query parameters', () => {
  const params = new URLSearchParams('issue=slug_collision&issue=calories_out_of_range')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, true)
  assert.deepEqual(result.issues, ['slug_collision', 'calories_out_of_range'])
})

test('validateAdminFoodQueryParams rejects unknown issue code with 400-ready error', () => {
  const params = new URLSearchParams('issue=invalid_code')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, false)
  assert.match(result.error ?? '', /Unknown issue code: "invalid_code"/)
})

test('validateAdminFoodQueryParams rejects when one issue code among valid ones is invalid', () => {
  const params = new URLSearchParams('issue=slug_collision,unknown_problem,macros_inconsistent')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, false)
  assert.match(result.error ?? '', /Unknown issue code: "unknown_problem"/)
})

test('validateAdminFoodQueryParams ignores empty issue parameter', () => {
  const params = new URLSearchParams('issue=')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, true)
  assert.deepEqual(result.issues, [])
})

test('validateAdminFoodQueryParams accepts valid origin', () => {
  for (const origin of FOOD_REVIEW_ORIGINS) {
    const params = new URLSearchParams(`origin=${origin}`)
    const result = validateAdminFoodQueryParams(params)
    assert.equal(result.valid, true, `Origin "${origin}" should be valid`)
    assert.deepEqual(result.origins, [origin])
  }
})

test('validateAdminFoodQueryParams accepts multiple comma-separated origins', () => {
  const params = new URLSearchParams('origin=rules,import,legacy-created-flag')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, true)
  assert.deepEqual(result.origins, ['rules', 'import', 'legacy-created-flag'])
})

test('validateAdminFoodQueryParams accepts multiple origin query parameters', () => {
  const params = new URLSearchParams('origin=rules&origin=reconcile')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, true)
  assert.deepEqual(result.origins, ['rules', 'reconcile'])
})

test('validateAdminFoodQueryParams rejects unknown origin', () => {
  const params = new URLSearchParams('origin=user_reported')
  const result = validateAdminFoodQueryParams(params)
  assert.equal(result.valid, false)
  assert.match(result.error ?? '', /Unknown origin: "user_reported"/)
})

test('validateAdminFoodQueryParams parses excludeLegacy parameter', () => {
  assert.equal(validateAdminFoodQueryParams(new URLSearchParams('excludeLegacy=1')).excludeLegacy, true)
  assert.equal(validateAdminFoodQueryParams(new URLSearchParams('excludeLegacy=true')).excludeLegacy, true)
  assert.equal(validateAdminFoodQueryParams(new URLSearchParams('exclude_legacy=1')).excludeLegacy, true)
  assert.equal(validateAdminFoodQueryParams(new URLSearchParams('exclude_legacy=true')).excludeLegacy, true)
  assert.equal(validateAdminFoodQueryParams(new URLSearchParams('excludeLegacy=0')).excludeLegacy, false)
  assert.equal(validateAdminFoodQueryParams(new URLSearchParams('')).excludeLegacy, false)
})

test('buildAdminFoodsFilter creates base flagged filter', () => {
  const filter = buildAdminFoodsFilter({ flagged: true })
  assert.equal(filter.needsReview, true)
})

test('buildAdminFoodsFilter combines flagged with single issue', () => {
  const filter = buildAdminFoodsFilter({
    flagged: true,
    issues: ['slug_collision'],
  })
  assert.equal(filter.needsReview, true)
  assert.equal(filter['reviewFlag.issueCodes'], 'slug_collision')
})

test('buildAdminFoodsFilter combines flagged with multiple issues using $in', () => {
  const filter = buildAdminFoodsFilter({
    flagged: true,
    issues: ['slug_collision', 'macros_inconsistent'],
  })
  assert.equal(filter.needsReview, true)
  assert.deepEqual(filter['reviewFlag.issueCodes'], {
    $in: ['slug_collision', 'macros_inconsistent'],
  })
})

test('buildAdminFoodsFilter handles standard origin', () => {
  const filter = buildAdminFoodsFilter({
    flagged: true,
    origins: ['rules'],
  })
  assert.equal(filter.needsReview, true)
  assert.equal(filter['reviewFlag.origin'], 'rules')
})

test('buildAdminFoodsFilter handles legacy-created-flag origin including null reviewFlag', () => {
  const filter = buildAdminFoodsFilter({
    flagged: true,
    origins: ['legacy-created-flag'],
  })
  assert.equal(filter.needsReview, true)
  assert.deepEqual(filter.$or, [
    { 'reviewFlag.origin': { $in: ['legacy-created-flag'] } },
    { reviewFlag: null },
  ])
})

test('buildAdminFoodsFilter handles excludeLegacy filter', () => {
  const filter = buildAdminFoodsFilter({
    flagged: true,
    excludeLegacy: true,
  })
  assert.equal(filter.needsReview, true)
  assert.deepEqual(filter['reviewFlag'], { $ne: null })
  assert.deepEqual(filter['reviewFlag.origin'], { $ne: 'legacy-created-flag' })
  assert.deepEqual(filter['reviewFlag.issueCodes.0'], { $exists: true })
})

test('buildAdminFoodsFilter combines search query, source, issue, and excludeLegacy', () => {
  const filter = buildAdminFoodsFilter({
    flagged: true,
    source: 'manual',
    q: 'oatmeal',
    issues: ['macros_inconsistent'],
    excludeLegacy: true,
  })
  assert.equal(filter.needsReview, true)
  assert.equal(filter.source, 'manual')
  assert.equal(filter['reviewFlag.issueCodes'], 'macros_inconsistent')
  assert.deepEqual(filter['reviewFlag'], { $ne: null })
  assert.deepEqual(filter['reviewFlag.origin'], { $ne: 'legacy-created-flag' })
  assert.deepEqual(filter['reviewFlag.issueCodes.0'], { $exists: true })
  assert.ok(Array.isArray(filter.$or))
})

test('buildAdminFoodsFilter handles multiple $or clauses with $and', () => {
  const filter = buildAdminFoodsFilter({
    q: 'milk',
    origins: ['legacy-created-flag'],
  })
  assert.ok(Array.isArray(filter.$and))
  assert.equal(filter.$and.length, 2)
})

test('buildAdminFoodsReviewFacet produces branches for total, legacy, and all issue codes', () => {
  const facet = buildAdminFoodsReviewFacet()
  assert.ok(facet.total)
  assert.ok(facet.legacy)
  for (const code of REVIEW_ISSUE_CODES) {
    assert.ok(facet[code], `Facet branch for ${code} must exist`)
    assert.deepEqual(facet[code], [
      { $match: { 'reviewFlag.issueCodes': code } },
      { $count: 'count' },
    ])
  }
})

test('parseAdminFoodsReviewFacetResult parses aggregation stats correctly', () => {
  const stats = {
    total: [{ count: 1043 }],
    legacy: [{ count: 380 }],
    slug_collision: [{ count: 327 }],
    calories_out_of_range: [{ count: 2 }],
    negative_nutrition: [{ count: 0 }],
    macros_inconsistent: [{ count: 335 }],
    no_nutrition: [{ count: 12 }],
    bridge_conflict: [{ count: 0 }],
  }

  const parsed = parseAdminFoodsReviewFacetResult(stats)
  assert.equal(parsed.flaggedCount, 1043)
  assert.equal(parsed.legacyCount, 380)
  assert.equal(parsed.issueCounts.slug_collision, 327)
  assert.equal(parsed.issueCounts.calories_out_of_range, 2)
  assert.equal(parsed.issueCounts.negative_nutrition, 0)
  assert.equal(parsed.issueCounts.macros_inconsistent, 335)
  assert.equal(parsed.issueCounts.no_nutrition, 12)
  assert.equal(parsed.issueCounts.bridge_conflict, 0)
})

test('parseAdminFoodsReviewFacetResult defaults missing counts to 0', () => {
  const parsed = parseAdminFoodsReviewFacetResult(undefined)
  assert.equal(parsed.flaggedCount, 0)
  assert.equal(parsed.legacyCount, 0)
  for (const code of REVIEW_ISSUE_CODES) {
    assert.equal(parsed.issueCounts[code], 0)
  }
})

test('handleAdminFoodsList rejects unknown issue code with 400', async () => {
  const req = new NextRequest('http://localhost/api/admin/foods?issue=nonexistent_issue')
  const res = await handleAdminFoodsList(req)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /Unknown issue code: "nonexistent_issue"/)
})

test('handleAdminFoodsList rejects unknown origin with 400', async () => {
  const req = new NextRequest('http://localhost/api/admin/foods?origin=invalid_origin')
  const res = await handleAdminFoodsList(req)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /Unknown origin: "invalid_origin"/)
})

test('handleAdminFoodsList rejects unknown code among comma-separated issues with 400', async () => {
  const req = new NextRequest('http://localhost/api/admin/foods?issue=slug_collision,bad_code')
  const res = await handleAdminFoodsList(req)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /Unknown issue code: "bad_code"/)
})

test('admin foods page source declares issue chips and legacy exclusion', () => {
  const pageSrc = readFileSync(
    join(process.cwd(), 'app/dashboard/admin/foods/page.tsx'),
    'utf8',
  )
  assert.match(pageSrc, /REVIEW_ISSUE_CODES\.map/, 'must render a chip per issue code')
  assert.match(pageSrc, /Exclude Legacy/, 'must include an exclude legacy toggle button')
  assert.match(pageSrc, /issueCounts/, 'must track and display per-issue counts')
  assert.match(pageSrc, /legacyCount/, 'must track and display legacy count')
  assert.match(pageSrc, /params\.set\('issue',/, 'issue chip must drive the query')
  assert.match(pageSrc, /params\.set\('excludeLegacy',/, 'exclude legacy must drive the query')
})

test('admin foods route only exports GET to satisfy Next.js route typecheck', () => {
  const routeSrc = readFileSync(
    join(process.cwd(), 'app/api/admin/foods/route.ts'),
    'utf8',
  )
  assert.match(routeSrc, /export async function GET/, 'must export GET')
  assert.doesNotMatch(
    routeSrc,
    /export (async function|function|const|let|var) handleAdminFoodsList/,
    'must not export handleAdminFoodsList from route.ts',
  )
})
