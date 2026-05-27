// Run with: npx tsx --test tests/unit/workouts-post-prs.test.ts
//
// Tests the gating + persistence layer that POST /api/workouts uses to keep
// exercisePRs in lockstep with workoutLogs. The pure PR math is exercised in
// exercisePRs.test.ts; here we lock in the side-effecting wrapper:
//   - completed=true & wasAlreadyComplete=false  → reads + writes PRs, returns newPRsAchieved
//   - completed=false                            → no read, no write, no newPRsAchieved
//   - completed=true  & wasAlreadyComplete=true  → no read, no write, no newPRsAchieved
//   - store throws                                → swallowed, returns []
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  maybePersistWorkoutPRs,
  type ExercisePRStore,
} from '../../lib/persistWorkoutPRs'
import type { IExercisePR } from '../../lib/exercisePRs'

interface FakeStoreState {
  reads: string[]
  writes: Array<{ userId: string; prs: IExercisePR[] }>
  prs: IExercisePR[]
  failOnWrite?: boolean
  failOnRead?: boolean
}

function makeFakeStore(state: FakeStoreState): ExercisePRStore {
  return {
    async readCurrentPRs(userId) {
      state.reads.push(userId)
      if (state.failOnRead) throw new Error('boom-read')
      return state.prs
    },
    async writePRs(userId, prs) {
      if (state.failOnWrite) throw new Error('boom-write')
      state.writes.push({ userId, prs })
      state.prs = prs
    },
  }
}

const sampleExercises = [
  {
    name: 'Bench Press',
    exerciseSlug: 'bench-press',
    sets: [{ weight: 135, reps: 8, completed: true }],
  },
]

const workoutDate = new Date('2026-05-26T18:00:00Z')
const userId = 'user-1'
const programId = 'prog-1'

// Silence the console.error the helper emits on the swallow path so test output
// stays clean. (Restore inside each test that touches it.)
function silenceConsoleError(): () => void {
  const orig = console.error
  console.error = () => {}
  return () => { console.error = orig }
}

test('completed=true + wasAlreadyComplete=false → PRs written, newPRsAchieved returned', async () => {
  const state: FakeStoreState = { reads: [], writes: [], prs: [] }
  const store = makeFakeStore(state)

  const newPRs = await maybePersistWorkoutPRs({
    store,
    userId,
    exercises: sampleExercises,
    date: workoutDate,
    programId,
    completed: true,
    wasAlreadyComplete: false,
  })

  assert.deepEqual(state.reads, [userId])
  assert.equal(state.writes.length, 1)
  assert.equal(state.writes[0].userId, userId)
  assert.equal(state.writes[0].prs.length, 1)
  assert.equal(state.writes[0].prs[0].exerciseSlug, 'bench-press')
  assert.equal(state.writes[0].prs[0].maxWeight?.weight, 135)
  assert.equal(newPRs.length, 1)
  assert.equal(newPRs[0].exerciseSlug, 'bench-press')
  assert.deepEqual(newPRs[0].dimensions.sort(), ['maxE1RM', 'maxReps', 'maxWeight'])
})

test('completed=false → no read, no write, no newPRsAchieved (gating short-circuit)', async () => {
  const state: FakeStoreState = { reads: [], writes: [], prs: [] }
  const store = makeFakeStore(state)

  const newPRs = await maybePersistWorkoutPRs({
    store,
    userId,
    exercises: sampleExercises,
    date: workoutDate,
    programId,
    completed: false,
    wasAlreadyComplete: false,
  })

  assert.deepEqual(state.reads, [])
  assert.deepEqual(state.writes, [])
  assert.deepEqual(newPRs, [])
})

test('completed=true + wasAlreadyComplete=true → no read, no write, no newPRsAchieved', async () => {
  // The user is re-saving a workout that was already complete in a previous
  // call. PRs were already recorded last time; running again would double-fire
  // the newPRsAchieved notification, which the gating must prevent.
  const state: FakeStoreState = {
    reads: [],
    writes: [],
    prs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        maxWeight: { weight: 135, reps: 8, date: workoutDate, programId },
        maxReps: { weight: 135, reps: 8, date: workoutDate, programId },
        maxE1RM: { weight: 135, reps: 8, e1rm: 171, date: workoutDate, programId },
      },
    ],
  }
  const store = makeFakeStore(state)

  const newPRs = await maybePersistWorkoutPRs({
    store,
    userId,
    exercises: sampleExercises,
    date: workoutDate,
    programId,
    completed: true,
    wasAlreadyComplete: true,
  })

  assert.deepEqual(state.reads, [])
  assert.deepEqual(state.writes, [])
  assert.deepEqual(newPRs, [])
})

test('store.writePRs throws → error swallowed, helper returns [] (workout save not blocked)', async () => {
  const restore = silenceConsoleError()
  const state: FakeStoreState = { reads: [], writes: [], prs: [], failOnWrite: true }
  const store = makeFakeStore(state)

  let thrown: unknown = null
  let result: Awaited<ReturnType<typeof maybePersistWorkoutPRs>> | undefined
  try {
    result = await maybePersistWorkoutPRs({
      store,
      userId,
      exercises: sampleExercises,
      date: workoutDate,
      programId,
      completed: true,
      wasAlreadyComplete: false,
    })
  } catch (err) {
    thrown = err
  } finally {
    restore()
  }

  assert.equal(thrown, null, 'helper must not propagate write errors')
  assert.deepEqual(result, [], 'returns empty array on swallowed failure')
  assert.deepEqual(state.reads, [userId], 'read was still attempted')
})

test('store.readCurrentPRs throws → error swallowed, helper returns []', async () => {
  const restore = silenceConsoleError()
  const state: FakeStoreState = { reads: [], writes: [], prs: [], failOnRead: true }
  const store = makeFakeStore(state)

  let result: Awaited<ReturnType<typeof maybePersistWorkoutPRs>> | undefined
  try {
    result = await maybePersistWorkoutPRs({
      store,
      userId,
      exercises: sampleExercises,
      date: workoutDate,
      programId,
      completed: true,
      wasAlreadyComplete: false,
    })
  } finally {
    restore()
  }

  assert.deepEqual(result, [])
  assert.deepEqual(state.writes, [], 'no write attempted after read failure')
})

test('second call with same sets is idempotent on the write (re-run after wasAlreadyComplete flipped wrong)', async () => {
  // Belt-and-suspenders: even if the caller mis-passed wasAlreadyComplete=false
  // for a second run of the same workout, the pure PR math is idempotent — the
  // second run writes the SAME PR records (no double-bumps) and returns no new
  // PRs achieved.
  const state: FakeStoreState = { reads: [], writes: [], prs: [] }
  const store = makeFakeStore(state)

  await maybePersistWorkoutPRs({
    store, userId, exercises: sampleExercises, date: workoutDate, programId,
    completed: true, wasAlreadyComplete: false,
  })
  const secondRun = await maybePersistWorkoutPRs({
    store, userId, exercises: sampleExercises, date: workoutDate, programId,
    completed: true, wasAlreadyComplete: false,
  })

  assert.equal(state.writes.length, 2)
  // Both writes hold the same PR records (idempotent).
  assert.equal(state.writes[1].prs.length, 1)
  assert.equal(state.writes[1].prs[0].maxWeight?.weight, 135)
  // Second run sees no new PRs broken.
  assert.deepEqual(secondRun, [])
})
