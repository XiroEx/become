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
  moveExercise,
  canRemoveExercise,
  RECOMMENDED_MIN_EXERCISES,
  DEFAULT_SETS,
  defaultSetsFor,
  agreesOnSets,
  alignCircuitSets,
  setSetsAt,
  setGroupKindAt,
  addNextIntoGroup,
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

test('an exercise can be moved, and its set data goes with it', () => {
  const list = [ex('Bench'), ex('Squat'), ex('Row')]
  const down = moveExercise(list, 0, 1)
  assert.deepEqual(down.exercises.map(e => e.name), ['Squat', 'Bench', 'Row'])
  assert.deepEqual(down.order, [1, 0, 2])
  assert.deepEqual(applyOrder([['b'], ['s'], ['r']], down.order, () => ['new']), [['s'], ['b'], ['r']])

  const up = moveExercise(list, 2, 0)
  assert.deepEqual(up.exercises.map(e => e.name), ['Row', 'Bench', 'Squat'])

  // Off either end, or nowhere at all, changes nothing.
  assert.equal(moveExercise(list, 0, 0).exercises, list)
  assert.equal(moveExercise(list, 0, 5).exercises, list)
  assert.equal(moveExercise(list, -1, 1).exercises, list)
})

test('moving an exercise out of a superset dissolves the group', () => {
  const gid = 'g1'
  const list = [
    ex('Bench', 3, { groupId: gid, groupType: 'superset', groupLabel: 'Superset' }),
    ex('Row', 3, { groupId: gid, groupType: 'superset', groupLabel: 'Superset' }),
    ex('Squat'),
  ]
  // Squat jumps between the pair: they are no longer neighbours, so they are
  // no longer a superset — the flow would have stopped interleaving them.
  const r = moveExercise(list, 2, 1)
  assert.deepEqual(r.exercises.map(e => e.name), ['Bench', 'Squat', 'Row'])
  assert.equal(r.exercises[0]!.groupId, undefined)
  assert.equal(r.exercises[2]!.groupId, undefined)
})

test('the last exercise cannot be removed', () => {
  assert.equal(canRemoveExercise([ex('Bench')]), false)
  assert.equal(canRemoveExercise([ex('Bench'), ex('Row')]), true)
  assert.equal(canRemoveExercise([]), false)
})

// ── Circuits: one set count for the whole block ──────────────────────────────
//
// Card: "if you make a circuit every exercise after the first one should agree
// on sets as the first. The way we have it now is that u have to manually
// choose the sets when u add a new exercise." Reported with a 3-set goblet
// squat dropped into a 5-set jump rope and turned into a circuit.

test('a new exercise defaults to the first exercise\'s set count, not a flat 3', () => {
  assert.equal(DEFAULT_SETS, 3)
  // Nothing to agree with yet.
  assert.equal(defaultSetsFor([]), 3)
  // The first exercise is the one the session was built around.
  assert.equal(defaultSetsFor([ex('Jump Rope', 5), ex('Row', 2)]), 5)
  // Junk and missing counts fall back rather than producing a zero-set row.
  assert.equal(defaultSetsFor([{}]), 3)
  assert.equal(defaultSetsFor([{ sets: 0 }]), 3)
  assert.equal(defaultSetsFor([{ sets: 4.7 }]), 4)
})

test('only a circuit holds its members to one set count', () => {
  assert.equal(agreesOnSets('circuit'), true)
  assert.equal(agreesOnSets('superset'), false)
  assert.equal(agreesOnSets('triset'), false)
  assert.equal(agreesOnSets(undefined), false)
})

