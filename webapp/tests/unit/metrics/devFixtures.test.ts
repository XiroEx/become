// Run with: npm run test:file tests/unit/metrics/devFixtures.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveMetric,
  listAllMetrics,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import {
  DEV_FIXTURE_METRICS,
  ensureDevFixturesRegistered,
} from '../../../lib/metrics/devFixtures'

beforeEach(() => {
  __resetRegistryForTest()
})

test('DEV_FIXTURE_METRICS: provides one metric per tile type, all _dev_-prefixed', () => {
  assert.equal(DEV_FIXTURE_METRICS.length, 8)
  for (const m of DEV_FIXTURE_METRICS) {
    assert.match(m.id, /^_dev_/)
  }
  const ids = DEV_FIXTURE_METRICS.map((m) => m.id).sort()
  assert.deepEqual(ids, [
    '_dev_bar_volume',
    '_dev_bar_volume_by_muscle',
    '_dev_heatmap_activity',
    '_dev_line_prs_timeline',
    '_dev_line_strength_curve',
    '_dev_line_workouts',
    '_dev_muscle_intensity',
    '_dev_number_streak',
  ])
})

test('ensureDevFixturesRegistered: registers all 8 fixtures', () => {
  assert.equal(listAllMetrics().length, 0)
  ensureDevFixturesRegistered()
  assert.equal(listAllMetrics().length, 8)
  for (const m of DEV_FIXTURE_METRICS) {
    assert.ok(resolveMetric(m.id), `expected to find ${m.id}`)
  }
})

test('ensureDevFixturesRegistered: idempotent — second call does not throw', () => {
  ensureDevFixturesRegistered()
  ensureDevFixturesRegistered() // would throw on duplicate id without the guard
  assert.equal(listAllMetrics().length, 8)
})

test('fixture compute() functions all return DataPoint[] with positive values', async () => {
  ensureDevFixturesRegistered()
  for (const m of DEV_FIXTURE_METRICS) {
    const data = await m.compute('test_user', {
      start: new Date('2028-05-01T00:00:00Z'),
      end: new Date('2028-05-28T00:00:00Z'),
    })
    assert.ok(Array.isArray(data), `${m.id} should return array`)
    assert.ok(data.length > 0, `${m.id} should return non-empty data`)
    for (const p of data) {
      assert.ok(p.t instanceof Date)
      assert.equal(typeof p.value, 'number')
    }
  }
})

test('muscle-intensity fixture uses recognized muscle slugs', async () => {
  ensureDevFixturesRegistered()
  const m = resolveMetric('_dev_muscle_intensity')!
  const data = await m.compute('u', {
    start: new Date(),
    end: new Date(),
  })
  for (const p of data) {
    assert.ok(p.label, 'every muscle data point should carry a slug label')
  }
})
