// NP-210: the ONE rest-duration rule shared by Live and Track.
//
// Before this card the rule (`getSmartRestDefault` / `getRestDuration`) lived
// only inside LiveWorkoutClient.tsx. Track had no rest timer, so nothing
// exercised it from the Track side. This pins the rule itself, in isolation
// from either view's React state, so Track can reuse it exactly (see
// trackRestTimer.test.ts) rather than inventing a second copy.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseRestTime,
  getSmartRestDefault,
  getRestDuration,
  restGroupContext,
} from '@/lib/workout/restDuration'

describe('parseRestTime', () => {
  it('reads seconds', () => {
    assert.equal(parseRestTime('45s'), 45)
    assert.equal(parseRestTime('90s'), 90)
  })

  it('reads minutes', () => {
    assert.equal(parseRestTime('3min'), 180)
    assert.equal(parseRestTime('1 min'), 60)
  })

  it('falls back to 60 when nothing parses', () => {
    assert.equal(parseRestTime(''), 60)
    assert.equal(parseRestTime('rest'), 60)
  })
})

describe('getSmartRestDefault', () => {
  it('gives heavy compounds (reps_weight) 3 minutes', () => {
    assert.equal(getSmartRestDefault({ trackingType: 'reps_weight' }), '3min')
  })

  it('gives bodyweight/reps-only 90 seconds', () => {
    assert.equal(getSmartRestDefault({ trackingType: 'reps_bodyweight' }), '90s')
    assert.equal(getSmartRestDefault({ trackingType: 'reps_only' }), '90s')
  })

  it('gives everything else (time, time_distance, intervals, none, unset) 60 seconds', () => {
    assert.equal(getSmartRestDefault({ trackingType: 'time' }), '60s')
    assert.equal(getSmartRestDefault({ trackingType: 'none' }), '60s')
    assert.equal(getSmartRestDefault(undefined), '60s')
  })

  it('falls back to the legacy `type` field when trackingType is absent', () => {
    assert.equal(getSmartRestDefault({ type: 'reps_weight' }), '3min')
  })
})

describe('getRestDuration — ungrouped (the default context)', () => {
  it('uses the exercise\'s own rest field when set', () => {
    assert.equal(getRestDuration({ trackingType: 'reps_weight', rest: '45s' }), 45)
  })

  it('falls back to the smart default when rest is unset', () => {
    assert.equal(getRestDuration({ trackingType: 'reps_bodyweight' }), 90)
  })

  it('treats "no context passed" the same as an explicit ungrouped context', () => {
    const exercise = { trackingType: 'reps_weight', rest: '2min' }
    assert.equal(getRestDuration(exercise), getRestDuration(exercise, { inGroup: false, isLastInRound: true }))
  })
})

describe('getRestDuration — inside a superset/circuit group', () => {
  it('gives zero rest mid-round (not the last exercise in the group)', () => {
    const exercise = { trackingType: 'reps_weight', rest: '90s', groupRest: '2min' }
    assert.equal(getRestDuration(exercise, { inGroup: true, isLastInRound: false }), 0)
  })

  it('uses groupRest at the end of the round', () => {
    const exercise = { trackingType: 'reps_weight', rest: '90s', groupRest: '2min' }
    assert.equal(getRestDuration(exercise, { inGroup: true, isLastInRound: true }), 120)
  })

  it('falls back to the exercise\'s own rest, then the smart default, when groupRest is unset', () => {
    assert.equal(
      getRestDuration({ trackingType: 'reps_weight', rest: '45s' }, { inGroup: true, isLastInRound: true }),
      45,
    )
    assert.equal(
      getRestDuration({ trackingType: 'reps_bodyweight' }, { inGroup: true, isLastInRound: true }),
      90,
    )
  })
})

describe('restGroupContext — derives group membership from a flat exercises array', () => {
  it('reports ungrouped for an exercise with no groupId', () => {
    const exercises = [{ groupId: undefined }, { groupId: undefined }]
    assert.deepEqual(restGroupContext(exercises, 0), { inGroup: false, isLastInRound: true })
    assert.deepEqual(restGroupContext(exercises, 1), { inGroup: false, isLastInRound: true })
  })

  it('marks every exercise but the last in a contiguous group as mid-round', () => {
    const exercises = [
      { groupId: 'g1' },
      { groupId: 'g1' },
      { groupId: 'g1' },
      { groupId: undefined },
    ]
    assert.deepEqual(restGroupContext(exercises, 0), { inGroup: true, isLastInRound: false })
    assert.deepEqual(restGroupContext(exercises, 1), { inGroup: true, isLastInRound: false })
    assert.deepEqual(restGroupContext(exercises, 2), { inGroup: true, isLastInRound: true })
    assert.deepEqual(restGroupContext(exercises, 3), { inGroup: false, isLastInRound: true })
  })

  it('handles two separate groups back to back without bleeding into each other', () => {
    const exercises = [
      { groupId: 'g1' },
      { groupId: 'g1' },
      { groupId: 'g2' },
      { groupId: 'g2' },
    ]
    assert.deepEqual(restGroupContext(exercises, 1), { inGroup: true, isLastInRound: true })
    assert.deepEqual(restGroupContext(exercises, 2), { inGroup: true, isLastInRound: false })
    assert.deepEqual(restGroupContext(exercises, 3), { inGroup: true, isLastInRound: true })
  })
})
