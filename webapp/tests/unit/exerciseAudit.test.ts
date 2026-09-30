// Run with: npm run test:file tests/unit/exerciseAudit.test.ts
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
  describeExerciseIssues,
  matchesAuditSearch,
  exerciseTextSearchClause,
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

// ─── describeExerciseIssues ─────────────────────────────────────────────────
//
// Card follow-up: "I see that they are broken but why are they broken...
// Put a clickable hazard that shows why." isBrokenExercise/isMissingVideo
// only ever gave a yes/no per tab — this reports the specific field(s) an
// admin needs to go fix, independently of whether the combination is enough
// to trip the "Broken" tab's AND.

test('describeExerciseIssues lists every missing field independently', () => {
  const issues = describeExerciseIssues({ videoUrl: null, instructions: [], primaryMuscles: [] })
  const types = issues.map((i) => i.type)
  assert.ok(types.includes('noVideo'))
  assert.ok(types.includes('noInstructions'))
  assert.ok(types.includes('noPrimaryMuscles'))
})

test('describeExerciseIssues reports a single missing field even when that alone would not trip isBrokenExercise', () => {
  // instructions present, muscles missing: isBrokenExercise is false (AND),
  // but the admin still needs to know muscles are unset.
  const withInstructions = { videoUrl: 'https://x/y.mp4', instructions: ['Step 1'], primaryMuscles: [] }
  assert.equal(isBrokenExercise(withInstructions), false)
  const issues = describeExerciseIssues(withInstructions)
  assert.deepEqual(issues.map((i) => i.type), ['noPrimaryMuscles'])
})

test('describeExerciseIssues is empty for a fully filled-out exercise', () => {
  const issues = describeExerciseIssues({
    videoUrl: 'https://x/y.mp4',
    instructions: ['Step 1'],
    primaryMuscles: ['quads'],
  })
  assert.deepEqual(issues, [])
})

test('describeExerciseIssues surfaces the colliding name(s) only when given duplicateNames', () => {
  const clean = { videoUrl: 'https://x/y.mp4', instructions: ['Step 1'], primaryMuscles: ['quads'] }
  assert.deepEqual(describeExerciseIssues(clean), [])
  const flagged = describeExerciseIssues(clean, ['Leg Extension'])
  assert.equal(flagged.length, 1)
  assert.equal(flagged[0].type, 'duplicate')
  assert.match(flagged[0].message, /Leg Extension/)
})

// ─── Wiring: the fixes are actually plugged in ─────────────────────────────

