import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendExercise,
  insertExerciseAfter,
  addIntoGroup,
  groupIndexes,
  ungroupAt,
  removeExercise,
  applyOrder,
  applyOrderToRecord,
  remapIndex,
  mergeAdHocFromLog,
  exerciseFromLog,
  prescriptionOf,
  naturalKindFor,
  newGroupId,
  sanitizeGroups,
  needsMoreExercises,
  shouldWarnBeforeFinish,
  RECOMMENDED_MIN_EXERCISES,
  type AdHocExercise,
} from '@/lib/workout/buildAsYouGo'
import { buildWorkoutFlow, groupExercises } from '@/lib/workoutUtils'
import type { WorkoutExercise } from '@/lib/workoutUtils'

const ex = (name: string, sets = 3, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ name, sets, reps: '10', trackingType: 'reps_weight', ...extra })

test('appending puts the exercise last and marks its row as new', () => {
  const list = [ex('Bench'), ex('Row')]
  const r = appendExercise<AdHocExercise>(list, { ...ex('Curl'), addedAdHoc: true })
  assert.equal(r.index, 2)
  assert.deepEqual(r.exercises.map(e => e.name), ['Bench', 'Row', 'Curl'])
  assert.deepEqual(r.order, [0, 1, -1])
  // The original list is untouched — the live view diffs on identity.
  assert.equal(list.length, 2)
})

test('grouping moves the picked exercises together and keeps set data with them', () => {
  const list = [ex('Bench'), ex('Squat'), ex('Row')]
  const r = groupIndexes(list, [0, 2], 'superset')
  assert.deepEqual(r.exercises.map(e => e.name), ['Bench', 'Row', 'Squat'])
  assert.deepEqual(r.order, [0, 2, 1])
  assert.equal(r.exercises[0]!.groupId, r.exercises[1]!.groupId)
  assert.equal(r.exercises[0]!.groupType, 'superset')
  assert.equal(r.exercises[2]!.groupId, undefined)
  assert.deepEqual(r.indexes, [0, 1])

  // Set data follows its exercise, not its old slot.
  const rows = [['bench sets'], ['squat sets'], ['row sets']]
  assert.deepEqual(applyOrder(rows, r.order, () => ['new']), [['bench sets'], ['row sets'], ['squat sets']])

  // And the flow now interleaves the pair: A1 B1 A2 B2 A3 B3, then Squat.
  const flow = buildWorkoutFlow(r.exercises)
  assert.deepEqual(flow.slice(0, 4).map(s => `${s.exerciseIndex}.${s.setIndex}`), ['0.0', '1.0', '0.1', '1.1'])
  assert.equal(flow.at(-1)!.exerciseIndex, 2)
})

test('adding into the exercise you are standing in supersets the two', () => {
  const list = [ex('Bench'), ex('Squat')]
  const r = addIntoGroup(list, 0, ex('Fly'), 'superset')
  assert.deepEqual(r.exercises.map(e => e.name), ['Bench', 'Fly', 'Squat'])
  assert.equal(r.index, 1)
  assert.equal(r.exercises[0]!.groupId, r.exercises[1]!.groupId)
  assert.equal(r.exercises[1]!.groupId, r.groupId)
  assert.equal(r.exercises[2]!.groupId, undefined)
  // The new exercise's row is fresh; Squat's row follows it across.
  assert.deepEqual(applyOrder([['b'], ['s']], r.order, () => ['blank']), [['b'], ['blank'], ['s']])
})

test('adding into a group that already exists lands behind its last member', () => {
  const gid = 'g1'
  const list = [ex('Bench', 3, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }), ex('Row', 3, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }), ex('Squat')]
  const r = addIntoGroup(list, 0, ex('Dip'))
  assert.deepEqual(r.exercises.map(e => e.name), ['Bench', 'Row', 'Dip', 'Squat'])
  assert.equal(r.exercises[2]!.groupId, gid)
  assert.equal(r.exercises[2]!.groupType, 'circuit')
  assert.equal(r.groupId, gid)
  // Groups stay contiguous, which is the only reason the flow interleaves.
  assert.equal(groupExercises(r.exercises)[0]!.exercises.length, 3)
})

test('ungrouping strips every group field, and removing down to one dissolves the rest', () => {
  const gid = 'g1'
  const list = [ex('Bench', 3, { groupId: gid, groupType: 'superset', groupLabel: 'Superset', groupRounds: 3 }), ex('Row', 3, { groupId: gid, groupType: 'superset' }), ex('Squat')]
  const un = ungroupAt(list, 1)
  assert.equal(un.exercises[0]!.groupId, undefined)
  assert.equal(un.exercises[0]!.groupType, undefined)
  assert.equal(un.exercises[0]!.groupLabel, undefined)
  assert.equal(un.exercises[0]!.groupRounds, undefined)

  const rm = removeExercise(list, 1)
  assert.deepEqual(rm.exercises.map(e => e.name), ['Bench', 'Squat'])
  assert.deepEqual(rm.order, [0, 2])
  // A superset of one is not a superset.
  assert.equal(rm.exercises[0]!.groupId, undefined)
})

test('the step you are standing on survives a reorder', () => {
  const list = [ex('Bench'), ex('Squat'), ex('Row')]
  const r = groupIndexes(list, [0, 2], 'superset')
  assert.equal(remapIndex(r.order, 2), 1)   // Row moved up next to Bench
  assert.equal(remapIndex(r.order, 1), 2)   // Squat slid down
  const swaps = applyOrderToRecord({ 2: { originalSlug: 'row', originalName: 'Row' } }, r.order)
  assert.deepEqual(swaps, { 1: { originalSlug: 'row', originalName: 'Row' } })
})

