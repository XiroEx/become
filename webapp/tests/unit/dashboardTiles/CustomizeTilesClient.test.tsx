// Run with: npm run test:file tests/unit/dashboardTiles/CustomizeTilesClient.test.tsx
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CustomizeTilesClient,
  metricsToSummary,
  groupByDomain,
  moveInArray,
  type MetricSummary,
} from '../../../components/intelligence/CustomizeTilesClient'
import type { Metric } from '../../../lib/metrics/types'

const METRICS: MetricSummary[] = [
  { id: 'w-volume', label: 'Weekly volume', unit: 'kg', domain: 'workout' },
  { id: 'w-streak', label: 'Workout streak', unit: 'days', domain: 'workout' },
  { id: 'n-calories', label: 'Daily calories', unit: 'kcal', domain: 'nutrition' },
  { id: 'm-mood', label: 'Daily mood', unit: 'score', domain: 'mindset' },
]

// --- pure helpers -----------------------------------------------------

test('metricsToSummary: drops compute and trendDirection', () => {
  const metrics: Metric[] = [
    {
      id: 'a', label: 'A', unit: 'x', domain: 'workout',
      trendDirection: 'up-good', compute: async () => [],
    },
  ]
  const out = metricsToSummary(metrics)
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], { id: 'a', label: 'A', unit: 'x', domain: 'workout' })
})

test('groupByDomain: partitions metrics + sorts by label within each', () => {
  const grouped = groupByDomain(METRICS)
  assert.deepEqual(
    grouped.workout.map((m) => m.id),
    ['w-volume', 'w-streak'], // 'Weekly volume' < 'Workout streak' by label
  )
  assert.deepEqual(grouped.nutrition.map((m) => m.id), ['n-calories'])
  assert.deepEqual(grouped.mindset.map((m) => m.id), ['m-mood'])
})

test('groupByDomain: empty input → all-empty groups', () => {
  const grouped = groupByDomain([])
  assert.deepEqual(grouped, { workout: [], nutrition: [], mindset: [] })
})

test('moveInArray: from < to', () => {
  assert.deepEqual(moveInArray([1, 2, 3, 4], 0, 2), [2, 3, 1, 4])
})

test('moveInArray: from > to', () => {
  assert.deepEqual(moveInArray([1, 2, 3, 4], 3, 0), [4, 1, 2, 3])
})

test('moveInArray: from === to → unchanged copy', () => {
  const src = [1, 2, 3]
  const out = moveInArray(src, 1, 1)
  assert.deepEqual(out, src)
  assert.notEqual(out, src) // returns a new array
})

// --- component rendering ---------------------------------------------

test('CustomizeTilesClient: renders three domain sections', () => {
  const html = renderToStaticMarkup(
    <CustomizeTilesClient
      availableMetrics={METRICS}
      initialPinned={[]}
    />,
  )
  assert.match(html, /data-testid="domain-workout"/)
  assert.match(html, /data-testid="domain-nutrition"/)
  assert.match(html, /data-testid="domain-mindset"/)
  assert.match(html, />Workout</)
  assert.match(html, />Nutrition</)
  assert.match(html, />Mindset</)
})

test('CustomizeTilesClient: lists every metric grouped under its domain', () => {
  const html = renderToStaticMarkup(
    <CustomizeTilesClient
      availableMetrics={METRICS}
      initialPinned={[]}
    />,
  )
  for (const m of METRICS) {
    assert.match(html, new RegExp(`data-metric-id="${m.id}"`))
  }
})

test('CustomizeTilesClient: empty pinned section shows hint', () => {
  const html = renderToStaticMarkup(
    <CustomizeTilesClient
      availableMetrics={METRICS}
      initialPinned={[]}
    />,
  )
  assert.match(html, /data-testid="pinned-empty"/)
  assert.match(html, /No pinned tiles yet/)
})

test('CustomizeTilesClient: initialPinned ids render in pinned list in given order', () => {
  const html = renderToStaticMarkup(
    <CustomizeTilesClient
      availableMetrics={METRICS}
      initialPinned={['m-mood', 'w-volume']}
    />,
  )
  assert.match(html, /data-testid="pinned-list"/)
  // Both items present
  assert.match(html, /data-testid="pinned-item"[^>]*data-metric-id="m-mood"[^>]*data-index="0"/)
  assert.match(html, /data-testid="pinned-item"[^>]*data-metric-id="w-volume"[^>]*data-index="1"/)
})

test('CustomizeTilesClient: pin toggle reflects pinned state via aria-pressed', () => {
  const html = renderToStaticMarkup(
    <CustomizeTilesClient
      availableMetrics={METRICS}
      initialPinned={['w-volume']}
    />,
  )
  // w-volume → pinned (aria-pressed="true", label "Pinned")
  assert.match(
    html,
    /data-testid="domain-item"[^>]*data-metric-id="w-volume"[^>]*data-pinned="true"/,
  )
  // n-calories → unpinned (aria-pressed="false")
  assert.match(
    html,
    /data-testid="domain-item"[^>]*data-metric-id="n-calories"[^>]*data-pinned="false"/,
  )
})

test('CustomizeTilesClient: ignores pinned ids that have no matching metric (no crash)', () => {
  const html = renderToStaticMarkup(
    <CustomizeTilesClient
      availableMetrics={METRICS}
      initialPinned={['ghost', 'm-mood']}
    />,
  )
  // Only m-mood gets rendered in the pinned list.
  assert.match(html, /data-metric-id="m-mood"[^>]*data-index="0"/)
  assert.doesNotMatch(html, /data-metric-id="ghost"/)
})
