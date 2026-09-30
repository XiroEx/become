// Run with: npm run test:file tests/unit/contract/dashboardParity.test.ts
//
// NP-023: Verify lockstep parity between webapp/lib/dashboardLayout/types.ts
// and shared/api-client/src/schemas/dashboard.ts.
//
// The webapp cannot import @become/api-client directly in production code due to
// Docker build context isolation, so webapp/lib/dashboardLayout/types.ts
// hand-rolls the tile layout constants and validators. This test ensures the
// two definitions cannot drift in silence.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TILE_KINDS,
  TILE_SIZES,
  MAX_DASHBOARD_TILES,
  SMART_INTERVAL_OPTIONS_MS,
  DEFAULT_SMART_INTERVAL_MS,
  MAX_SMART_POOL,
} from '../../../lib/dashboardLayout/types'

import {
  DASHBOARD_TILE_KINDS,
  DASHBOARD_TILE_SIZES,
  MAX_DASHBOARD_TILES as SHARED_MAX_DASHBOARD_TILES,
  SMART_INTERVAL_OPTIONS_MS as SHARED_SMART_INTERVAL_OPTIONS_MS,
  DEFAULT_SMART_INTERVAL_MS as SHARED_DEFAULT_SMART_INTERVAL_MS,
  MAX_SMART_POOL as SHARED_MAX_SMART_POOL,
} from '../../../../shared/api-client/src/schemas/dashboard'

test('tile kinds, sizes, interval options and limits are identical between web and shared schema', () => {
  assert.deepEqual(TILE_KINDS, DASHBOARD_TILE_KINDS, 'tile kinds must match')
  assert.deepEqual(TILE_SIZES, DASHBOARD_TILE_SIZES, 'tile sizes must match')
  assert.equal(MAX_DASHBOARD_TILES, SHARED_MAX_DASHBOARD_TILES, 'max dashboard tiles limit must match')
  assert.deepEqual(
    SMART_INTERVAL_OPTIONS_MS,
    SHARED_SMART_INTERVAL_OPTIONS_MS,
    'smart interval options must match',
  )
  assert.equal(
    DEFAULT_SMART_INTERVAL_MS,
    SHARED_DEFAULT_SMART_INTERVAL_MS,
    'default smart interval must match',
  )
  assert.equal(MAX_SMART_POOL, SHARED_MAX_SMART_POOL, 'max smart pool limit must match')
})

test('a test fails when the tile kinds, sizes, interval options or the 20-tile limit differ', () => {
  // Tile kinds difference
  assert.throws(
    () => {
      assert.deepEqual(['stat', 'metric'] as const, DASHBOARD_TILE_KINDS)
    },
    { name: 'AssertionError' },
    'must fail if tile kinds differ',
  )

  // Tile sizes difference
  assert.throws(
    () => {
      assert.deepEqual(['1x1'] as const, DASHBOARD_TILE_SIZES)
    },
    { name: 'AssertionError' },
    'must fail if tile sizes differ',
  )

  // 20-tile limit difference
  assert.throws(
    () => {
      assert.equal(15, SHARED_MAX_DASHBOARD_TILES)
    },
    { name: 'AssertionError' },
    'must fail if max tiles limit differs',
  )

  // Interval options difference
  assert.throws(
    () => {
      assert.deepEqual([4000, 6000] as const, SHARED_SMART_INTERVAL_OPTIONS_MS)
    },
    { name: 'AssertionError' },
    'must fail if smart interval options differ',
  )
})
