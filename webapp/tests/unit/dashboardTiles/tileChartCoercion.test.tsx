// Run with: npx tsx --test tests/unit/dashboardTiles/tileChartCoercion.test.tsx
//
// Regression: /api/dashboard/tiles serialises DataPoint.t as an ISO STRING over
// JSON, but LineTileChart/BarTileChart are typed for Date. They previously
// called p.t.getTime() directly → "e.t.getTime is not a function" crashed the
// whole dashboard ("This page couldn't load"). These tests render with
// string-typed t and assert no throw.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { LineTileChart } from '../../../components/intelligence/tiles/LineTileChart'
import { BarTileChart } from '../../../components/intelligence/tiles/BarTileChart'
import type { DataPoint } from '../../../lib/metrics/types'

// Mimic the JSON-deserialised shape the API actually delivers: t is a string.
const wireData = [
  { t: '2026-05-26T00:00:00.000Z', value: 10 },
  { t: '2026-05-27T00:00:00.000Z', value: 12 },
  { t: '2026-05-28T00:00:00.000Z', value: 9 },
] as unknown as DataPoint[]

const dateData: DataPoint[] = [
  { t: new Date('2026-05-26T00:00:00Z'), value: 10 },
  { t: new Date('2026-05-27T00:00:00Z'), value: 12 },
]

test('LineTileChart renders with string timestamps (no getTime crash)', () => {
  assert.doesNotThrow(() => renderToStaticMarkup(<LineTileChart data={wireData} />))
})

test('LineTileChart still renders with real Date timestamps', () => {
  assert.doesNotThrow(() => renderToStaticMarkup(<LineTileChart data={dateData} />))
})

test('BarTileChart renders with string timestamps (no getTime crash)', () => {
  assert.doesNotThrow(() => renderToStaticMarkup(<BarTileChart data={wireData} />))
})

test('charts tolerate empty + unparseable points without throwing', () => {
  const junk = [
    { t: 'not-a-date', value: 5 },
    { t: '2026-05-27T00:00:00.000Z', value: Number.NaN },
  ] as unknown as DataPoint[]
  assert.doesNotThrow(() => renderToStaticMarkup(<LineTileChart data={junk} />))
  assert.doesNotThrow(() => renderToStaticMarkup(<LineTileChart data={[]} />))
})
