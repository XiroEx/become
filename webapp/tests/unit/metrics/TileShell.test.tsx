// Run with: npm run test:file tests/unit/metrics/TileShell.test.tsx
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  TileShell,
  TileShellSkeleton,
  TileShellError,
} from '../../../components/intelligence/tiles/TileShell'
import type { Metric, DataPoint } from '../../../lib/metrics/types'

const M: Metric = {
  id: 'totalWorkoutsThisWeek',
  label: 'Workouts this week',
  unit: 'workouts',
  domain: 'workout',
  trendDirection: 'up-good',
  goalValue: 4,
  compute: async () => [],
}

const LATEST: DataPoint = { t: new Date('2026-05-25T00:00:00Z'), value: 3 }

test('TileShell: renders Link to /dashboard/insights/<id> with aria-label', () => {
  const html = renderToStaticMarkup(
    TileShell({
      metric: M,
      latest: LATEST,
      trend: 'up',
      children: 'BODY',
    }),
  )
  assert.match(html, /href="\/dashboard\/insights\/totalWorkoutsThisWeek"/)
  assert.match(html, /aria-label="Workouts this week: 3 workouts — trending up \(good\)"/)
  assert.match(html, /data-metric-id="totalWorkoutsThisWeek"/)
  assert.match(html, /data-trend="up"/)
  assert.match(html, /role="img"/)
  assert.match(html, /BODY/)
})

test('TileShell: renders goal label when goalValue set', () => {
  const html = renderToStaticMarkup(
    TileShell({ metric: M, latest: LATEST, trend: 'up', children: null }),
  )
  assert.match(html, /goal 4 workouts/)
})

test('TileShell: omits goal label when goalValue undefined', () => {
  const noGoal: Metric = { ...M, goalValue: undefined }
  const html = renderToStaticMarkup(
    TileShell({ metric: noGoal, latest: LATEST, trend: 'up', children: null }),
  )
  assert.doesNotMatch(html, /goal/i)
})

test('TileShell: null latest renders "no data yet" in aria-label', () => {
  const html = renderToStaticMarkup(
    TileShell({ metric: M, latest: null, trend: 'flat', children: null }),
  )
  assert.match(html, /aria-label="Workouts this week: no data yet — trending flat"/)
})

test('TileShellSkeleton: renders with aria-busy and role=status', () => {
  const html = renderToStaticMarkup(TileShellSkeleton({}))
  assert.match(html, /role="status"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /animate-pulse/)
})

test('TileShellError: renders message + role=alert', () => {
  const html = renderToStaticMarkup(
    TileShellError({ message: 'db down', metricId: 'foo' }),
  )
  assert.match(html, /role="alert"/)
  assert.match(html, /db down/)
  assert.match(html, /data-metric-id="foo"/)
  assert.match(html, /Tile error/)
})

test('TileShell: does not import recharts', async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const src = await fs.readFile(
    path.resolve(
      process.cwd(),
      'components/intelligence/tiles/TileShell.tsx',
    ),
    'utf8',
  )
  // Strip line + block comments before checking — the source-of-truth is
  // the import surface, not human-readable prose.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /from\s+['"]recharts['"]/)
  assert.doesNotMatch(code, /require\(['"]recharts['"]\)/)
})
