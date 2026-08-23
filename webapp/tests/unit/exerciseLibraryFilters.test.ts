// Run with: npx tsx --test tests/unit/exerciseLibraryFilters.test.ts
//
// The My Exercises library only ever had a free-text search — no way to sort
// by recency/name, or filter down to a body part or a compound/secondary/
// accessory role. This pins down that GET /api/exercises/custom now returns
// createdAt + role (both needed for the new tabs to mean anything), and that
// the library actually sorts/filters on them rather than just rendering the
// tabs decoratively.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('GET /api/exercises/custom projects createdAt and role — required for "Recent" sort and role filtering', () => {
  const src = readSource('app/api/exercises/custom/route.ts')
  const getFn = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
  assert.match(getFn, /role:\s*1/)
  assert.match(getFn, /createdAt:\s*1/)
})

test('ExerciseLibraryClient sorts by recency (default) and alphabetically', () => {
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(src, /sortMode/)
  assert.match(src, /a\.name\.localeCompare\(b\.name\)/, 'alphabetical sort must exist')
  assert.match(
    src,
    /new Date\(a\.createdAt\)\.getTime\(\)/,
    'recent sort must actually read createdAt, not just claim to be recent-ordered',
  )
})

test('ExerciseLibraryClient filters by body part using the same vocabulary the create form uses', () => {
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(src, /BODY_PART_FILTER_OPTIONS/)
  assert.match(
    src,
    /inferCustomExerciseMuscleGroup\(e\.primaryMuscles\)\s*===\s*bodyPartFilter/,
    'the body-part filter must bucket by the same inference the edit form uses, so a "Back" filter ' +
      'matches exercises stored with primaryMuscles ["lats","upper_back"]',
  )
})

test('ExerciseLibraryClient filters by role (compound/secondary/accessory)', () => {
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(src, /ROLE_FILTER_OPTIONS/)
  assert.match(src, /\(e\.role\s*\?\?\s*["']accessory["']\)\s*===\s*roleFilter/)
})

test('changing a filter or sort resets pagination back to the first page', () => {
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  // Every filter/sort control must pair its own setter with setShown(EXERCISES_PAGE) —
  // otherwise switching filters while scrolled down could show zero rows even
  // when matches exist below the fold.
  const setterCalls = [...src.matchAll(/set(?:SortMode|BodyPartFilter|RoleFilter)\([^)]*\)/g)]
  assert.ok(setterCalls.length >= 3, 'expected sort/filter setters to be wired up')
  for (const call of setterCalls) {
    const idx = call.index ?? 0
    const window = src.slice(idx, idx + 160)
    assert.match(
      window,
      /setShown\(EXERCISES_PAGE\)/,
      `expected a pagination reset near: ${call[0]}`,
    )
  }
})
