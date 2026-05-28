// Run with: npx tsx --test tests/unit/metrics/heatmapMuscleTiles.test.tsx
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  registerMetric,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import type { DataPoint, Metric, MetricWindow } from '../../../lib/metrics/types'
import {
  HeatmapTile,
  buildHeatmapGrid,
} from '../../../components/intelligence/tiles/HeatmapTile'
import {
  MuscleMapTile,
  buildMuscleIntensities,
  fillForIntensity,
  MUSCLE_REGIONS,
} from '../../../components/intelligence/tiles/MuscleMapTile'

// --- shared fixtures ---------------------------------------------------

// 4-week window: 2026-05-04 (Mon) .. 2026-05-31 (Sun). startOfWeek snaps
// to Sunday 2026-05-03, so the grid starts there.
const FOUR_WEEK_WINDOW: MetricWindow = {
  start: new Date('2026-05-04T00:00:00Z'),
  end: new Date('2026-05-31T00:00:00Z'),
}

function makeMetric(
  id: string,
  compute: Metric['compute'],
  overrides: Partial<Metric> = {},
): Metric {
  return {
    id,
    label: 'Workouts',
    unit: 'workouts',
    domain: 'workout',
    trendDirection: 'up-good',
    compute,
    ...overrides,
  }
}

beforeEach(() => {
  __resetRegistryForTest()
})

// --- buildHeatmapGrid --------------------------------------------------

test('buildHeatmapGrid: empty data → 7 rows, all-zero cells, correct date range', () => {
  const grid = buildHeatmapGrid([], FOUR_WEEK_WINDOW)
  assert.equal(grid.length, 7)
  assert.equal(grid[0].length, 5) // start week + 4 spanning weeks
  for (const row of grid) {
    for (const cell of row) {
      assert.equal(cell.value, 0)
      assert.equal(cell.intensity, 0)
    }
  }
})

test('buildHeatmapGrid: partial data colors matching cells, leaves rest zero', () => {
  const points: DataPoint[] = [
    { t: new Date('2026-05-04T00:00:00Z'), value: 1 },
    { t: new Date('2026-05-07T00:00:00Z'), value: 2 },
    { t: new Date('2026-05-25T00:00:00Z'), value: 4 }, // max → intensity 1
  ]
  const grid = buildHeatmapGrid(points, FOUR_WEEK_WINDOW)
  const cells = grid.flat()
  const lit = cells.filter((c) => c.value > 0)
  assert.equal(lit.length, 3)
  const max = lit.find((c) => c.value === 4)
  assert.ok(max)
  assert.equal(max!.intensity, 1)
  const low = lit.find((c) => c.value === 1)
  assert.ok(low)
  assert.equal(low!.intensity, 0.25)
})

// --- HeatmapTile rendering --------------------------------------------

test('HeatmapTile: empty data → 7×N grid renders, all aria cells say "0 workouts"', async () => {
  registerMetric(makeMetric('empty', async () => []))
  const jsx = await HeatmapTile({ metricId: 'empty', window: FOUR_WEEK_WINDOW })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /data-testid="heatmap-tile-grid"/)
  assert.match(html, /aria-rowcount="7"/)
  assert.match(html, /aria-colcount="5"/)
  assert.match(html, /data-active-days="0"/)
  // every cell is 0 workouts
  const zeroCells = html.match(/: 0 workouts"/g) ?? []
  assert.equal(zeroCells.length, 7 * 5)
})

