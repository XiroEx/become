// Run with: npx tsx --test tests/unit/metrics/tiles.test.tsx
//
// Tile rendering tests. Each tile is an async server component, so we
// `await` it to get JSX, then renderToStaticMarkup walks the tree
// (including the 'use client'-marked chart bodies) and emits HTML/SVG
// we can assert against.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  registerMetric,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import type { DataPoint, Metric, MetricWindow } from '../../../lib/metrics/types'
import { LineTile } from '../../../components/intelligence/tiles/LineTile'
import { BarTile } from '../../../components/intelligence/tiles/BarTile'
import { NumberTile } from '../../../components/intelligence/tiles/NumberTile'

const WINDOW: MetricWindow = {
  start: new Date('2026-05-18T00:00:00Z'),
  end: new Date('2026-05-25T00:00:00Z'),
}

function points(values: number[]): DataPoint[] {
  return values.map((v, i) => ({
    t: new Date(Date.UTC(2026, 4, 18 + i)),
    value: v,
  }))
}

function fixtureMetric(overrides: Partial<Metric> = {}): Metric {
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

// --- LineTile -----------------------------------------------------------

test('LineTile: renders TileShell with link + aria-label + Recharts wrapper, no error', async () => {
  registerMetric(fixtureMetric())
  const jsx = await LineTile({ metricId: 'totalWorkoutsThisWeek', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /href="\/dashboard\/insights\/totalWorkoutsThisWeek"/)
  assert.match(html, /aria-label="Workouts this week: 3 workouts — trending up \(good\)"/)
  assert.match(html, /data-testid="line-tile-chart"/)
  // Recharts emits its wrapper div on SSR; the <svg> is hydrated on mount.
  assert.match(html, /class="recharts-wrapper"/)
  assert.match(html, /width:280px;height:96px/)
  assert.doesNotMatch(html, /role="alert"/)
})

test('LineTile: unknown metricId → renders TileShellError (no shell link)', async () => {
  const jsx = await LineTile({ metricId: 'missing', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /role="alert"/)
  assert.match(html, /Unknown metric/)
  assert.doesNotMatch(html, /href="\/dashboard\/insights\/missing"/)
})

// --- BarTile ------------------------------------------------------------

test('BarTile: renders TileShell + Recharts wrapper, aria-label includes trend', async () => {
  registerMetric(
    fixtureMetric({
      id: 'weeklyVolume',
      label: 'Weekly volume',
      unit: 'kg',
      compute: async () => points([100, 150, 200]),
    }),
  )
  const jsx = await BarTile({ metricId: 'weeklyVolume', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /href="\/dashboard\/insights\/weeklyVolume"/)
  assert.match(html, /aria-label="Weekly volume: 200 kg — trending up \(good\)"/)
  assert.match(html, /data-testid="bar-tile-chart"/)
  // Recharts emits its wrapper div on SSR; the <svg> is hydrated on mount.
  assert.match(html, /class="recharts-wrapper"/)
  assert.match(html, /width:280px;height:96px/)
  assert.doesNotMatch(html, /role="alert"/)
})

test('BarTile: compute throws → TileShellError surfaces error message', async () => {
  registerMetric(
    fixtureMetric({
      id: 'boom',
      compute: async () => {
        throw new Error('db down')
      },
    }),
  )
  const jsx = await BarTile({ metricId: 'boom', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /role="alert"/)
  assert.match(html, /db down/)
})

// --- NumberTile ---------------------------------------------------------

test('NumberTile: renders latest value + up arrow + positive delta', async () => {
  registerMetric(fixtureMetric()) // [1,2,3] up-good
  const jsx = await NumberTile({ metricId: 'totalWorkoutsThisWeek', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /href="\/dashboard\/insights\/totalWorkoutsThisWeek"/)
  assert.match(html, /aria-label="Workouts this week: 3 workouts — trending up \(good\)"/)
  // Big value
  assert.match(html, />3</)
  // Unit
  assert.match(html, /workouts/)
  // Arrow + delta vs prior
  assert.match(html, /↑/)
  assert.match(html, /\+1 vs prior/)
})

test('NumberTile: trending down → down arrow + negative delta', async () => {
  registerMetric(
    fixtureMetric({
      id: 'bodyfat',
      label: 'Body fat',
      unit: '%',
      trendDirection: 'down-good',
      compute: async () => points([22, 21]),
    }),
  )
  const jsx = await NumberTile({ metricId: 'bodyfat', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /↓/)
  assert.match(html, /-1 vs prior/)
  assert.match(html, /aria-label="Body fat: 21 % — trending down \(good\)"/)
})

test('NumberTile: single data point → flat arrow + "no prior value"', async () => {
  registerMetric(
    fixtureMetric({
      id: 'singlepoint',
      compute: async () => points([7]),
    }),
  )
  const jsx = await NumberTile({ metricId: 'singlepoint', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /→/)
  assert.match(html, /no prior value/)
})

test('NumberTile: empty data → em-dash placeholder + flat arrow + "no prior value"', async () => {
  registerMetric(
    fixtureMetric({
      id: 'nodata',
      compute: async () => [],
    }),
  )
  const jsx = await NumberTile({ metricId: 'nodata', window: WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, />—</)
  assert.match(html, /no prior value/)
  assert.match(html, /aria-label="Workouts this week: no data yet — trending flat"/)
})
