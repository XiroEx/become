// Run with: npm run test:file tests/unit/browseProgramsCount.test.ts
//
// NP-378: the "Browse Programs" heading on web read "(7)" while the list
// underneath rendered only 6 cards — the same 6 the native catalog's heading
// correctly counts as "(6)".
//
// Root cause: the heading rendered `totalPrograms`, which is set straight
// from `/api/programs/search`'s `pagination.total` — the raw count of
// programs matching the search query, with no idea which of those the
// member is already enrolled in or has already saved. The list underneath,
// `filteredPrograms`, excludes exactly those enrolled/saved programs before
// rendering. One program on the demo account was already enrolled, so the
// heading (unfiltered total) read one higher than the list (filtered).
//
// The fix subtracts the enrolled/saved overlap from the heading count too,
// the same approach the native catalog (expo/components/programs/
// ProgramsCatalog.tsx) already uses for its own "(N)" heading per NP-278.
//
// These are source/behaviour scans: WorkoutClient.tsx fetches from
// localStorage + several API routes on mount, which this suite does not
// stand up, and the regression is precisely identifiable in the source and
// in the arithmetic it performs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const WORKOUT_CLIENT = 'app/dashboard/workout/WorkoutClient.tsx'

/** Strip // and /* *\/ comments so scans read code, not prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('WorkoutClient computes filteredPrograms by excluding enrolled + saved programs from allPrograms', () => {
  const code = stripComments(readSource(WORKOUT_CLIENT))
  assert.match(
    code,
    /const filteredPrograms = allPrograms\.filter\(/,
    'expected the rendered list to stay derived from allPrograms.filter(...)',
  )
})

test('WorkoutClient "Browse Programs" heading does not render the raw server total', () => {
  const code = stripComments(readSource(WORKOUT_CLIENT))

  // Regression guard: the heading used to interpolate `totalPrograms`
  // (the unfiltered server count) directly. It must not do that again.
  assert.doesNotMatch(
    code,
    /Browse Programs[\s\S]{0,200}\(\{totalPrograms\}\)/,
    'the heading must not render the raw, unfiltered server total again (NP-378)',
  )
})

test('WorkoutClient "Browse Programs" heading renders a count adjusted for the enrolled/saved overlap', () => {
  const code = stripComments(readSource(WORKOUT_CLIENT))

  assert.match(
    code,
    /const excludedFromBrowseCount = allPrograms\.length - filteredPrograms\.length;/,
    'expected the overlap between the raw total and the rendered list to be computed from the loaded page',
  )
  assert.match(
    code,
    /const displayTotalPrograms = Math\.max\(totalPrograms - excludedFromBrowseCount, 0\);/,
    'expected the heading count to subtract the enrolled/saved overlap from the raw server total',
  )
  assert.match(
    code,
    /Browse Programs[\s\S]{0,200}\(\{displayTotalPrograms\}\)/,
    'expected the heading to render the adjusted count, not the raw server total',
  )
})

/**
 * Re-derive the heading arithmetic in isolation (mirrors the component's
 * `excludedFromBrowseCount` / `displayTotalPrograms` formulas) and pin the
 * exact demo-account scenario from the bug report: a server total of 7
 * search matches, one of which is already enrolled, so the rendered list —
 * and the heading — must both read 6.
 */
function displayTotal(totalFromServer: number, loadedPrograms: string[], excludedIds: Set<string>): number {
  const filtered = loadedPrograms.filter((id) => !excludedIds.has(id))
  const excludedFromBrowseCount = loadedPrograms.length - filtered.length
  return Math.max(totalFromServer - excludedFromBrowseCount, 0)
}

test('heading count matches the rendered list when one matched program is already enrolled', () => {
  const loaded = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
  const enrolled = new Set(['p7'])

  const count = displayTotal(7, loaded, enrolled)
  const rendered = loaded.filter((id) => !enrolled.has(id))

  assert.equal(count, 6, 'heading must read 6, matching native and the rendered list')
  assert.equal(rendered.length, count, 'heading count must equal the number of cards actually rendered')
})

test('heading count matches the rendered list when a program is already saved instead of enrolled', () => {
  const loaded = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']
  const saved = new Set(['p3'])

  const count = displayTotal(7, loaded, saved)
  const rendered = loaded.filter((id) => !saved.has(id))

  assert.equal(count, 6)
  assert.equal(rendered.length, count)
})

test('heading count is unaffected when nothing loaded is enrolled or saved', () => {
  const loaded = ['p1', 'p2', 'p3']
  const count = displayTotal(3, loaded, new Set())
  assert.equal(count, 3)
  assert.equal(count, loaded.length)
})

test('heading count never goes negative', () => {
  const loaded = ['p1', 'p2']
  const excluded = new Set(['p1', 'p2'])
  const count = displayTotal(0, loaded, excluded)
  assert.equal(count, 0)
})
