// Run with: npx tsx --test tests/unit/exerciseLibraryShowMore.test.ts
//
// The reported bug: "Show more" on the My Exercises library said "Show more
// (N remaining)" but tapping it sometimes collapsed the list back to 5 instead
// of revealing more. Cause: the click handler decided whether to expand or
// collapse by comparing the CURRENT PAGE SIZE (`n > EXERCISES_PAGE`) instead of
// whether every exercise was already showing (`n >= filteredExercises.length`).
// Once `shown` passed 5 (i.e. after the first "show more"), every subsequent
// click reset it back to 5 — even though the button's own label still said
// "Show more (N remaining)", because the label used the correct comparison and
// the click handler did not.
//
// This is a pure reducer extracted from the component's inline handler, tested
// directly rather than through the DOM (no jsdom/testing-library in this repo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

const EXERCISES_PAGE = 5

// Mirrors the onClick handler in ExerciseLibraryClient.tsx exactly.
function nextShown(current: number, total: number): number {
  return current >= total ? EXERCISES_PAGE : Math.min(current + EXERCISES_PAGE, total)
}

test('first click reveals another page, not a collapse', () => {
  // 12 exercises, starting at the first page of 5.
  assert.equal(nextShown(5, 12), 10)
})

test('a second click keeps expanding — this is the regression the old code failed', () => {
  // The bug: with the old `n > EXERCISES_PAGE ? EXERCISES_PAGE : n + EXERCISES_PAGE`
  // handler, shown=10 (already > 5) collapsed straight back to 5 here, even
  // though the button still read "Show more (2 remaining)".
  assert.equal(nextShown(10, 12), 12)
})

test('once everything is shown, the next click collapses back to the first page', () => {
  assert.equal(nextShown(12, 12), EXERCISES_PAGE)
})

test('expanding never overshoots the total', () => {
  // A page size that would run past the end (e.g. 9 remaining, page size 5)
  // must land exactly on the total, not 14 items for a 9-item list.
  assert.equal(nextShown(5, 9), 9)
})

test('a list that exactly fits one extra page lands on "all shown", not past it', () => {
  assert.equal(nextShown(5, 10), 10)
})

// ─── The component wires the fixed comparison, not the old one ───────────────

import fs from 'node:fs'
import path from 'node:path'

test('ExerciseLibraryClient: the Show More handler compares against the full list, not the page size', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../app/dashboard/workout/library/ExerciseLibraryClient.tsx'),
    'utf8',
  )
  const handler = src.match(/onClick=\{\(\)\s*=>\s*setShown\(n\s*=>[\s\S]*?\)\}/)
  assert.ok(handler, 'Show More onClick handler not found')
  assert.doesNotMatch(
    handler![0],
    /n\s*>\s*EXERCISES_PAGE/,
    'the collapse condition must not compare against the fixed page size — that is the bug: ' +
      'every click after the first one collapsed back to page 1 instead of expanding',
  )
  assert.match(
    handler![0],
    /n\s*>=\s*filteredExercises\.length/,
    'the collapse condition must compare against the full (filtered) list length',
  )
})
