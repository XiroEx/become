// Run with: npm run test:file tests/unit/contract/dashboardParity.test.ts
//
// THE TILE VOCABULARY, IN LOCKSTEP (NP-023).
//
// `webapp/lib/dashboardLayout/{types,defaults}.ts` and
// `shared/api-client/src/schemas/dashboard.ts` declare the same tile kinds,
// sizes, rotation intervals, stat ids and limits. They have to: the webapp
// cannot import the shared package (webapp/Dockerfile's build context is
// `webapp/`, so `../shared` is not in the image), so the vocabulary exists
// twice and the server validates against ITS copy while the native app parses
// against the OTHER one.
//
// A drift is therefore silent in both builds and only shows up on a member's
// phone: add a fourth tile size here and the layout the server happily stores
// no longer parses on the device, which does not degrade one tile — it drops
// the whole response and blanks the home screen.
//
// This file imports BOTH modules and compares them value for value. Its twin,
// `shared/api-client/tests/webParity.test.ts`, reads these files as TEXT from
// the other side of the fence, because the `shared-api-client` CI job has no
// webapp install. Both have to exist; neither alone covers both jobs.
//
// No database, no network: this runs purely in memory.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_DASHBOARD_TILES,
  MAX_SMART_POOL,
  DEFAULT_SMART_INTERVAL_MS,
  SMART_INTERVAL_OPTIONS_MS,
  TILE_KINDS,
  TILE_SIZES,
  parseDashboardLayout,
  DashboardLayoutError,
} from '../../../lib/dashboardLayout/types'
import {
  STAT_TILE_IDS,
  SMART_ROTATING_TILE_ID,
} from '../../../lib/dashboardLayout/defaults'

import {
  MAX_DASHBOARD_TILES as SHARED_MAX_DASHBOARD_TILES,
  MAX_SMART_POOL as SHARED_MAX_SMART_POOL,
  DEFAULT_SMART_INTERVAL_MS as SHARED_DEFAULT_SMART_INTERVAL_MS,
  SMART_INTERVAL_OPTIONS_MS as SHARED_SMART_INTERVAL_OPTIONS_MS,
  SMART_ROTATING_TILE_ID as SHARED_SMART_ROTATING_TILE_ID,
  STAT_TILE_IDS as SHARED_STAT_TILE_IDS,
  TILE_KINDS as SHARED_TILE_KINDS,
  TILE_SIZES as SHARED_TILE_SIZES,
  DashboardLayoutSchema,
  DashboardTileSchema,
} from '../../../../shared/api-client/src/schemas/dashboard'

// ---------------------------------------------------------------------------
// One comparator, used by the parity tests AND by the proofs that it bites.
//
// The proofs matter: four assertions that happen to pass today tell you nothing
// about whether they would fail on a drift. They call THIS function with one
// side deliberately changed, so what is proven is the real comparison and not a
// second copy of it written to pass.
// ---------------------------------------------------------------------------

interface TileVocabulary {
  kinds: readonly string[]
  sizes: readonly string[]
  intervalsMs: readonly number[]
  defaultIntervalMs: number
  maxTiles: number
  maxSmartPool: number
  statTileIds: readonly string[]
  smartTileId: string
}

const WEB: TileVocabulary = {
  kinds: TILE_KINDS,
  sizes: TILE_SIZES,
  intervalsMs: SMART_INTERVAL_OPTIONS_MS,
  defaultIntervalMs: DEFAULT_SMART_INTERVAL_MS,
  maxTiles: MAX_DASHBOARD_TILES,
  maxSmartPool: MAX_SMART_POOL,
  statTileIds: STAT_TILE_IDS,
  smartTileId: SMART_ROTATING_TILE_ID,
}

const SHARED: TileVocabulary = {
  kinds: SHARED_TILE_KINDS,
  sizes: SHARED_TILE_SIZES,
  intervalsMs: SHARED_SMART_INTERVAL_OPTIONS_MS,
  defaultIntervalMs: SHARED_DEFAULT_SMART_INTERVAL_MS,
  maxTiles: SHARED_MAX_DASHBOARD_TILES,
  maxSmartPool: SHARED_MAX_SMART_POOL,
  statTileIds: SHARED_STAT_TILE_IDS,
  smartTileId: SHARED_SMART_ROTATING_TILE_ID,
}

