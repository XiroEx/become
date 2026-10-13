// Run with: npm run test:file tests/unit/browseProgramsCount.test.ts
//
// NP-378: the "Browse Programs (N)" heading on web rendered
// /api/programs/search's raw pagination total, while the cards below
// (`filteredPrograms`) hide programs the member is already enrolled in or
// has already saved. On the demo account one of the matched programs was
// already enrolled, so the heading said "(7)" over 6 rendered cards, while
// native (which already applies the equivalent NP-278 fix in
// ProgramsCatalog.tsx) said "(6)".
//
// No jsdom/testing-library in this repo (see weightLogSheet.test.tsx), so
// this follows the same source-scan convention as
// quickSession/favorite-session-ui.test.ts, plus plain arithmetic tests
// pinning the exact fix formula.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..', '..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const WORKOUT_CLIENT = 'app/dashboard/workout/WorkoutClient.tsx'

test('WorkoutClient derives a display count that subtracts what filteredPrograms hides from the raw search total', () => {
  const src = readSource(WORKOUT_CLIENT)

  assert.match(
    src,
    /const excludedFromBrowseCount = allPrograms\.length - filteredPrograms\.length;/,
    'excludedFromBrowseCount must be the gap between the raw page and what Browse actually renders',
  )
  assert.match(
    src,
    /const displayTotalPrograms = Math\.max\(totalPrograms - excludedFromBrowseCount, 0\);/,
    'displayTotalPrograms must subtract the excluded count from the raw pagination total, never going negative',
  )
})

test('the Browse Programs heading renders displayTotalPrograms, not the raw totalPrograms', () => {
  const src = readSource(WORKOUT_CLIENT)
  const sectionStart = src.indexOf('id="browse-programs"')
  assert.ok(sectionStart !== -1, 'could not locate the Browse Programs section')
  const heading = src.slice(sectionStart, sectionStart + 400)

  assert.match(
    heading,
    /\{displayTotalPrograms > 0 && \(/,
    'heading count span must be gated on displayTotalPrograms',
  )
  assert.match(
    heading,
    /\(\{displayTotalPrograms\}\)/,
    'heading must print displayTotalPrograms, not the unfiltered totalPrograms',
  )
  assert.doesNotMatch(
    heading,
    /\(\{totalPrograms\}\)/,
    'the raw, unfiltered totalPrograms must not be printed directly in the heading again',
  )
})

test('filteredPrograms still excludes enrolled and saved programs (the thing displayTotalPrograms must mirror)', () => {
  const src = readSource(WORKOUT_CLIENT)
  const start = src.indexOf('const filteredPrograms = allPrograms.filter(')
  assert.ok(start !== -1, 'could not locate filteredPrograms')
  const fn = src.slice(start, start + 400)

  assert.match(fn, /!activePrograms\.some\(\(ap\) => ap\.programId === program\.program_id\)/)
  assert.match(fn, /!savedProgramIds\.has\(program\.program_id\)/)
})

// ── Arithmetic: the exact fixed formula, pinned independent of the source ──

function displayTotal(totalPrograms: number, allProgramsLength: number, filteredProgramsLength: number): number {
  const excludedFromBrowseCount = allProgramsLength - filteredProgramsLength
  return Math.max(totalPrograms - excludedFromBrowseCount, 0)
}

test('the reported scenario: 7 matches, 1 already enrolled on this page -> heading says 6, matching the 6 rendered cards', () => {
  // /api/programs/search matched 7 programs total; the member is already
  // enrolled in 1 of the 7 returned on this page, so filteredPrograms has 6.
  const totalPrograms = 7
  const allProgramsLength = 7
  const filteredProgramsLength = 6

  assert.equal(displayTotal(totalPrograms, allProgramsLength, filteredProgramsLength), 6)
})

test('nothing excluded on this page: the heading still equals the raw total', () => {
  assert.equal(displayTotal(10, 10, 10), 10)
})

test('multiple exclusions (enrolled + saved) on the same page all come off the heading', () => {
  // 7 matched, 2 excluded this page (1 enrolled, 1 saved) -> 5 rendered, heading says 5.
  assert.equal(displayTotal(7, 7, 5), 5)
})

test('never goes negative even if pagination total undercounts relative to this page (defensive clamp)', () => {
  // Pathological: total reported lower than what is actually excluded on this page.
  assert.equal(displayTotal(2, 7, 0), 0)
})