test('an exercise added mid-session comes back on resume, with its prescription', () => {
  const planned = [ex('Bench'), ex('Row')]
  const saved = [
    { name: 'Bench', sets: [{ reps: 8, weight: 185, completed: true }] },
    { name: 'Row', sets: [{ reps: 10, weight: 95, completed: true }] },
    {
      name: 'Cable Fly',
      exerciseSlug: 'cable-fly',
      addedAdHoc: true,
      sets: [{ reps: 0, weight: 0, completed: false }, { reps: 0, weight: 0, completed: false }],
      prescription: { sets: 2, reps: '12-15', rest: '45s', trackingType: 'reps_weight' },
      groupId: 'adhoc-1',
      groupType: 'superset',
    },
  ]
  const merged = mergeAdHocFromLog(planned, saved)
  assert.deepEqual(merged.map(e => e.name), ['Bench', 'Row', 'Cable Fly'])
  assert.equal(merged[2]!.sets, 2)
  assert.equal(merged[2]!.reps, '12-15')
  assert.equal(merged[2]!.groupType, 'superset')

  // A log written before the flag existed still restores by position.
  const legacy = mergeAdHocFromLog(planned, [saved[0]!, saved[1]!, { name: 'Plank', sets: [{ duration: 45, completed: true }] }])
  assert.equal(legacy.length, 3)
  assert.equal(legacy[2]!.trackingType, 'time')
  assert.equal(legacy[2]!.duration, '45')

  // Nothing extra in the log = nothing appended.
  assert.equal(mergeAdHocFromLog(planned, [saved[0]!, saved[1]!]).length, 2)
  assert.equal(mergeAdHocFromLog(planned, undefined).length, 2)
})

test('a timed exercise round-trips through the log', () => {
  const plank = { name: 'Plank', trackingType: 'time', sets: 3, reps: '', duration: '45 sec' }
  const back = exerciseFromLog({ name: 'Plank', addedAdHoc: true, sets: [{ duration: 45, completed: true }], prescription: prescriptionOf(plank) })
  assert.equal(back.trackingType, 'time')
  assert.equal(back.duration, '45 sec')
  assert.equal(back.sets, 3)
  assert.equal(back.addedAdHoc, true)
})

test('group ids never collide, and a group is named for its size', () => {
  assert.equal(newGroupId([{ groupId: 'adhoc-1' }], 1), 'adhoc-2')
  assert.equal(naturalKindFor(2), 'superset')
  assert.equal(naturalKindFor(3), 'triset')
  assert.equal(naturalKindFor(5), 'giant_set')
})

test('grouping fewer than two exercises is a no-op', () => {
  const list = [ex('Bench'), ex('Row')]
  const r = groupIndexes(list, [1], 'superset')
  assert.equal(r.exercises, list)
  assert.equal(r.groupId, '')
})

test('inserting into an empty workout still works', () => {
  const r = insertExerciseAfter([] as WorkoutExercise[], -1, ex('Bench'))
  assert.deepEqual(r.exercises.map(e => e.name), ['Bench'])
  assert.equal(r.index, 0)
})

test('a group that is split by a reorder stops calling itself a group', () => {
  const gid = 'g1'
  const grouped = [ex('Bench', 3, { groupId: gid, groupType: 'superset', groupLabel: 'Superset' }), ex('Row', 3, { groupId: gid, groupType: 'superset' }), ex('Squat')]
  // Untouched: still neighbours.
  assert.equal(sanitizeGroups(grouped)[0]!.groupId, gid)
  // Squat dragged between them: the pair is broken, so the labels go.
  const split = [grouped[0]!, grouped[2]!, grouped[1]!]
  const cleaned = sanitizeGroups(split)
  assert.equal(cleaned[0]!.groupId, undefined)
  assert.equal(cleaned[2]!.groupId, undefined)
  assert.equal(cleaned[0]!.groupLabel, undefined)
  // A lone survivor is not a superset either.
  assert.equal(sanitizeGroups([grouped[0]!, grouped[2]!])[0]!.groupId, undefined)
})

test('a workout under the recommended minimum needs more exercises', () => {
  assert.equal(RECOMMENDED_MIN_EXERCISES, 4)
  assert.equal(needsMoreExercises(0), true)
  assert.equal(needsMoreExercises(1), true)
  assert.equal(needsMoreExercises(3), true)
  assert.equal(needsMoreExercises(4), false)
  assert.equal(needsMoreExercises(5), false)
})

test('a thin session you built yourself asks once before it is called done', () => {
  const ask = (exerciseCount: number, selfBuilt = true, alreadyAsked = false) =>
    shouldWarnBeforeFinish({ selfBuilt, exerciseCount, alreadyAsked })

  // Under the recommended count, and self-built: ask.
  assert.equal(ask(1), true)
  assert.equal(ask(3), true)
  // At or over it: nothing to say.
  assert.equal(ask(RECOMMENDED_MIN_EXERCISES), false)
  assert.equal(ask(6), false)
  // A program's short day is the coach's call.
  assert.equal(ask(2, false), false)
  // And it only asks once — "finish anyway" settles it.
  assert.equal(ask(2, true, true), false)
})
