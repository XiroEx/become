// Run with: npx tsx --test tests/unit/dashboardTiles/dashboard-tiles-route.test.ts
//
// Tests the auth gate on GET /api/dashboard/tiles. The 200 path touches
// MongoDB (and the rotator's persistence side-effect) and is covered by
// the helper unit tests + a Playwright spec.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from '../../../app/api/dashboard/tiles/route'

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/dashboard/tiles', {
    method: 'GET',
    headers,
  })
}

test('GET /api/dashboard/tiles: no auth → 401', async () => {
  const res = await GET(makeRequest())
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Unauthorized/)
})

test('GET /api/dashboard/tiles: invalid JWT → 401', async () => {
  const res = await GET(makeRequest('Bearer garbage'))
  assert.equal(res.status, 401)
})

// --- shape contract -----------------------------------------------------
//
// The 200 path touches MongoDB, which is unavailable in unit-test env, so we
// can't drive the live route to 200. Instead we exercise the same pipeline
// the route uses (buildRotatorInputFromProgress → pickTopNTiles) and assert
// the response shape matches what the route serializes via NextResponse.json.
import {
  registerMetric,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import {
  buildRotatorInputFromProgress,
} from '../../../lib/dashboardTiles/buildRotatorInput'
import { pickTopNTiles } from '../../../lib/dashboardTiles/rotator'
import type { Metric } from '../../../lib/metrics/types'

test('GET /api/dashboard/tiles: 200 response shape contract — { tiles: TileCandidate[], now: ISO }', () => {
  __resetRegistryForTest()
  const m: Metric = {
    id: 'totalWorkoutsThisWeek',
    label: 'Workouts this week',
    unit: 'workouts',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => [],
  }
  registerMetric(m)

  const now = new Date('2026-05-28T12:00:00Z')
  const input = buildRotatorInputFromProgress(
    { pinnedTiles: [], tileLastShownAt: [] },
    [],
    undefined,
    now,
  )
  const picked = pickTopNTiles(input)

  // This is exactly what the route serializes:
  const body = { tiles: picked, now: now.toISOString() }

  assert.ok(Array.isArray(body.tiles))
  assert.equal(typeof body.now, 'string')
  assert.match(body.now, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  // Each tile is a TileCandidate (discriminated union with score + pinned + breakdown).
  for (const t of body.tiles) {
    assert.ok(t.kind === 'metric' || t.kind === 'suggestion')
    assert.equal(typeof t.score, 'number')
    assert.equal(typeof t.pinned, 'boolean')
    assert.ok(t.breakdown && typeof t.breakdown.freshness === 'number')
    if (t.kind === 'metric') {
      assert.equal(typeof t.tileId, 'string')
    } else {
      assert.equal(typeof t.suggestionId, 'string')
    }
  }
})

test('GET /api/dashboard/tiles: pinned-first contract — pinned ID ranks ahead of higher-scored unpinned ID', () => {
  __resetRegistryForTest()
  const m1: Metric = {
    id: 'pinned-low',
    label: 'Pinned but low signal',
    unit: 'x',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => [],
  }
  const m2: Metric = {
    id: 'unpinned-high',
    label: 'Unpinned high signal',
    unit: 'x',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => [],
  }
  registerMetric(m1)
  registerMetric(m2)
  const now = new Date('2026-05-28T12:00:00Z')

  const input = buildRotatorInputFromProgress(
    { pinnedTiles: ['pinned-low'], tileLastShownAt: [] },
    [],
    undefined,
    now,
    {
      // Force pinned-low to score lower than unpinned-high.
      defaultSignalStrength: 0.3,
    },
  )
  // Bump unpinned-high's signal manually after construction.
  const high = input.availableTiles.find((t) => t.tileId === 'unpinned-high')
  if (high) high.signalStrength = 1.0
  const picked = pickTopNTiles(input)
  assert.equal(picked[0].kind, 'metric')
  if (picked[0].kind === 'metric') {
    assert.equal(picked[0].tileId, 'pinned-low')
    assert.equal(picked[0].pinned, true)
    assert.equal(picked[1].kind, 'metric')
    if (picked[1].kind === 'metric') {
      assert.equal(picked[1].tileId, 'unpinned-high')
    }
  }
})