function assertVocabularyParity(web: TileVocabulary, shared: TileVocabulary): void {
  assert.deepEqual(
    [...web.kinds],
    [...shared.kinds],
    'tile kinds differ between webapp/lib/dashboardLayout/types.ts and shared/api-client/src/schemas/dashboard.ts',
  )
  assert.deepEqual(
    [...web.sizes],
    [...shared.sizes],
    'tile sizes differ between webapp/lib/dashboardLayout/types.ts and shared/api-client/src/schemas/dashboard.ts',
  )
  assert.deepEqual(
    [...web.intervalsMs],
    [...shared.intervalsMs],
    'interval options differ between webapp/lib/dashboardLayout/types.ts and shared/api-client/src/schemas/dashboard.ts',
  )
  assert.equal(
    web.defaultIntervalMs,
    shared.defaultIntervalMs,
    'the default rotation interval differs between the webapp and the shared schema',
  )
  assert.equal(
    web.maxTiles,
    shared.maxTiles,
    'the 20-tile limit differs between webapp/lib/dashboardLayout/types.ts and shared/api-client/src/schemas/dashboard.ts',
  )
  assert.equal(
    web.maxSmartPool,
    shared.maxSmartPool,
    'the smart-pool cap differs between the webapp and the shared schema',
  )
  assert.deepEqual(
    [...web.statTileIds],
    [...shared.statTileIds],
    'the stat tile ids differ between webapp/lib/dashboardLayout/defaults.ts and the shared schema',
  )
  assert.equal(
    web.smartTileId,
    shared.smartTileId,
    'the smart-rotating tile id differs between the webapp and the shared schema',
  )
}

// ---------------------------------------------------------------------------
// Parity
// ---------------------------------------------------------------------------

test('the tile vocabulary is identical in the webapp and in shared/api-client', () => {
  assertVocabularyParity(WEB, SHARED)
})

// ---------------------------------------------------------------------------
// Proof that the comparator bites. One drifted field at a time, so a failure
// names the field that drifted rather than "something changed".
//
// Each case starts from the SHARED side and changes exactly one field, so these
// stay green (and only the parity test above goes red) when the two copies
// really do drift — a cascade of failures from one root cause tells you less
// than a single one that names it.
// ---------------------------------------------------------------------------

const DRIFTS: ReadonlyArray<[label: string, drifted: TileVocabulary, expected: RegExp]> = [
  ['a dropped tile kind', { ...SHARED, kinds: ['stat', 'metric'] }, /tile kinds differ/],
  ['a new tile kind', { ...SHARED, kinds: [...SHARED_TILE_KINDS, 'chart'] }, /tile kinds differ/],
  ['a reordered tile kind', { ...SHARED, kinds: ['metric', 'stat', 'smart-rotating'] }, /tile kinds differ/],
  ['a new tile size', { ...SHARED, sizes: ['1x1', '2x1', '2x2'] }, /tile sizes differ/],
  ['a changed interval option', { ...SHARED, intervalsMs: [4000, 5000, 10000, 30000] }, /interval options differ/],
  ['a changed default interval', { ...SHARED, defaultIntervalMs: 4000 }, /default rotation interval differs/],
  ['a raised tile limit', { ...SHARED, maxTiles: 25 }, /20-tile limit differs/],
  ['a lowered smart-pool cap', { ...SHARED, maxSmartPool: 10 }, /smart-pool cap differs/],
  ['a renamed stat tile id', { ...SHARED, statTileIds: [...SHARED_STAT_TILE_IDS.slice(0, 7), 'sessions'] }, /stat tile ids differ/],
  ['a renamed smart tile id', { ...SHARED, smartTileId: 'rotating' }, /smart-rotating tile id differs/],
]

