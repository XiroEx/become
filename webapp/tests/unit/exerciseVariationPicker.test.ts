// Run with: npm run test:file tests/unit/exerciseVariationPicker.test.ts
//
// The "Swap Exercise" modal already grouped equipment/style variants (Machine
// Chest Press / Dumbbell Bench Press / ...) behind a "N variations" chip
// picker — but that experience only existed when *replacing* an exercise
// already in a workout. Picking a fresh exercise from search (the quick
// "Add an exercise" sheet, or either program builder) showed a flat list
// with no way to see or choose the sibling variant. This pins down that the
// same variation picker now wires into those "add" surfaces too, and that
// the variations API carries enough data (trackingType) to switch between
// variants without breaking timed-vs-reps prescriptions.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── API: GET /api/exercises/variations now carries trackingType ───────────

test('GET /api/exercises/variations selects and returns trackingType for the source exercise', () => {
  const src = readSource('app/api/exercises/variations/route.ts')
  assert.match(
    src,
    /const VARIATION_FIELDS =\s*\n?\s*'[^']*\btrackingType\b[^']*'/,
    'the shared projection must include trackingType, or the picker cannot tell a timed variant from a reps variant',
  )
  assert.match(
    src,
    /trackingType:\s*source\.trackingType as string/,
    'the source entry in the returned variations array must carry trackingType',
  )
})

test('GET /api/exercises/variations projects the same fields for source, candidates and explicit variants', () => {
  const src = readSource('app/api/exercises/variations/route.ts')
  // One named projection used by every query, so the source lookup and the
  // variant lookups can never drift into selecting different shapes.
  const selects = [...src.matchAll(/\.select\(([^)]*)\)/g)].map((m) => m[1])
  assert.equal(selects.length, 3, 'source, candidate pool and explicit variations')
  for (const projection of selects) {
    assert.match(projection, /VARIATION_FIELDS/, `projection ${projection} must use the shared field list`)
  }
})

test('GET /api/exercises/variations is authenticated and visibility-scoped', () => {
  // A custom exercise is owner-private until an admin approves it. This route
  // had no auth and no visibility filter, so it served one member's private
  // customs to any caller — and matching on names widens what it returns.
  const src = readSource('app/api/exercises/variations/route.ts')
  assert.match(src, /verifyAuth\(request\)/, 'the route must identify the caller')
  assert.match(src, /if \(!auth\.success\)[\s\S]{0,120}status: 401/, 'an unauthenticated caller must get a 401')
  const visibilityCalls = [...src.matchAll(/visibleExerciseFilter\(auth\.userId\)/g)]
  assert.equal(
    visibilityCalls.length, 2,
    'the source lookup and the explicit-variations lookup must both be visibility-scoped '
      + '(the candidate pool gets it from buildVariationCandidateQuery)',
  )
})

test('ExerciseVariation interface exported by the variations route declares trackingType', () => {
  const src = readSource('app/api/exercises/variations/route.ts')
  const iface = src.slice(src.indexOf('export interface ExerciseVariation'), src.indexOf('// GET /api/exercises/variations'))
  assert.match(iface, /trackingType:\s*string/)
})

// ─── Shared component ───────────────────────────────────────────────────────

test('ExerciseVariationPicker renders nothing until more than one variation exists', () => {
  const src = readSource('components/ExerciseVariationPicker.tsx')
  assert.match(
    src,
    /if \(!variations \|\| variations\.length < 2\) return null/,
    'a single-result exercise has nothing to pick between — the picker must stay invisible',
  )
})

test('ExerciseVariationPicker fetches the variations endpoint keyed off the given slug', () => {
  const src = readSource('components/ExerciseVariationPicker.tsx')
  assert.match(src, /\/api\/exercises\/variations\?slug=\$\{encodeURIComponent\(slug\)\}/)
})

test('ExerciseVariationPicker hands the full variation object back on select, not just the slug', () => {
  const src = readSource('components/ExerciseVariationPicker.tsx')
  assert.match(src, /onClick=\{\(\) => onSelect\(v\)\}/)
})

// ─── Quick "Add an exercise" sheet (mid-workout add, build-as-you-go) ───────

test('AddExerciseSheet wires the variation picker into the picked-exercise step', () => {
  const src = readSource('components/workout/AddExerciseSheet.tsx')
  assert.match(src, /import ExerciseVariationPicker, \{ type ExerciseVariation \} from '@\/components\/ExerciseVariationPicker'/)
  assert.match(
    src,
    /<ExerciseVariationPicker\s+slug=\{picked\.slug\}/,
    'the picker must be driven by the exercise the member just picked',
  )
})

test('AddExerciseSheet resets reps/seconds when switching to a variant with a different tracking category', () => {
  const src = readSource('components/workout/AddExerciseSheet.tsx')
  assert.match(src, /const selectVariation = useCallback\(\(v: ExerciseVariation\) => \{/)
  assert.match(
    src,
    /isTimed\(v\.trackingType\) !== isTimed\(prev\?\.trackingType\)/,
    'switching e.g. Plank (time) <-> Sit-Up (reps) must not leave a stale reps/seconds value from the old variant',
  )
})

// ─── Program builders (admin + user) ────────────────────────────────────────

for (const file of [
  'app/dashboard/admin/programs/_editors/ExerciseEditor.tsx',
  'app/dashboard/workout/create/ExerciseEditor.tsx',
]) {
  test(`${file} wires the variation picker off the currently matched catalog exercise`, () => {
    const src = readSource(file)
    assert.match(src, /import ExerciseVariationPicker, \{ type ExerciseVariation \} from "@\/components\/ExerciseVariationPicker"/)
    assert.match(
      src,
      /<ExerciseVariationPicker\s+slug=\{exercise\.exerciseSlug\}/,
      'the picker must key off exercise.exerciseSlug — the canonical DB reference set when a search result is chosen',
    )
    assert.match(
      src,
      /onSelect=\{\(v: ExerciseVariation\) => onUpdate\(\{ \.\.\.exercise, name: v\.name, exerciseSlug: v\.slug \}\)\}/,
      'picking a variation must update both the display name and the canonical exerciseSlug',
    )
  })
}
