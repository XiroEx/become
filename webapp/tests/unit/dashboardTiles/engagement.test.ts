// Run with: npx tsx --test tests/unit/dashboardTiles/engagement.test.ts
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { engagementBoost, rankedRotationKeys, type TileEngagement } from '../../../lib/dashboardTiles/smartRotation'
import { recordTileTap, isValidTileKey } from '../../../lib/dashboardTiles/recordTileTap'
import type { DashboardTileContext } from '../../../lib/dashboardTiles'

const NOW = new Date('2026-06-01T12:00:00Z')

function ctx(over: Partial<DashboardTileContext> = {}): DashboardTileContext {
  return {
    data: { weightData: [], bmiData: [], moodData: [], currentProgram: null,
      stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 } },
    streakData: null, nutritionData: null, weeklyAvailability: 4, weightUnit: 'lbs',
    todaysMood: 4, isMoodUpdating: false, onMoodChange: () => {}, ...over,
  }
}

describe('engagementBoost', () => {
  test('no engagement → no boost (1.0)', () => {
    assert.equal(engagementBoost(undefined, NOW), 1)
    assert.equal(engagementBoost({ key: 'stat:goal', taps: 0 }, NOW), 1)
  })
  test('more taps → larger boost, but saturating and bounded ≤1.5', () => {
    const few = engagementBoost({ key: 'stat:goal', taps: 1, lastTapAt: NOW.toISOString() }, NOW)
    const many = engagementBoost({ key: 'stat:goal', taps: 50, lastTapAt: NOW.toISOString() }, NOW)
    assert.ok(few > 1 && few < many)
    assert.ok(many <= 1.5)
  })
  test('stale taps decay toward no boost', () => {
    const fresh = engagementBoost({ key: 'stat:goal', taps: 5, lastTapAt: NOW.toISOString() }, NOW)
    const old = engagementBoost({ key: 'stat:goal', taps: 5, lastTapAt: new Date('2026-03-01T00:00:00Z').toISOString() }, NOW)
    assert.ok(fresh > old)
    assert.equal(old, 1) // >45 days → fully decayed
  })
})

describe('rankedRotationKeys with engagement', () => {
  test('a heavily-tapped low-base card is nudged up but actionable stays reachable', () => {
    // goal has a low base (0.4); tap it a lot → should rise above workouts (0.3).
    const eng: TileEngagement[] = [{ key: 'stat:goal', taps: 20, lastTapAt: NOW.toISOString() }]
    const keys = rankedRotationKeys({ statIds: ['workouts', 'goal'], metricIds: [], ctx: ctx(), engagement: eng, now: NOW })
    assert.ok(keys.indexOf('stat:goal') < keys.indexOf('stat:workouts'))
  })
  test('gentle: engagement never drops total count or removes a card', () => {
    const eng: TileEngagement[] = [{ key: 'stat:goal', taps: 99, lastTapAt: NOW.toISOString() }]
    const keys = rankedRotationKeys({ statIds: ['streak', 'goal', 'weekly'], metricIds: ['m1'], ctx: ctx(), engagement: eng, now: NOW })
    assert.equal(keys.length, 4)
    assert.equal(new Set(keys).size, 4)
  })
  test('no engagement reproduces the non-adaptive ordering', () => {
    const a = rankedRotationKeys({ statIds: ['streak', 'goal'], metricIds: ['m1'], ctx: ctx(), now: NOW })
    const b = rankedRotationKeys({ statIds: ['streak', 'goal'], metricIds: ['m1'], ctx: ctx(), engagement: [], now: NOW })
    assert.deepEqual(a, b)
  })
})

describe('recordTileTap', () => {
  test('rejects malformed keys', () => {
    assert.equal(isValidTileKey('stat:mood'), true)
    assert.equal(isValidTileKey('metric:workout.prs-timeline'), true)
    assert.equal(isValidTileKey('bogus'), false)
    assert.equal(isValidTileKey(42), false)
    assert.equal(recordTileTap([], 'bogus', NOW).changed, false)
  })
  test('appends a new key with taps=1', () => {
    const { next, changed } = recordTileTap([], 'stat:mood', NOW)
    assert.equal(changed, true)
    assert.deepEqual(next, [{ key: 'stat:mood', taps: 1, lastTapAt: NOW.toISOString() }])
  })
  test('increments + restamps an existing key in place', () => {
    const prev: TileEngagement[] = [{ key: 'stat:mood', taps: 2, lastTapAt: '2026-05-01T00:00:00.000Z' }]
    const { next } = recordTileTap(prev, 'stat:mood', NOW)
    assert.equal(next.length, 1)
    assert.equal(next[0].taps, 3)
    assert.equal(next[0].lastTapAt, NOW.toISOString())
  })
  test('does not mutate the input array', () => {
    const prev: TileEngagement[] = [{ key: 'stat:mood', taps: 1, lastTapAt: NOW.toISOString() }]
    recordTileTap(prev, 'stat:mood', NOW)
    assert.equal(prev[0].taps, 1)
  })
})
