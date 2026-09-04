// Run with: npx tsx --test tests/unit/exerciseAudit.test.ts
//
// Card: "Exercises not showing up when adding an exercise, or swapping."
// A member searching "Leg ex" during a workout couldn't find the existing
// "Leg Extension" and created a duplicate custom "Leg extensions" instead.
// These are the heuristics behind the admin Duplicates/No Video/Broken tab
// and the auto-flag-on-create check that puts a likely duplicate straight
// into the review queue instead of waiting on the member to notice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizeExerciseName,
  isMissingVideo,
  isBrokenExercise,
  findDuplicateGroups,
  findDuplicateSlugs,
  findDuplicateOf,
  escapeRegExp,
} from '../../lib/exerciseAudit'

const ROOT = path.join(__dirname, '../..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── normalizeExerciseName ───────────────────────────────────────────────

test('normalizeExerciseName collapses the exact repro case to the same key', () => {
  assert.equal(normalizeExerciseName('Leg Extension'), normalizeExerciseName('Leg extensions'))
})

test('normalizeExerciseName is case-insensitive and punctuation-insensitive', () => {
  assert.equal(normalizeExerciseName('  Bench Press  '), normalizeExerciseName('bench-press'))
  assert.equal(normalizeExerciseName('Pull-Up'), normalizeExerciseName('pull up!'))
})

test('normalizeExerciseName does not collapse genuinely different names', () => {
  assert.notEqual(normalizeExerciseName('Leg Extension'), normalizeExerciseName('Leg Curl'))
})

// ─── isMissingVideo ───────────────────────────────────────────────────────

test('isMissingVideo is true for null, undefined, and empty string', () => {
  assert.ok(isMissingVideo({ videoUrl: null }))
  assert.ok(isMissingVideo({ videoUrl: undefined }))
  assert.ok(isMissingVideo({ videoUrl: '' }))
})

test('isMissingVideo is false once a videoUrl is set', () => {
  assert.equal(isMissingVideo({ videoUrl: 'https://example.com/clip.mp4' }), false)
})

// ─── isBrokenExercise ─────────────────────────────────────────────────────

test('isBrokenExercise is true for an empty shell (no instructions, no muscles)', () => {
  assert.ok(isBrokenExercise({ instructions: [], primaryMuscles: [] }))
  assert.ok(isBrokenExercise({}))
})

test('isBrokenExercise is false if either instructions or muscles are present', () => {
  assert.equal(isBrokenExercise({ instructions: ['Step 1'], primaryMuscles: [] }), false)
  assert.equal(isBrokenExercise({ instructions: [], primaryMuscles: ['quads'] }), false)
})

// ─── findDuplicateGroups / findDuplicateSlugs ──────────────────────────────

test('findDuplicateSlugs flags both sides of the Leg Extension repro', () => {
  const exercises = [
    { slug: 'leg-extension', name: 'Leg Extension' },
    { slug: 'custom-abc123-leg-extensions-1', name: 'Leg extensions' },
    { slug: 'bench-press', name: 'Bench Press' },
  ]
  const slugs = findDuplicateSlugs(exercises)
  assert.ok(slugs.has('leg-extension'))
  assert.ok(slugs.has('custom-abc123-leg-extensions-1'))
  assert.equal(slugs.has('bench-press'), false)
})

test('findDuplicateGroups excludes names with no collision', () => {
  const exercises = [
    { slug: 'a', name: 'Squat' },
    { slug: 'b', name: 'Deadlift' },
  ]
  assert.equal(findDuplicateGroups(exercises).size, 0)
})

test('findDuplicateGroups groups 3+ colliding names together', () => {
  const exercises = [
    { slug: 'a', name: 'Push Up' },
    { slug: 'b', name: 'Push ups' },
    { slug: 'c', name: 'push-up' },
  ]
  const groups = findDuplicateGroups(exercises)
  assert.equal(groups.size, 1)
  const group = [...groups.values()][0]
  assert.equal(group.length, 3)
})

// ─── findDuplicateOf ────────────────────────────────────────────────────────

test('findDuplicateOf finds the canonical exercise a new custom one collides with', () => {
  const catalog = [
    { slug: 'leg-extension', name: 'Leg Extension' },
    { slug: 'bench-press', name: 'Bench Press' },
  ]
  const dup = findDuplicateOf('Leg extensions', catalog)
  assert.equal(dup?.slug, 'leg-extension')
})

test('findDuplicateOf returns null when nothing collides', () => {
  const catalog = [{ slug: 'bench-press', name: 'Bench Press' }]
  assert.equal(findDuplicateOf('Nordic Curl', catalog), null)
})

test('findDuplicateOf excludes the candidate itself by slug (editing shouldn\'t flag itself)', () => {
  const catalog = [{ slug: 'leg-extension', name: 'Leg Extension' }]
  assert.equal(findDuplicateOf('Leg Extension', catalog, 'leg-extension'), null)
})

// ─── escapeRegExp ───────────────────────────────────────────────────────────

test('escapeRegExp neutralizes regex metacharacters so a $regex query cannot throw', () => {
  const raw = 'Curl (EZ Bar) [drop set]'
  const escaped = escapeRegExp(raw)
  // Constructing a RegExp from the escaped string must not throw, and it
  // must match the literal original string.
  assert.doesNotThrow(() => new RegExp(escaped, 'i'))
  assert.ok(new RegExp(escaped, 'i').test(raw))
})

// ─── Wiring: the fixes are actually plugged in ─────────────────────────────

test('GET /api/exercises/search escapes user input before building $regex', () => {
  const src = readSource('app/api/exercises/search/route.ts')
  assert.match(src, /escapeRegExp\(q\)/)
  assert.match(src, /try\s*{/, 'a bad query must not 500 the whole add/swap flow')
})

test('POST /api/exercises/custom auto-flags a name collision into the review queue', () => {
  const src = readSource('app/api/exercises/custom/route.ts')
  assert.match(src, /findDuplicateOf\(/)
  assert.match(src, /reviewStatus:\s*duplicateOf\s*\?\s*"pending"\s*:\s*"none"/)
})

test('GET /api/exercises supports an admin issue=duplicate|noVideo|broken filter', () => {
  const src = readSource('app/api/exercises/route.ts')
  assert.match(src, /findDuplicateSlugs/)
  assert.match(src, /isMissingVideo/)
  assert.match(src, /isBrokenExercise/)
})

test('ExerciseSwapModal queries the full catalog, not just the pre-scored alternatives list', () => {
  const src = readSource('components/ExerciseSwapModal.tsx')
  assert.match(
    src,
    /fetch\(`\/api\/exercises\/search\?q=/,
    'the swap search box must fall back to a real catalog search — filtering only the ' +
      'similarity-scored top-30 alternatives is what let an exact-name match go unfound',
  )
})