test('making a circuit brings every member onto the first one\'s rounds', () => {
  // The reported case: 5-set jump rope, then a 3-set goblet squat.
  const list = [ex('Jump Rope', 5), ex('Goblet Squat', 3)]
  const r = groupIndexes(list, [0, 1], 'circuit')
  assert.deepEqual(r.exercises.map(e => e.sets), [5, 5])
  assert.deepEqual(r.exercises.map(e => e.groupRounds), [5, 5])
  assert.equal(r.exercises[0]!.groupLabel, 'Circuit')
  // Every round now has both exercises in it — five rounds of two.
  const flow = buildWorkoutFlow(r.exercises)
  assert.equal(flow.length, 10)
  assert.deepEqual(flow.map(s => s.exerciseIndex), [0, 1, 0, 1, 0, 1, 0, 1, 0, 1])

  // A superset is left exactly as it was: 5 of one and 3 of the other is a
  // legitimate thing to ask for outside a circuit.
  const sup = groupIndexes(list, [0, 1], 'superset')
  assert.deepEqual(sup.exercises.map(e => e.sets), [5, 3])
  assert.equal(sup.exercises[0]!.groupRounds, undefined)

  // An explicit round count still wins over the first exercise's.
  const explicit = groupIndexes(list, [0, 1], 'circuit', { rounds: 4 })
  assert.deepEqual(explicit.exercises.map(e => e.sets), [4, 4])
  assert.deepEqual(explicit.exercises.map(e => e.groupRounds), [4, 4])
})