test('HeatmapTile: partial data → per-cell aria + value attrs match input', async () => {
  registerMetric(
    makeMetric('partial', async () => [
      { t: new Date('2026-05-04T00:00:00Z'), value: 1 },
      { t: new Date('2026-05-25T00:00:00Z'), value: 4 },
    ]),
  )
  const jsx = await HeatmapTile({
    metricId: 'partial',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /aria-label="2026-05-04: 1 workouts"/)
  assert.match(html, /aria-label="2026-05-25: 4 workouts"/)
  // max value gets the brightest cell class
  assert.match(html, /data-day="2026-05-25"[^>]*data-value="4"/)
  assert.match(html, /data-active-days="2"/)
  // outer TileShell still wraps with link + role=img
  assert.match(html, /href="\/dashboard\/insights\/partial"/)
})

test('HeatmapTile: error path → TileShellError, no grid', async () => {
  const jsx = await HeatmapTile({
    metricId: 'unknown',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /role="alert"/)
  assert.doesNotMatch(html, /heatmap-tile-grid/)
})

// --- buildMuscleIntensities -------------------------------------------

test('buildMuscleIntensities: skips points missing label', () => {
  const out = buildMuscleIntensities([
    { t: new Date(), value: 0.8 }, // no label
    { t: new Date(), value: 0.5, label: 'chest' },
  ])
  assert.equal(out.size, 1)
  assert.equal(out.get('chest'), 0.5)
})

test('buildMuscleIntensities: keeps the max value per slug', () => {
  const out = buildMuscleIntensities([
    { t: new Date(), value: 0.4, label: 'chest' },
    { t: new Date(), value: 0.9, label: 'chest' },
    { t: new Date(), value: 0.6, label: 'chest' },
    { t: new Date(), value: 0.2, label: 'lats' },
  ])
  assert.equal(out.get('chest'), 0.9)
  assert.equal(out.get('lats'), 0.2)
})

// --- fillForIntensity --------------------------------------------------

test('fillForIntensity: 0 → neutral, 1 → emerald-300', () => {
  assert.equal(fillForIntensity(0), '#3f3f46')
  assert.equal(fillForIntensity(1), '#6ee7b7')
})

test('fillForIntensity: clamps values outside [0,1]', () => {
  assert.equal(fillForIntensity(-1), '#3f3f46')
  assert.equal(fillForIntensity(2), '#6ee7b7')
})

// --- MuscleMapTile rendering ------------------------------------------

test('MuscleMapTile: empty data → all regions neutral, empty-state message visible', async () => {
  registerMetric(makeMetric('empty-muscle', async () => []))
  const jsx = await MuscleMapTile({
    metricId: 'empty-muscle',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /data-testid="muscle-map-body"/)
  assert.match(html, /data-lit-muscles="0"/)
  assert.match(html, /data-testid="muscle-map-empty"/)
  assert.match(html, /no muscle activity/)
  // every region rect carries fill=#3f3f46 (neutral)
  const neutrals = html.match(/fill="#3f3f46"/g) ?? []
  assert.equal(neutrals.length, MUSCLE_REGIONS.length)
})

test('MuscleMapTile: partial data → only listed muscles colored, aria reflects intensity', async () => {
  registerMetric(
    makeMetric('partial-muscle', async () => [
      { t: new Date(), value: 1.0, label: 'chest' },
      { t: new Date(), value: 0.4, label: 'lats' },
    ]),
  )
  const jsx = await MuscleMapTile({
    metricId: 'partial-muscle',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /data-lit-muscles="2"/)
  assert.match(
    html,
    /data-muscle-slug="chest"[^>]*data-intensity="1\.00"[^>]*aria-label="Chest \(chest\): 1\.00 intensity"/,
  )
  assert.match(
    html,
    /data-muscle-slug="lats"[^>]*data-intensity="0\.40"[^>]*aria-label="Lats \(lats\): 0\.40 intensity"/,
  )
  // emerald fill present for the lit cells; neutral for others
  assert.match(html, /fill="#6ee7b7"/) // chest at 1.0
  assert.match(html, /fill="#047857"/) // lats at 0.4 (bucket emerald-700)
  // empty-state message absent
  assert.doesNotMatch(html, /no muscle activity/)
})

test('MuscleMapTile: renders both front and back silhouettes', async () => {
  registerMetric(makeMetric('any', async () => []))
  const jsx = await MuscleMapTile({
    metricId: 'any',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /data-testid="muscle-map-front"/)
  assert.match(html, /data-testid="muscle-map-back"/)
  assert.match(html, /aria-label="front view"/)
  assert.match(html, /aria-label="back view"/)
})

test('MuscleMapTile: unknown slug in data is silently dropped (does not light any region)', async () => {
  registerMetric(
    makeMetric('weird', async () => [
      { t: new Date(), value: 1, label: 'not-a-muscle' },
    ]),
  )
  const jsx = await MuscleMapTile({
    metricId: 'weird',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  // intensities map has the entry, but no region matches → all neutral fills
  assert.match(html, /data-lit-muscles="1"/)
  const neutrals = html.match(/fill="#3f3f46"/g) ?? []
  assert.equal(neutrals.length, MUSCLE_REGIONS.length)
})

test('MuscleMapTile: error path → TileShellError, no SVG', async () => {
  const jsx = await MuscleMapTile({
    metricId: 'nope',
    window: FOUR_WEEK_WINDOW,
  })
  const html = renderToStaticMarkup(jsx)
  assert.match(html, /role="alert"/)
  assert.doesNotMatch(html, /muscle-map-body/)
})
