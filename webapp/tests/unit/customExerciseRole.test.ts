// Run with: npm run test:file tests/unit/customExerciseRole.test.ts
//
// The "filter by compound/secondary/accessory" tabs the My Exercises library
// now offers only mean anything if a custom exercise can actually carry one
// of those roles — previously every custom exercise was hardcoded to
// role: "accessory" in POST /api/exercises/custom, so the filter would have
// bucketed 100% of a member's library into one tab. This pins down that the
// Role field exists in the shared create/edit form, that the server resolves
// and persists it (falling back to "accessory" for anything invalid), and
// that create/edit stay in sync the same way tracking type / muscle group /
// category already do.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  VALID_CUSTOM_EXERCISE_ROLES,
  resolveCustomExerciseRole,
} from '../../lib/customExerciseFields'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('resolveCustomExerciseRole accepts every valid role unchanged', () => {
  for (const role of VALID_CUSTOM_EXERCISE_ROLES) {
    assert.equal(resolveCustomExerciseRole(role), role)
  }
})

test('resolveCustomExerciseRole falls back to accessory for anything invalid or missing', () => {
  assert.equal(resolveCustomExerciseRole(undefined), 'accessory')
  assert.equal(resolveCustomExerciseRole(null), 'accessory')
  assert.equal(resolveCustomExerciseRole(''), 'accessory')
  assert.equal(resolveCustomExerciseRole('main-lift'), 'accessory')
  assert.equal(resolveCustomExerciseRole(42), 'accessory')
})

test('CustomExerciseFields: the Role picker only offers values the model enum accepts', () => {
  const src = readSource('components/workout/CustomExerciseFields.tsx')
  const block = src.match(/CUSTOM_EXERCISE_ROLE_OPTIONS\s*=\s*\[([\s\S]*?)\n\]/)
  assert.ok(block, 'CUSTOM_EXERCISE_ROLE_OPTIONS array not found in source')
  const values = [...block![1].matchAll(/value:\s*['"](\w+)['"]/g)].map((m) => m[1])
  assert.deepEqual(new Set(values), new Set(VALID_CUSTOM_EXERCISE_ROLES))
})

test('DEFAULT_CUSTOM_EXERCISE_VALUES seeds role: accessory, matching the server default', () => {
  const src = readSource('components/workout/CustomExerciseFields.tsx')
  const block = src.match(/DEFAULT_CUSTOM_EXERCISE_VALUES[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  assert.ok(block)
  assert.match(block![1], /role:\s*['"]accessory['"]/)
})

test('POST /api/exercises/custom resolves and persists role instead of hardcoding it', () => {
  const src = readSource('app/api/exercises/custom/route.ts')
  assert.match(src, /resolveCustomExerciseRole\(role\)/)
  assert.doesNotMatch(
    src,
    /role:\s*["']accessory["'],?\s*\n\s*movementPatterns/,
    'role must come from the resolved form value, not a hardcoded literal',
  )
})

test('PATCH /api/exercises/custom/[slug] resolves and persists role the same way POST does', () => {
  const src = readSource('app/api/exercises/custom/[slug]/route.ts')
  assert.match(src, /resolveCustomExerciseRole\(role\)/)
  assert.match(src, /exercise\.role\s*=\s*resolvedRole/)
})

test('ExerciseSwapModal forwards role when creating a custom exercise, not just the older field set', () => {
  const src = readSource('components/ExerciseSwapModal.tsx')
  assert.match(src, /JSON\.stringify\(customForm\)/)
  assert.match(
    readSource('components/workout/CustomExerciseFields.tsx'),
    /role:\s*'accessory'/,
    'the shared form state sent by the swap modal includes role',
  )
})
