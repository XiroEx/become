// Run with: npx tsx --test tests/unit/dashboardTiles/smartRotation.test.ts
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { scoreStatTile, rankedRotationKeys } from '../../../lib/dashboardTiles/smartRotation'
import type { DashboardTileContext } from '../../../lib/dashboardTiles'

function ctx(over: Partial<DashboardTileContext> = {}): DashboardTileContext {
  return {
    data: {
      weightData: [],
      bmiData: [],
      moodData: [],
      currentProgram: null,
      stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 },
    },
    streakData: null,
    nutritionData: null,
    weeklyAvailability: 4,
    weightUnit: 'lbs',
    todaysMood: null,
    isMoodUpdating: false,
    onMoodChange: () => {},
    ...over,
  }
}

describe('scoreStatTile actionability', () => {
  test('mood scores highest when not logged today, lower once logged', () => {
    assert.ok(scoreStatTile('mood', ctx({ todaysMood: null })) > scoreStatTile('mood', ctx({ todaysMood: 4 })))
  })

  test('streak at risk (no activity today) outranks a settled streak', () => {
    const atRisk = ctx({ streakData: { streakDays: 10, longestStreak: 10, streakFreezes: 0, milestonesReached: [], activityToday: false, nextMilestone: 14 } })
    const safe = ctx({ streakData: { streakDays: 10, longestStreak: 10, streakFreezes: 0, milestonesReached: [], activityToday: true, nextMilestone: 14 } })
    assert.ok(scoreStatTile('streak', atRisk) > scoreStatTile('streak', safe))
  })

  test('weight prompts a first weigh-in when there is no data', () => {
    const none = ctx()
    const some = ctx({ data: { ...ctx().data, weightData: [{ date: 'x', value: 180 }] } })
    assert.ok(scoreStatTile('weight', none) > scoreStatTile('weight', some))
  })

  test('all scores are within [0,1]', () => {
    for (const id of ['streak', 'mood', 'weekly', 'goal', 'calories', 'water', 'weight', 'workouts'] as const) {
      const s = scoreStatTile(id, ctx())
      assert.ok(s >= 0 && s <= 1, `${id} -> ${s}`)
    }
  })
})

describe('rankedRotationKeys', () => {
  test('an actionable stat (mood not logged) can lead the rotation', () => {
    const keys = rankedRotationKeys({ statIds: ['workouts', 'mood'], metricIds: [], ctx: ctx({ todaysMood: null }) })
    assert.equal(keys[0], 'stat:mood')
  })

  test('metrics keep their incoming relative order', () => {
    const keys = rankedRotationKeys({ statIds: [], metricIds: ['m1', 'm2', 'm3'], ctx: ctx() })
    assert.deepEqual(keys, ['metric:m1', 'metric:m2', 'metric:m3'])
  })

  test('returns every input exactly once (no drops/dupes)', () => {
    const keys = rankedRotationKeys({ statIds: ['streak', 'mood', 'weekly'], metricIds: ['m1', 'm2'], ctx: ctx() })
    assert.equal(keys.length, 5)
    assert.equal(new Set(keys).size, 5)
  })

  test('deterministic for fixed inputs', () => {
    const a = rankedRotationKeys({ statIds: ['streak', 'goal', 'water'], metricIds: ['m1'], ctx: ctx() })
    const b = rankedRotationKeys({ statIds: ['streak', 'goal', 'water'], metricIds: ['m1'], ctx: ctx() })
    assert.deepEqual(a, b)
  })
})
