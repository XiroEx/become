// Run with: npm run test:file tests/unit/contract/dashboardParity.test.ts
//
// Parity test: guarantees that webapp/lib/dashboardLayout/types.ts and
// shared/api-client/src/schemas/dashboard.ts remain in lockstep.
//
// A drift here (tile kinds, sizes, interval options or the 20-tile limit)
// would let web and native diverge on the wire format.
//
// No database, no network: runs purely in-memory.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as webappTypes from '../../../lib/dashboardLayout/types'
import {
  TILE_KINDS as SHARED_TILE_KINDS,
  TILE_SIZES as SHARED_TILE_SIZES,
  SMART_INTERVAL_OPTIONS_MS as SHARED_SMART_INTERVAL_OPTIONS_MS,
  MAX_DASHBOARD_TILES as SHARED_MAX_DASHBOARD_TILES,
  DASHBOARD_TILE_KINDS,
  DASHBOARD_TILE_SIZES,
} from '../../../../shared/api-client/src/schemas/dashboard'

test('dashboard tile kinds match between webapp and shared schema', () => {
  assert.deepEqual(
    [...webappTypes.TILE_KINDS],
    [...SHARED_TILE_KINDS],
    'TILE_KINDS in webapp/lib/dashboardLayout/types.ts must match shared/api-client',
  )
  assert.deepEqual(
    [...webappTypes.TILE_KINDS],
    [...DASHBOARD_TILE_KINDS],
    'TILE_KINDS in webapp must match DASHBOARD_TILE_KINDS in shared/api-client',
  )
})

test('dashboard tile sizes match between webapp and shared schema', () => {
  assert.deepEqual(
    [...webappTypes.TILE_SIZES],
    [...SHARED_TILE_SIZES],
    'TILE_SIZES in webapp/lib/dashboardLayout/types.ts must match shared/api-client',
  )
  assert.deepEqual(
    [...webappTypes.TILE_SIZES],
    [...DASHBOARD_TILE_SIZES],
    'TILE_SIZES in webapp must match DASHBOARD_TILE_SIZES in shared/api-client',
  )
})

test('smart tile rotation interval options match between webapp and shared schema', () => {
  assert.deepEqual(
    [...webappTypes.SMART_INTERVAL_OPTIONS_MS],
    [...SHARED_SMART_INTERVAL_OPTIONS_MS],
    'SMART_INTERVAL_OPTIONS_MS in webapp/lib/dashboardLayout/types.ts must match shared/api-client',
  )
})

test('max dashboard tiles limit matches between webapp and shared schema', () => {
  assert.equal(
    webappTypes.MAX_DASHBOARD_TILES,
    SHARED_MAX_DASHBOARD_TILES,
    'MAX_DASHBOARD_TILES in webapp/lib/dashboardLayout/types.ts must match shared/api-client',
  )
})

// ---------------------------------------------------------------------------
// Proof of failure: verify that differences between webapp and shared schema fail
// ---------------------------------------------------------------------------

function checkParity(params: {
  webappKinds: readonly string[]
  sharedKinds: readonly string[]
  webappSizes: readonly string[]
  sharedSizes: readonly string[]
  webappIntervals: readonly number[]
  sharedIntervals: readonly number[]
  webappMaxTiles: number
  sharedMaxTiles: number
}): void {
  assert.deepEqual(
    [...params.webappKinds],
    [...params.sharedKinds],
    'tile kinds differ between webapp and shared schema',
  )
  assert.deepEqual(
    [...params.webappSizes],
    [...params.sharedSizes],
    'tile sizes differ between webapp and shared schema',
  )
  assert.deepEqual(
    [...params.webappIntervals],
    [...params.sharedIntervals],
    'interval options differ between webapp and shared schema',
  )
  assert.equal(
    params.webappMaxTiles,
    params.sharedMaxTiles,
    '20-tile limit differs between webapp and shared schema',
  )
}

test('parity check fails when tile kinds differ', () => {
  assert.throws(
    () =>
      checkParity({
        webappKinds: ['stat', 'metric'],
        sharedKinds: SHARED_TILE_KINDS,
        webappSizes: webappTypes.TILE_SIZES,
        sharedSizes: SHARED_TILE_SIZES,
        webappIntervals: webappTypes.SMART_INTERVAL_OPTIONS_MS,
        sharedIntervals: SHARED_SMART_INTERVAL_OPTIONS_MS,
        webappMaxTiles: webappTypes.MAX_DASHBOARD_TILES,
        sharedMaxTiles: SHARED_MAX_DASHBOARD_TILES,
      }),
    /tile kinds differ/,
  )
})

test('parity check fails when tile sizes differ', () => {
  assert.throws(
    () =>
      checkParity({
        webappKinds: webappTypes.TILE_KINDS,
        sharedKinds: SHARED_TILE_KINDS,
        webappSizes: ['1x1'],
        sharedSizes: SHARED_TILE_SIZES,
        webappIntervals: webappTypes.SMART_INTERVAL_OPTIONS_MS,
        sharedIntervals: SHARED_SMART_INTERVAL_OPTIONS_MS,
        webappMaxTiles: webappTypes.MAX_DASHBOARD_TILES,
        sharedMaxTiles: SHARED_MAX_DASHBOARD_TILES,
      }),
    /tile sizes differ/,
  )
})

test('parity check fails when interval options differ', () => {
  assert.throws(
    () =>
      checkParity({
        webappKinds: webappTypes.TILE_KINDS,
        sharedKinds: SHARED_TILE_KINDS,
        webappSizes: webappTypes.TILE_SIZES,
        sharedSizes: SHARED_TILE_SIZES,
        webappIntervals: [5000, 10000],
        sharedIntervals: SHARED_SMART_INTERVAL_OPTIONS_MS,
        webappMaxTiles: webappTypes.MAX_DASHBOARD_TILES,
        sharedMaxTiles: SHARED_MAX_DASHBOARD_TILES,
      }),
    /interval options differ/,
  )
})

test('parity check fails when 20-tile limit differs', () => {
  assert.throws(
    () =>
      checkParity({
        webappKinds: webappTypes.TILE_KINDS,
        sharedKinds: SHARED_TILE_KINDS,
        webappSizes: webappTypes.TILE_SIZES,
        sharedSizes: SHARED_TILE_SIZES,
        webappIntervals: webappTypes.SMART_INTERVAL_OPTIONS_MS,
        sharedIntervals: SHARED_SMART_INTERVAL_OPTIONS_MS,
        webappMaxTiles: 25,
        sharedMaxTiles: SHARED_MAX_DASHBOARD_TILES,
      }),
    /20-tile limit differs/,
  )
})
