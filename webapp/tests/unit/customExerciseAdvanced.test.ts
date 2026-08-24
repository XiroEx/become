import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  inferBodyRegion,
  resolveCustomDifficulty,
  resolveCustomEquipment,
  resolveCustomExerciseCategory,
  resolveCustomExerciseMuscles,
  resolveCustomMovementPatterns,
  resolveCustomMuscleList,
} from '../../lib/customExerciseFields'

const ROOT = path.join(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('advanced exact muscles override the broad group and derive body region', () => {
  assert.deepEqual(resolveCustomExerciseMuscles(['upper_chest', 'triceps'], 'legs'), {
    primaryMuscles: ['upper_chest', 'triceps'],
    bodyRegion: 'upper_body',
  })
  assert.equal(inferBodyRegion(['quads', 'abs']), 'full_body')
})

test('advanced arrays discard unknown enum values and de-duplicate input', () => {
  assert.deepEqual(resolveCustomMuscleList(['lats', 'not_a_muscle', 'lats']), ['lats'])
  assert.deepEqual(resolveCustomEquipment(['none', 'dumbbell', 'dumbbell', 'mystery_machine']), ['dumbbell'])
  assert.deepEqual(resolveCustomMovementPatterns(['n/a', 'hinge', 'hinge', 'teleport']), ['hinge'])
})

test('advanced values retain safe defaults when omitted or invalid', () => {
  assert.deepEqual(resolveCustomEquipment(undefined), ['none'])
  assert.deepEqual(resolveCustomMovementPatterns(undefined), ['n/a'])
  assert.equal(resolveCustomDifficulty('impossible'), 'intermediate')
  assert.equal(resolveCustomExerciseCategory('mobility'), 'mobility')
})

test('the shared form keeps Advanced optional and exposes exact muscles plus other properties', () => {
  const src = read('components/workout/CustomExerciseFields.tsx')
  assert.match(src, /Advanced <span[^>]*>· optional/)
  assert.match(src, /aria-expanded=\{advancedOpen\}/)
  for (const field of ['primaryMuscles', 'secondaryMuscles', 'stabilizers', 'equipment', 'movementPatterns', 'mechanics', 'laterality', 'difficulty']) {
    assert.match(src, new RegExp(field), `${field} must be available in the shared form`)
  }
})

test('POST and PATCH both validate and persist the advanced fields', () => {
  for (const file of ['app/api/exercises/custom/route.ts', 'app/api/exercises/custom/[slug]/route.ts']) {
    const src = read(file)
    for (const resolver of [
      'resolveCustomExerciseMuscles', 'resolveCustomMuscleList', 'resolveCustomEquipment',
      'resolveCustomMechanics', 'resolveCustomMovementPatterns', 'resolveCustomLaterality',
      'resolveCustomDifficulty',
    ]) {
      assert.match(src, new RegExp(`${resolver}\\(`), `${file} must use ${resolver}`)
    }
  }
})

test('all custom-exercise creation surfaces post the shared form values', () => {
  const sessionBuilder = read('components/SessionBuilder.tsx')
  const addSheet = read('components/workout/AddExerciseSheet.tsx')
  const swap = read('components/ExerciseSwapModal.tsx')
  const library = read('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(sessionBuilder, /JSON\.stringify\(customForm\)/)
  assert.match(addSheet, /JSON\.stringify\(customForm\)/)
  assert.match(swap, /JSON\.stringify\(customForm\)/)
  assert.match(library, /primaryMuscles:\s*form\.primaryMuscles/)
  assert.match(library, /movementPatterns:\s*editForm\.movementPatterns/)
})
