// Run with: npx tsx --test tests/unit/customExerciseTrackingType.test.ts
//
// Every surface that can create a brand-new exercise on the spot — the
// "Create X" affordance in the live-workout / track-view add-exercise sheet,
// and the same affordance in the build-your-own session builder — used to
// hardcode `trackingType: 'reps_weight'` in the POST to /api/exercises/custom.
// A member who created "Stairmaster" mid-workout (a timed cardio machine, not
// a sets-and-reps lift) got an exercise permanently locked to sets & reps,
// with no way to fix it short of deleting and recreating it from the library.
//
// That was fixed once by giving each surface its own tracking-type picker —
// which then drifted into its own SECOND bug: those pickers only asked for a
// tracking type, never a muscle group, category, or default sets/reps, so a
// custom exercise made from Quick Session came out permanently less detailed
// than one made from the program/swap editor. The fix this time is not a
// third picker — it's one shared field set (CustomExerciseFields) that every
// creation surface renders, so this test now also pins down that no surface
// re-grows its own copy.
//
// This scans the source rather than rendering the components: neither surface
// has interaction-test infra (no jsdom/testing-library in this repo), and a
// source scan pins down the exact regression — a hardcoded literal, or a
// re-invented picker — without needing to build that infra for one fix.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

// Mirrors the allowlist in app/api/exercises/custom/route.ts (by way of
// lib/customExerciseFields.ts) — if that list ever changes, this is the other
// half that needs to stay in sync.
const API_VALID_TRACKING_TYPES = [
  'reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none',
]

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── The one picker: CustomExerciseFields ────────────────────────────────────

test('CustomExerciseFields: the tracking-type picker only offers values the API accepts', () => {
  const src = readSource('components/workout/CustomExerciseFields.tsx')
  const block = src.match(/CUSTOM_EXERCISE_TRACKING_TYPE_OPTIONS\s*=\s*\[([\s\S]*?)\n\]/)
  assert.ok(block, 'CUSTOM_EXERCISE_TRACKING_TYPE_OPTIONS array not found in source')
  const values = [...block![1].matchAll(/value:\s*['"](\w+)['"]/g)].map((m) => m[1])
  assert.ok(values.length > 1, 'expected the picker to offer more than one tracking type')
  for (const v of values) {
    assert.ok(
      API_VALID_TRACKING_TYPES.includes(v),
      `"${v}" is offered by the picker but is not a tracking type /api/exercises/custom accepts`,
    )
  }
})

test('lib/customExerciseFields.ts: the server-side allowlist matches the picker exactly', () => {
  const src = readSource('lib/customExerciseFields.ts')
  const block = src.match(/VALID_CUSTOM_TRACKING_TYPES\s*=\s*\[([\s\S]*?)\]/)
  assert.ok(block, 'VALID_CUSTOM_TRACKING_TYPES not found in source')
  const values = [...block![1].matchAll(/['"](\w+)['"]/g)].map((m) => m[1])
  assert.deepEqual(
    [...values].sort(),
    [...API_VALID_TRACKING_TYPES].sort(),
    'the route-level allowlist must accept exactly the tracking types the picker offers',
  )
})

// ─── Every creation surface renders the shared field set ─────────────────────

const CREATION_SURFACES = [
  { label: 'AddExerciseSheet (live workout + track view "add exercise" sheet)', file: 'components/workout/AddExerciseSheet.tsx' },
  { label: 'SessionBuilder (build-your-own session)', file: 'components/SessionBuilder.tsx' },
  { label: 'ExerciseSwapModal (program + session "swap exercise" modal)', file: 'components/ExerciseSwapModal.tsx' },
  { label: 'ExerciseLibraryClient (My Exercises library, create + edit)', file: 'app/dashboard/workout/library/ExerciseLibraryClient.tsx' },
]

for (const { label, file } of CREATION_SURFACES) {
  test(`${label} renders the shared CustomExerciseFields form, not a local picker`, () => {
    const src = readSource(file)
    assert.match(
      src,
      /<CustomExerciseFields\b/,
      `${file} must render the shared CustomExerciseFields component`,
    )
    assert.doesNotMatch(
      src,
      /CUSTOM_TRACKING_OPTIONS|TRACKING_TYPE_OPTIONS\s*=\s*\[/,
      `${file} must not define its own copy of the tracking-type picker — that is exactly the ` +
        'drift ("two ways to make a custom exercise") this fix removes',
    )
  })
}

// ─── The two "create inline" surfaces send the whole form, not a slice of it ──

const INLINE_CREATE_SURFACES = [
  { label: 'AddExerciseSheet', file: 'components/workout/AddExerciseSheet.tsx', formVar: 'customForm' },
  { label: 'SessionBuilder', file: 'components/SessionBuilder.tsx', formVar: 'customForm' },
]

for (const { label, file, formVar } of INLINE_CREATE_SURFACES) {
  test(`REGRESSION: ${label} no longer hardcodes trackingType or category when creating a custom exercise`, () => {
    const src = readSource(file)
    const calls = [...src.matchAll(/fetch\(['"]\/api\/exercises\/custom['"],\s*\{[\s\S]*?\n\s*\}\)/g)]
    const post = calls.find((m) => /method:\s*['"]POST['"]/.test(m[0]))
    assert.ok(post, 'POST /api/exercises/custom call not found')

    assert.doesNotMatch(
      post![0],
      /trackingType:\s*['"]reps_weight['"]/,
      'the stairmaster bug: exercise creation was locked to reps_weight regardless of what the member picked',
    )
    assert.doesNotMatch(
      post![0],
      /category:\s*['"]strength['"]/,
      'category is hardcoded to strength regardless of the picked tracking type',
    )
    // The full form (name, trackingType, muscleGroup, category, defaultSets,
    // defaultReps) travels as one object now, not individual hardcoded/derived
    // fields — so the body just serializes the form state directly.
    assert.match(
      post![0],
      new RegExp(`body:\\s*JSON\\.stringify\\(${formVar}\\)`),
      `expected the POST body to serialize the full ${formVar} object`,
    )
  })
}