test('joining a circuit mid-session takes the circuit\'s rounds', () => {
  const gid = 'g1'
  const circuit = [
    ex('Jump Rope', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
    ex('Goblet Squat', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
  ]
  const r = addIntoGroup(circuit, 0, ex('Push Up', 2))
  assert.deepEqual(r.exercises.map(e => e.name), ['Jump Rope', 'Goblet Squat', 'Push Up'])
  assert.deepEqual(r.exercises.map(e => e.sets), [5, 5, 5])

  // Joining a superset does not: the pair was never held to one count.
  const superset = circuit.map(e => ({ ...e, groupType: 'superset', groupLabel: 'Superset' }))
  const s = addIntoGroup(superset, 0, ex('Push Up', 2))
  assert.deepEqual(s.exercises.map(e => e.sets), [5, 5, 2])
})

test('a circuit that already disagrees is repaired, and nothing else is touched', () => {
  const gid = 'g1'
  const broken = [
    ex('Jump Rope', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
    ex('Goblet Squat', 3, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
    ex('Curl', 2),
  ]
  const fixed = alignCircuitSets(broken)
  assert.deepEqual(fixed.map(e => e.sets), [5, 5, 2])
  assert.deepEqual(fixed.map(e => e.groupRounds), [5, 5, undefined])

  // Already in agreement: the same array back, so React does not re-render.
  assert.equal(alignCircuitSets(fixed), fixed)

  // A superset is never rewritten, and a lone exercise is not a circuit.
  const sup = [
    ex('Bench', 5, { groupId: gid, groupType: 'superset' }),
    ex('Row', 3, { groupId: gid, groupType: 'superset' }),
  ]
  assert.equal(alignCircuitSets(sup), sup)
  const lonely = [ex('Bench', 5, { groupId: gid, groupType: 'circuit' }), ex('Row', 3)]
  assert.equal(alignCircuitSets(lonely), lonely)
})

test('repairing a saved circuit is what makes it runnable', () => {
  // A circuit as it comes back from storage — written before the agreement
  // rule existed, or by a coach in the program editor, which lets every
  // exercise carry its own set count.
  const gid = 'g1'
  const saved = [
    ex('Jump Rope', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
    ex('Goblet Squat', 3, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
  ]

  // As stored: `buildWorkoutFlow` walks max(sets) = 5 rounds but only emits a
  // step where the member has a set left, so rounds 4 and 5 are a "circuit"
  // of one exercise. That is the shape the member photographed.
  const asStored = buildWorkoutFlow(saved)
  assert.equal(asStored.length, 8)
  assert.deepEqual(asStored.map(s => s.exerciseIndex), [0, 1, 0, 1, 0, 1, 0, 0])

  // Aligned at load: five rounds of two, every round whole.
  const flow = buildWorkoutFlow(alignCircuitSets(saved))
  assert.equal(flow.length, 10)
  assert.deepEqual(flow.map(s => s.exerciseIndex), [0, 1, 0, 1, 0, 1, 0, 1, 0, 1])
  // And the grid a host builds from `ex.sets` now has a row for every step.
  assert.deepEqual(alignCircuitSets(saved).map(e => e.sets), [5, 5])
})

test('editing any member of a circuit edits the circuit; outside one, only the row', () => {
  const gid = 'g1'
  const list = [
    ex('Jump Rope', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
    ex('Goblet Squat', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit' }),
    ex('Curl', 2),
  ]
  // The member asked for three rounds of the circuit, not for a broken one.
  const r = setSetsAt(list, 1, 3)
  assert.deepEqual(r.map(e => e.sets), [3, 3, 2])
  assert.deepEqual(r.map(e => e.groupRounds), [3, 3, undefined])

  // An exercise on its own moves alone.
  assert.deepEqual(setSetsAt(list, 2, 4).map(e => e.sets), [5, 5, 4])
  // Nonsense is clamped to a workout that can be run, and a bad index is a no-op.
  assert.equal(setSetsAt(list, 2, 0)[2]!.sets, 1)
  assert.equal(setSetsAt(list, 99, 4), list)
})

test('a superset can be re-badged as a circuit from the builder', () => {
  const gid = 'g1'
  const pair = [
    ex('Jump Rope', 5, { groupId: gid, groupType: 'superset', groupLabel: 'Superset' }),
    ex('Goblet Squat', 3, { groupId: gid, groupType: 'superset', groupLabel: 'Superset' }),
    ex('Curl', 2),
  ]
  const circuit = setGroupKindAt(pair, 1, 'circuit')
  assert.deepEqual(circuit.exercises.map(e => e.groupType), ['circuit', 'circuit', undefined])
  assert.deepEqual(circuit.exercises.map(e => e.groupLabel), ['Circuit', 'Circuit', undefined])
  // Switching TO a circuit is what makes the rounds agree.
  assert.deepEqual(circuit.exercises.map(e => e.sets), [5, 5, 2])
  // Nothing moves, so no caller has to permute its set data.
  assert.deepEqual(circuit.order, [0, 1, 2])

  // Back to a superset: the numbers are the member's now, not the block's.
  const back = setGroupKindAt(circuit.exercises, 0, 'superset')
  assert.deepEqual(back.exercises.map(e => e.groupType), ['superset', 'superset', undefined])
  assert.deepEqual(back.exercises.map(e => e.sets), [5, 5, 2])

  // An ungrouped exercise has no kind to set.
  assert.equal(setGroupKindAt(pair, 2, 'circuit').exercises, pair)
})

test('a pair grows into a real circuit of three', () => {
  const gid = 'g1'
  const list = [
    ex('Jump Rope', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit', groupRounds: 5 }),
    ex('Goblet Squat', 5, { groupId: gid, groupType: 'circuit', groupLabel: 'Circuit', groupRounds: 5 }),
    ex('Push Up', 2),
    ex('Curl', 3),
  ]
  // Reached from the last member of the group — the exercise below it joins.
  const r = addNextIntoGroup(list, 1)
  assert.equal(r.groupId, gid)
  assert.deepEqual(r.exercises.map(e => e.groupId), [gid, gid, gid, undefined])
  assert.deepEqual(r.exercises.map(e => e.sets), [5, 5, 5, 3])
  assert.deepEqual(r.order, [0, 1, 2, 3])
  assert.equal(groupExercises(r.exercises)[0]!.exercises.length, 3)

  // Reaching it from the group's head finds the same neighbour.
  assert.deepEqual(addNextIntoGroup(list, 0).exercises.map(e => e.groupId), [gid, gid, gid, undefined])

  // Nothing below the group, or no group at all: nothing happens.
  const atEnd = [list[0]!, list[1]!]
  assert.equal(addNextIntoGroup(atEnd, 0).exercises, atEnd)
  assert.equal(addNextIntoGroup(list, 2).exercises, list)
})