test('GET /api/exercises/search escapes user input before building $regex', () => {
  const src = readSource('app/api/exercises/search/route.ts')
  // Escaping happens inside nameBoundaryPattern() (lib/exerciseSearchRanking,
  // covered by its own "escapes regex metacharacters" test) rather than inline
  // here, and `q` now reaches it as a list of variants — the literal query plus
  // its gym-shorthand expansion, "RDL" → "romanian deadlift"
  // (lib/exerciseAbbreviations). Every one of them is still escaped, and the
  // raw query never reaches $regex on its own.
  assert.match(src, /expandQueryVariants\(q\)\.map\(nameBoundaryPattern\)/)
  assert.doesNotMatch(src, /\$regex:\s*q[,\s}]/, 'the raw query must never reach $regex')
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

test('GET /api/admin/exercises/[slug]/issues is admin-gated and computes duplicate names from the full catalog', () => {
  const src = readSource('app/api/admin/exercises/[slug]/issues/route.ts')
  assert.match(src, /requireAdmin\(/)
  assert.match(src, /describeExerciseIssues\(/)
  assert.match(src, /findDuplicateGroups\(/)
})

test('EditExerciseClient fetches and renders the clickable issues hazard', () => {
  const src = readSource('app/dashboard/admin/exercises/[slug]/edit/EditExerciseClient.tsx')
  assert.match(src, /\/api\/admin\/exercises\/\$\{encodeURIComponent\(slug\)\}\/issues/)
  assert.match(src, /setIssuesOpen/, 'the hazard banner must be clickable to reveal the reasons')
})

test('Admin exercises list surfaces a hazard icon for rows with audit issues', () => {
  const src = readSource('app/dashboard/admin/exercises/page.tsx')
  assert.match(src, /describeExerciseIssues/)
  assert.match(src, /AlertTriangle/)
})

// ─── Admin catalog search understands the shorthand ──────────────────────
//
// Card: "We need to have support for our dumbbell only program. When I
// searched the exercise in the admin portal, none of the exercises pop up."
// The list's `?q=` was a raw substring match, so the half of the catalog
// written in gym shorthand was unreachable from the words Jon types, and the
// half written out in full was unreachable from the shorthand his programs use.

const DUMBBELL_CURL = { slug: 'dumbbell-curl', name: 'Dumbbell Curl', aliases: ['Dumbbell Curls'] }
const STILL_SHORTHAND = { slug: 'chest-supported-row', name: 'Chest-Supported Row', aliases: ['Incline DB Row or Cable Row'] }

test('matchesAuditSearch finds a spelled-out row from the shorthand a program uses', () => {
  assert.equal(matchesAuditSearch(DUMBBELL_CURL, 'DB Curl'), true)
  assert.equal(matchesAuditSearch(DUMBBELL_CURL, 'db curl'), true)
  assert.equal(matchesAuditSearch(DUMBBELL_CURL, 'RDL'), false, 'an expansion must not match everything')
})

test('matchesAuditSearch still finds a row whose alias is the shorthand', () => {
  assert.equal(matchesAuditSearch(STILL_SHORTHAND, 'DB Row'), true)
  assert.equal(matchesAuditSearch(STILL_SHORTHAND, 'chest-supported'), true)
})

test('matchesAuditSearch keeps its literal substring behaviour and its empty-query pass', () => {
  assert.equal(matchesAuditSearch(DUMBBELL_CURL, 'curl'), true)
  assert.equal(matchesAuditSearch(DUMBBELL_CURL, '   '), true)
  assert.equal(matchesAuditSearch(DUMBBELL_CURL, 'squat'), false)
})

test('exerciseTextSearchClause searches name, slug and aliases for every query variant', () => {
  const clause = exerciseTextSearchClause('DB Curl') as { $or: Record<string, unknown>[] }
  // Two variants ("db curl", "dumbbell curl") × three fields.
  assert.equal(clause.$or.length, 6)
  const patterns = clause.$or.map((c) => JSON.stringify(c))
  assert.ok(patterns.some((p) => p.includes('db curl')), 'the literal query must reach Mongo')
  assert.ok(patterns.some((p) => p.includes('dumbbell curl')), 'so must its expansion')
  assert.ok(patterns.some((p) => p.includes('"name"')))
  assert.ok(patterns.some((p) => p.includes('"slug"')))
  assert.ok(patterns.some((p) => p.includes('"aliases"')))
})

test('exerciseTextSearchClause is null for an empty query and escapes regex metacharacters', () => {
  assert.equal(exerciseTextSearchClause(''), null)
  assert.equal(exerciseTextSearchClause('   '), null)
  const clause = exerciseTextSearchClause('Curl (EZ') as { $or: Record<string, unknown>[] }
  const first = clause.$or[0] as { name: { $regex: string } }
  assert.doesNotThrow(() => new RegExp(first.name.$regex), 'a half-typed name must not throw inside $regex')
})

test('the admin exercises list route builds its query through exerciseTextSearchClause', () => {
  const src = readSource('app/api/exercises/route.ts')
  assert.match(src, /exerciseTextSearchClause\(q\)/)
  assert.doesNotMatch(
    src,
    /escapeRegExp\(q\)/,
    'the hand-rolled single-variant substring query is what the card is about',
  )
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
