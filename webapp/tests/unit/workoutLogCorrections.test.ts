import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeWorkoutLogCorrection } from '../../lib/workoutLogCorrections'
import { computeExercisePRsFromLogs } from '../../lib/exercisePRs'

const ROOT = path.join(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('a valid correction normalizes set numbering and preserves supported measurements', () => {
  const result = normalizeWorkoutLogCorrection({
    duration: 47,
    notes: ' Corrected plate entry ',
    exercises: [{
      name: 'Bench Press',
      exerciseSlug: 'bench-press',
      sets: [{ setNumber: 99, reps: 5, weight: 135, completed: true }],
    }],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.exercises[0].sets[0].setNumber, 1)
  assert.equal(result.value.exercises[0].sets[0].weight, 135)
  assert.equal(result.value.notes, 'Corrected plate entry')
})

test('corrections reject negative, non-finite, and fractional rep values', () => {
  for (const reps of [-1, 2.5, Number.POSITIVE_INFINITY]) {
    const result = normalizeWorkoutLogCorrection({
      exercises: [{ name: 'Squat', sets: [{ reps, weight: 100, completed: true }] }],
    })
    assert.equal(result.ok, false)
  }
})

test('replaying corrected history removes a stale high personal record', () => {
  const logs = [{
    date: '2026-08-20T12:00:00.000Z',
    completed: true,
    exercises: [{ name: 'Bench Press', exerciseSlug: 'bench-press', sets: [{ reps: 5, weight: 145, completed: true }] }],
  }, {
    date: '2026-08-21T12:00:00.000Z',
    completed: true,
    exercises: [{ name: 'Bench Press', exerciseSlug: 'bench-press', sets: [{ reps: 5, weight: 45, completed: true }] }],
  }]
  const before = computeExercisePRsFromLogs(logs)
  assert.equal(before[0].maxWeight?.weight, 145)
  logs[0].exercises[0].sets[0].weight = 35
  const after = computeExercisePRsFromLogs(logs)
  assert.equal(after[0].maxWeight?.weight, 45)
})

test('the workout correction route is auth-scoped and recalculates all PRs before save', () => {
  const src = read('app/api/workouts/logs/route.ts')
  assert.match(src, /verifyAuth\(request\)/)
  assert.match(src, /UserProgress\.findOne\(\{ userId: auth\.userId \}\)/)
  assert.match(src, /computeExercisePRsFromLogs\(progress\.workoutLogs\)/)
  assert.match(src, /Only completed workout logs can be corrected/)
})

test('PR writes are auth-scoped and the UI requires a visible confirmation step', () => {
  const api = read('app/api/progress/prs/route.ts')
  const ui = read('app/dashboard/progress/ProgressClient.tsx')
  const workoutUi = read('components/workout/TrainingLogCorrectionModal.tsx')
  assert.match(api, /UserProgress\.findOne\(\{ userId: auth\.userId \}\)/)
  assert.match(api, /export async function DELETE/)
  assert.match(ui, /Confirm record correction/)
  assert.match(ui, /Yes, remove/)
  assert.match(workoutUi, /Confirm these corrections/)
  assert.match(workoutUi, /recalculates personal records/)
})
