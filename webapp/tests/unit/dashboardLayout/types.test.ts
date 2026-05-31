import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDashboardTile,
  parseDashboardLayout,
  safeParseDashboardLayout,
  DashboardLayoutError,
  MAX_DASHBOARD_TILES,
  TILE_KINDS,
  TILE_SIZES,
  isDashboardTileKind,
  isDashboardTileSize,
} from '../../../lib/dashboardLayout/types'

const statTile = (id: string) => ({ id, kind: 'stat', size: '1x1' })

describe('dashboardLayout/types — constants', () => {
  it('exposes the three kinds and two sizes', () => {
    assert.deepEqual([...TILE_KINDS], ['stat', 'metric', 'smart-rotating'])
    assert.deepEqual([...TILE_SIZES], ['1x1', '2x1'])
    assert.equal(MAX_DASHBOARD_TILES, 20)
  })

  it('type guards accept valid + reject invalid', () => {
    assert.ok(isDashboardTileKind('metric'))
    assert.ok(!isDashboardTileKind('bogus'))
    assert.ok(isDashboardTileSize('2x1'))
    assert.ok(!isDashboardTileSize('9x9'))
  })
})

describe('parseDashboardTile', () => {
  it('accepts a valid stat tile', () => {
    assert.deepEqual(parseDashboardTile(statTile('streak')), {
      id: 'streak',
      kind: 'stat',
      size: '1x1',
    })
  })

  it('accepts a valid metric tile at 2x1', () => {
    assert.deepEqual(
      parseDashboardTile({ id: 'strength-curve', kind: 'metric', size: '2x1' }),
      { id: 'strength-curve', kind: 'metric', size: '2x1' }
    )
  })

  it('rejects an invalid kind', () => {
    assert.throws(
      () => parseDashboardTile({ id: 'x', kind: 'bogus', size: '1x1' }),
      DashboardLayoutError
    )
  })

  it('rejects an invalid size', () => {
    assert.throws(
      () => parseDashboardTile({ id: 'streak', kind: 'stat', size: '3x3' }),
      DashboardLayoutError
    )
  })

  it('rejects an empty id', () => {
    assert.throws(
      () => parseDashboardTile({ id: '', kind: 'stat', size: '1x1' }),
      DashboardLayoutError
    )
  })

  it('allows locked only on a smart-rotating tile', () => {
    assert.deepEqual(
      parseDashboardTile({
        id: 't1',
        kind: 'smart-rotating',
        size: '2x1',
        locked: 'strength-curve',
      }),
      { id: 't1', kind: 'smart-rotating', size: '2x1', locked: 'strength-curve' }
    )
    // null locked = rotates; valid on a smart-rotating tile
    assert.doesNotThrow(() =>
      parseDashboardTile({
        id: 't1',
        kind: 'smart-rotating',
        size: '2x1',
        locked: null,
      })
    )
  })

  it('rejects locked on a non-smart-rotating tile', () => {
    assert.throws(
      () =>
        parseDashboardTile({
          id: 'streak',
          kind: 'stat',
          size: '1x1',
          locked: 'streak',
        }),
      DashboardLayoutError
    )
  })
})

describe('parseDashboardLayout', () => {
  it('accepts an empty layout', () => {
    assert.deepEqual(parseDashboardLayout([]), [])
  })

  it('accepts a layout at the max size', () => {
    const layout = Array.from({ length: MAX_DASHBOARD_TILES }, (_, i) =>
      statTile('t' + i)
    )
    assert.equal(parseDashboardLayout(layout).length, MAX_DASHBOARD_TILES)
  })

  it('rejects a layout larger than the max', () => {
    const layout = Array.from({ length: MAX_DASHBOARD_TILES + 1 }, (_, i) =>
      statTile('t' + i)
    )
    assert.throws(() => parseDashboardLayout(layout), DashboardLayoutError)
  })

  it('rejects a non-array', () => {
    assert.throws(() => parseDashboardLayout({}), DashboardLayoutError)
  })

  it('rejects a layout containing an invalid tile', () => {
    assert.throws(
      () => parseDashboardLayout([{ id: 'x', kind: 'nope', size: '1x1' }]),
      DashboardLayoutError
    )
  })
})

describe('safeParseDashboardLayout', () => {
  it('returns ok for a valid layout', () => {
    const res = safeParseDashboardLayout([statTile('streak')])
    assert.ok(res.ok)
    if (res.ok) assert.equal(res.layout.length, 1)
  })

  it('returns an error string for an invalid layout instead of throwing', () => {
    const res = safeParseDashboardLayout('not-an-array')
    assert.ok(!res.ok)
    if (!res.ok) assert.match(res.error, /array/)
  })
})
