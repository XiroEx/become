// Run with: npx tsx --test tests/unit/metrics/useMetricData.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  registerMetric,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import {
  deriveLatest,
  deriveTrend,
  ariaLabelForMetric,
  tileHref,
  useMetricData,
  fetchMetricData,
} from '../../../lib/metrics/useMetricData'
import type { DataPoint, Metric, MetricWindow } from '../../../lib/metrics/types'

const WINDOW: MetricWindow = {
  start: new Date('2026-05-18T00:00:00Z'),
  end: new Date('2026-05-25T00:00:00Z'),
}

function points(values: number[]): DataPoint[] {
  return values.map((v, i) => ({
    t: new Date(2026, 4, 18 + i),
    value: v,
  }))
}

function metric(overrides: Partial<Metric> = {}): Metric {
  return {
    id: 'totalWorkoutsThisWeek',
    label: 'Workouts this week',
    unit: 'workouts',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => points([1, 2, 3]),
    ...overrides,
  }
}

beforeEach(() => {
  __resetRegistryForTest()
})

// --- deriveLatest --------------------------------------------------------

test('deriveLatest: empty array → null', () => {
  assert.equal(deriveLatest([]), null)
})

test('deriveLatest: single point → that point', () => {
  const p = points([5])
  assert.equal(deriveLatest(p), p[0])
})

test('deriveLatest: multi → last point (chronological order assumed)', () => {
  const p = points([1, 2, 3])
  assert.equal(deriveLatest(p), p[2])
})

// --- deriveTrend ---------------------------------------------------------

test('deriveTrend: empty → flat', () => {
  assert.equal(deriveTrend([]), 'flat')
})

test('deriveTrend: single point → flat (no prior to compare)', () => {
  assert.equal(deriveTrend(points([5])), 'flat')
})

test('deriveTrend: rising → up', () => {
  assert.equal(deriveTrend(points([1, 2, 3])), 'up')
})

test('deriveTrend: falling → down', () => {
  assert.equal(deriveTrend(points([3, 2, 1])), 'down')
})

test('deriveTrend: equal last two → flat', () => {
  assert.equal(deriveTrend(points([5, 5])), 'flat')
})

// --- ariaLabelForMetric --------------------------------------------------

test('aria: up-good metric trending up → "good"', () => {
  const m = metric({ trendDirection: 'up-good' })
  const label = ariaLabelForMetric(m, points([1, 2])[1], 'up')
  assert.match(label, /Workouts this week/)
  assert.match(label, /2 workouts/)
  assert.match(label, /trending up \(good\)/)
})

test('aria: up-good metric trending down → "bad"', () => {
  const m = metric({ trendDirection: 'up-good' })
  const label = ariaLabelForMetric(m, points([1])[0], 'down')
  assert.match(label, /trending down \(bad\)/)
})

test('aria: down-good metric trending down → "good"', () => {
  const m = metric({ trendDirection: 'down-good', label: 'Resting HR', unit: 'bpm' })
  const label = ariaLabelForMetric(m, points([55])[0], 'down')
  assert.match(label, /Resting HR/)
  assert.match(label, /55 bpm/)
  assert.match(label, /trending down \(good\)/)
})

test('aria: neutral direction does not annotate good/bad', () => {
  const m = metric({ trendDirection: 'neutral' })
  const label = ariaLabelForMetric(m, points([7])[0], 'up')
  assert.match(label, /trending up$/)
  assert.doesNotMatch(label, /good|bad/)
})

test('aria: flat trend reports "trending flat"', () => {
  const m = metric({ trendDirection: 'up-good' })
  const label = ariaLabelForMetric(m, points([2])[0], 'flat')
  assert.match(label, /trending flat/)
})

test('aria: null latest → "no data yet"', () => {
  const label = ariaLabelForMetric(metric(), null, 'flat')
  assert.match(label, /no data yet/)
})

test('aria: trims trailing zeros on decimal values', () => {
  const m = metric({ unit: 'kg' })
  const label = ariaLabelForMetric(m, { t: new Date(), value: 72.5 }, 'up')
  assert.match(label, /72\.5 kg/)
})

// --- tileHref ------------------------------------------------------------

test('tileHref: simple id', () => {
  assert.equal(tileHref('workouts'), '/dashboard/insights/workouts')
})

test('tileHref: encodes slashes / spaces in metric id', () => {
  assert.equal(
    tileHref('weird id/with space'),
    '/dashboard/insights/weird%20id%2Fwith%20space',
  )
})

// --- useMetricData / fetchMetricData -------------------------------------

test('useMetricData: registered metric → status=ok with derived latest/trend', async () => {
  registerMetric(metric())
  const r = await useMetricData('totalWorkoutsThisWeek', WINDOW)
  assert.equal(r.status, 'ok')
  if (r.status !== 'ok') return
  assert.equal(r.data.length, 3)
  assert.equal(r.latest!.value, 3)
  assert.equal(r.trend, 'up')
  assert.equal(r.metric.id, 'totalWorkoutsThisWeek')
})

test('useMetricData: unknown metricId → status=error, metric=null', async () => {
  const r = await useMetricData('nope', WINDOW)
  assert.equal(r.status, 'error')
  if (r.status !== 'error') return
  assert.equal(r.metric, null)
  assert.match(r.error, /Unknown metric/)
})

test('useMetricData: compute throws → status=error, metric preserved', async () => {
  registerMetric(
    metric({
      id: 'boom',
      compute: async () => {
        throw new Error('db down')
      },
    }),
  )
  const r = await useMetricData('boom', WINDOW)
  assert.equal(r.status, 'error')
  if (r.status !== 'error') return
  assert.equal(r.metric?.id, 'boom')
  assert.match(r.error, /db down/)
})

test('fetchMetricData: passes userId through to compute', async () => {
  let seenUser = ''
  registerMetric(
    metric({
      id: 'capture',
      compute: async (userId) => {
        seenUser = userId
        return points([1])
      },
    }),
  )
  const r = await fetchMetricData('capture', 'user_xyz', WINDOW)
  assert.equal(r.status, 'ok')
  assert.equal(seenUser, 'user_xyz')
})