for (const [label, drifted, expected] of DRIFTS) {
  test(`the parity check fails on ${label}`, () => {
    assert.throws(() => assertVocabularyParity(drifted, SHARED), expected)
  })
}

// ---------------------------------------------------------------------------
// And the vocabulary is not only declared the same — the two VALIDATORS agree.
//
// Matching constants would still let the two sides drift if one of them stopped
// USING its own list, so this walks a handful of tiles past both the webapp's
// hand-rolled parser and the shared zod schema and requires the same verdict.
// ---------------------------------------------------------------------------

const CASES: ReadonlyArray<[label: string, tile: unknown, valid: boolean]> = [
  ['a plain stat square', { id: 'streak', kind: 'stat', size: '1x1' }, true],
  ['a wide metric tile', { id: 'metric:volume', kind: 'metric', size: '2x1' }, true],
  [
    'a smart tile with both settings',
    {
      id: SMART_ROTATING_TILE_ID,
      kind: 'smart-rotating',
      size: '2x1',
      locked: 'stat:streak',
      settings: { pool: ['stat:streak', 'metric:volume'], intervalMs: DEFAULT_SMART_INTERVAL_MS },
    },
    true,
  ],
  ['an unknown kind', { id: 'x', kind: 'chart', size: '1x1' }, false],
  ['an unknown size', { id: 'x', kind: 'stat', size: '2x2' }, false],
  ['an empty id', { id: '', kind: 'stat', size: '1x1' }, false],
  [
    'a pool entry that is not a card key',
    { id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { pool: ['streak'] } },
    false,
  ],
  [
    'an over-long pool',
    {
      id: 'smart',
      kind: 'smart-rotating',
      size: '2x1',
      settings: { pool: Array.from({ length: MAX_SMART_POOL + 1 }, (_, i) => `stat:s${i}`) },
    },
    false,
  ],
]

for (const [label, tile, valid] of CASES) {
  test(`both validators ${valid ? 'accept' : 'reject'} ${label}`, () => {
    let webOk = true
    try {
      parseDashboardLayout([tile])
    } catch (error) {
      assert.ok(error instanceof DashboardLayoutError, 'the webapp throws its own error type')
      webOk = false
    }
    const sharedOk = DashboardTileSchema.safeParse(tile).success

    assert.equal(webOk, valid, `webapp/lib/dashboardLayout/types.ts disagrees about ${label}`)
    assert.equal(sharedOk, valid, `the shared schema disagrees about ${label}`)
  })
}

test('both validators stop at the same tile count', () => {
  const tiles = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `tile-${i}`, kind: 'stat', size: '1x1' }))

  assert.equal(parseDashboardLayout(tiles(MAX_DASHBOARD_TILES)).length, MAX_DASHBOARD_TILES)
  assert.equal(DashboardLayoutSchema.safeParse(tiles(MAX_DASHBOARD_TILES)).success, true)

  assert.throws(() => parseDashboardLayout(tiles(MAX_DASHBOARD_TILES + 1)), DashboardLayoutError)
  assert.equal(DashboardLayoutSchema.safeParse(tiles(MAX_DASHBOARD_TILES + 1)).success, false)
})

test('every rotation interval the customizer offers is one the shared schema accepts', () => {
  for (const intervalMs of SMART_INTERVAL_OPTIONS_MS) {
    const tile = { id: 'smart', kind: 'smart-rotating', size: '2x1', settings: { intervalMs } }
    assert.equal(
      DashboardTileSchema.safeParse(tile).success,
      true,
      `${intervalMs} ms is offered by webapp/lib/dashboardLayout/types.ts but rejected by the shared schema`,
    )
    assert.equal(parseDashboardLayout([tile])[0]?.settings?.intervalMs, intervalMs)
  }
  // And one that is NOT offered is refused, so the list above is doing work.
  assert.equal(
    DashboardTileSchema.safeParse({
      id: 'smart',
      kind: 'smart-rotating',
      size: '2x1',
      settings: { intervalMs: 5000 },
    }).success,
    false,
  )
})
