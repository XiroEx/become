// Run with: npm run test:file tests/unit/exerciseVisibility.test.ts
//
// Before this, GET /api/exercises/alternatives (the "Swap Exercise" modal's
// candidate list) loaded every isActive exercise with NO isCustom filter at
// all — so any user's private custom exercise already showed up as a swap
// suggestion for every other user, regardless of who made it. That's the
// opposite of what "Submit to Universal, admin-approved" is supposed to mean:
// a custom exercise should be invisible to everyone but its owner until an
// admin explicitly approves it. This pins down the shared filter that closes
// that gap: catalog exercises are always visible, a user's own customs are
// always visible to them, and any OTHER user's custom exercise is visible
// only once isUniversal is true.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { visibleExerciseFilter } from '../../lib/exerciseVisibility'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// A tiny in-memory matcher for the subset of Mongo query shape this filter
// produces ({ $or: [...] } of plain equality clauses) — enough to prove the
// filter behaves as intended without spinning up Mongo.
function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  const or = filter.$or as Record<string, unknown>[]
  return or.some((clause) =>
    Object.entries(clause).every(([key, expected]) => {
      if (expected && typeof expected === 'object' && '$ne' in (expected as object)) {
        return doc[key] !== (expected as { $ne: unknown }).$ne
      }
      return doc[key] === expected
    }),
  )
}

test('a catalog (non-custom) exercise is visible to anyone, even with no userId', () => {
  const catalogExercise = { isCustom: false }
  assert.ok(matches(catalogExercise, visibleExerciseFilter(null)))
  assert.ok(matches(catalogExercise, visibleExerciseFilter('user-a')))
})

test("a user's own private custom exercise is visible to them", () => {
  const mine = { isCustom: true, createdBy: 'user-a', isUniversal: false }
  assert.ok(matches(mine, visibleExerciseFilter('user-a')))
})

test("another user's private (not-yet-reviewed) custom exercise is NOT visible", () => {
  const someoneElses = { isCustom: true, createdBy: 'user-b', isUniversal: false }
  assert.equal(matches(someoneElses, visibleExerciseFilter('user-a')), false)
  assert.equal(matches(someoneElses, visibleExerciseFilter(null)), false)
})

test('a pending submission from another user is still NOT visible — only approval flips it', () => {
  const pending = { isCustom: true, createdBy: 'user-b', isUniversal: false, reviewStatus: 'pending' }
  assert.equal(matches(pending, visibleExerciseFilter('user-a')), false)
})

test('once isUniversal is true, the exercise is visible to everyone, including anonymous callers', () => {
  const approved = { isCustom: true, createdBy: 'user-b', isUniversal: true }
  assert.ok(matches(approved, visibleExerciseFilter('user-a')))
  assert.ok(matches(approved, visibleExerciseFilter(null)))
})

// ─── The gap this closes: alternatives/route.ts previously had no isCustom
// filter whatsoever ────────────────────────────────────────────────────────

test('GET /api/exercises/alternatives applies visibleExerciseFilter to its candidate pool', () => {
  const src = readSource('app/api/exercises/alternatives/route.ts')
  assert.match(
    src,
    /Exercise\.find\(\{\s*\n?\s*isActive:\s*true,\s*\n?\s*\.\.\.visibleExerciseFilter\(payload\.userId\)/,
    'the alternatives candidate pool must be scoped by visibleExerciseFilter — otherwise every ' +
      "user's private custom exercise leaks into everyone else's swap suggestions",
  )
})

test('GET /api/exercises applies visibleExerciseFilter instead of a blanket isCustom exclusion', () => {
  const src = readSource('app/api/exercises/route.ts')
  assert.match(src, /visibleExerciseFilter\(auth\.userId\)/)
})

test('GET /api/exercises/search applies visibleExerciseFilter', () => {
  const src = readSource('app/api/exercises/search/route.ts')
  assert.match(src, /visibleExerciseFilter\(auth\.userId\)/)
})

test('GET /api/exercises/[slug] allows a non-owner to fetch a universal exercise by slug', () => {
  const src = readSource('app/api/exercises/[slug]/route.ts')
  assert.match(
    src,
    /exercise\.isCustom\s*&&\s*exercise\.createdBy\?\.toString\(\)\s*!==\s*auth\.userId\s*&&\s*!exercise\.isUniversal/,
    'the ownership 404 guard must exempt universal exercises, or a user who added someone else\'s ' +
      "approved custom exercise to their own workout couldn't fetch its detail",
  )
})
