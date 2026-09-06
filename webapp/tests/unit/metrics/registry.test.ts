// Run with: npm run test:file tests/unit/metrics/registry.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  registerMetric,
  resolveMetric,
  listMetricsForDomain,
  listAllMetrics,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import type { Metric, DataPoint, MetricWindow } from '../../../lib/metrics/types'

function makeMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    id: 'totalWorkoutsThisWeek',
    label: 'Workouts this week',
    unit: 'workouts',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async (_userId: string, _w: MetricWindow): Promise<DataPoint[]> => [
      { t: new Date('2026-05-25T00:00:00Z'), value: 3 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  __resetRegistryForTest()
})

test('registry: registers + resolves by id', () => {
  const m = makeMetric()
  registerMetric(m)
  assert.equal(resolveMetric('totalWorkoutsThisWeek'), m)
})

test('registry: resolveMetric returns undefined for unknown id', () => {
  assert.equal(resolveMetric('nope'), undefined)
})

test('registry: duplicate id throws', () => {
  registerMetric(makeMetric())
  assert.throws(
    () => registerMetric(makeMetric()),
    /already registered/,
  )
})

test('registry: listMetricsForDomain returns only matching domain', () => {
  registerMetric(makeMetric({ id: 'a', domain: 'workout' }))
  registerMetric(makeMetric({ id: 'b', domain: 'nutrition' }))
  registerMetric(makeMetric({ id: 'c', domain: 'mindset' }))
  registerMetric(makeMetric({ id: 'd', domain: 'workout' }))

  const workout = listMetricsForDomain('workout').map((m) => m.id).sort()
  assert.deepEqual(workout, ['a', 'd'])
  assert.deepEqual(listMetricsForDomain('nutrition').map((m) => m.id), ['b'])
  assert.deepEqual(listMetricsForDomain('mindset').map((m) => m.id), ['c'])
})

test('registry: listAllMetrics returns every registered metric', () => {
  registerMetric(makeMetric({ id: 'a' }))
  registerMetric(makeMetric({ id: 'b', domain: 'nutrition' }))
  const ids = listAllMetrics().map((m) => m.id).sort()
  assert.deepEqual(ids, ['a', 'b'])
})

test('registry: __resetRegistryForTest clears all entries', () => {
  registerMetric(makeMetric())
  assert.equal(listAllMetrics().length, 1)
  __resetRegistryForTest()
  assert.equal(listAllMetrics().length, 0)
  assert.equal(resolveMetric('totalWorkoutsThisWeek'), undefined)
})

test('registry: registered metric compute() returns DataPoint[]', async () => {
  const m = makeMetric()
  registerMetric(m)
  const resolved = resolveMetric('totalWorkoutsThisWeek')
  assert.ok(resolved)
  const points = await resolved!.compute('user_1', {
    start: new Date('2026-05-18T00:00:00Z'),
    end: new Date('2026-05-25T00:00:00Z'),
  })
  assert.equal(points.length, 1)
  assert.equal(points[0].value, 3)
  assert.ok(points[0].t instanceof Date)
})

test('registry: metric with goalValue + down-good trend round-trips', () => {
  registerMetric(
    makeMetric({
      id: 'restingHeartRate',
      label: 'Resting heart rate',
      unit: 'bpm',
      domain: 'mindset',
      trendDirection: 'down-good',
      goalValue: 55,
    }),
  )
  const m = resolveMetric('restingHeartRate')
  assert.ok(m)
  assert.equal(m!.trendDirection, 'down-good')
  assert.equal(m!.goalValue, 55)
})
