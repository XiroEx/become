import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStartStep, quickScope, programScope, POSITION_MAX_AGE_MS, type WorkoutPosition } from '@/lib/workout/position'
import { buildWorkoutFlow } from '@/lib/workoutUtils'

const flow = buildWorkoutFlow([
  { name: 'Bench', sets: 4, reps: '10' },
  { name: 'Row', sets: 3, reps: '10' },
])

const rows = (bench: boolean[], row: boolean[]) => [
  bench.map(completed => ({ completed })),
  row.map(completed => ({ completed })),
]

const pos = (exerciseIndex: number, setIndex: number): WorkoutPosition => ({ exerciseIndex, setIndex, at: Date.now() })

test('the remembered step wins — flipping views puts you back where you were', () => {
  // Three sets done, standing on the fourth: switching to Track and back must
  // not drop you at set 1, which is what re-logged over finished work.
  const data = rows([true, true, true, false], [false, false, false])
  assert.equal(resolveStartStep(flow, data, pos(0, 3)), 3)
  // Even standing on a set you already finished — you went back to redo it.
  assert.equal(resolveStartStep(flow, data, pos(0, 1)), 1)
  // And on the second exercise.
  assert.equal(resolveStartStep(flow, data, pos(1, 2)), 6)
})

test('with no memory, the first set that still needs doing', () => {
  assert.equal(resolveStartStep(flow, rows([true, true, false, false], [false, false, false]), null), 2)
  assert.equal(resolveStartStep(flow, rows([false, false, false, false], [false, false, false]), undefined), 0)
})

test('a position for a step that no longer exists falls back, never crashes', () => {
  const data = rows([true, false, false, false], [false, false, false])
  // The workout shrank underneath the saved position.
  assert.equal(resolveStartStep(flow, data, pos(5, 0)), 1)
  assert.equal(resolveStartStep(flow, data, pos(0, 99)), 1)
  // Everything done: the last step, not an out-of-range index.
  const allDone = rows([true, true, true, true], [true, true, true])
  assert.equal(resolveStartStep(flow, allDone, null), flow.length - 1)
  // An empty workout is 0, not -1.
  assert.equal(resolveStartStep([], [], pos(0, 0)), 0)
})

test('scopes keep a quick session and a program day apart', () => {
  assert.equal(quickScope('abc'), 'quick:abc')
  assert.equal(programScope('program_jon_don_split', 'Day 1'), 'program:program_jon_don_split:Day 1')
  assert.notEqual(quickScope('x'), programScope('x', 'Day 1'))
  // Half a day is long enough to finish a workout, short enough that
  // yesterday's position never hijacks today's.
  assert.equal(POSITION_MAX_AGE_MS, 12 * 60 * 60 * 1000)
})
