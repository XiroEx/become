// Run with: npx tsx --test tests/unit/dashboardLayout/migrate.test.ts
//
// Pure migration / default-synthesis logic for GET /api/dashboard/layout.
// Fully covers the "migrate exactly once, second GET is stable" contract; the
// 200 route path (which touches MongoDB) is covered by these + Playwright.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  synthesizeLayout,
  defaultLayout,
  richDefaultLayout,
  isLegacyDefaultLayout,
  resolveLayoutForGet,
  parseStatPrefParam,
  STAT_TILE_IDS,
  DEFAULT_STAT_TILE_IDS,
} from '../../../lib/dashboardLayout/migrate'
import type { DashboardTile } from '../../../lib/dashboardLayout/types'
import { MAX_DASHBOARD_TILES } from '../../../lib/dashboardLayout/types'

describe('defaultLayout', () => {
  it('returns the default stat tiles as 1x1 stat kinds', () => {
    const layout = defaultLayout()
    assert.deepEqual(layout.map((t: DashboardTile) => t.id), [...DEFAULT_STAT_TILE_IDS])
    assert.ok(layout.every((t: DashboardTile) => t.kind === 'stat' && t.size === '1x1'))
  })
})

describe('synthesizeLayout', () => {
  it('maps stat-pref ids to stat tiles, ordered first', () => {
    assert.deepEqual(synthesizeLayout([], ['mood', 'streak']), [
      { id: 'mood', kind: 'stat', size: '1x1' },
      { id: 'streak', kind: 'stat', size: '1x1' },
    ])
  })

  it('maps legacy pins: known stat id → stat, unknown id → metric', () => {
    assert.deepEqual(synthesizeLayout(['weight', 'strength-curve'], []), [
      { id: 'weight', kind: 'stat', size: '1x1' },
      { id: 'strength-curve', kind: 'metric', size: '1x1' },
    ])
  })

  it('places stat-pref before legacy pins and dedupes by (kind,id)', () => {
    assert.deepEqual(synthesizeLayout(['streak', 'strength-curve'], ['streak', 'mood']), [
      { id: 'streak', kind: 'stat', size: '1x1' },
      { id: 'mood', kind: 'stat', size: '1x1' },
      { id: 'strength-curve', kind: 'metric', size: '1x1' },
    ])
  })

  it('ignores non-stat ids in stat-pref', () => {
    assert.deepEqual(synthesizeLayout([], ['strength-curve', 'streak']), [
      { id: 'streak', kind: 'stat', size: '1x1' },
    ])
  })

  it('caps at the layout maximum', () => {
    const pins = Array.from({ length: MAX_DASHBOARD_TILES + 5 }, (_, i) => `m${i}`)
    assert.equal(synthesizeLayout(pins, []).length, MAX_DASHBOARD_TILES)
  })

  it('returns [] when there is nothing to migrate', () => {
    assert.deepEqual(synthesizeLayout([], []), [])
  })

  it('recognizes all 8 stat ids', () => {
    const layout = synthesizeLayout([], [...STAT_TILE_IDS])
    assert.equal(layout.length, STAT_TILE_IDS.length)
    assert.ok(layout.every((t: DashboardTile) => t.kind === 'stat'))
  })
})

describe('resolveLayoutForGet', () => {
  it('returns an existing non-empty layout unchanged and does NOT migrate', () => {
    const existing: DashboardTile[] = [{ id: 'streak', kind: 'stat', size: '2x1' }]
    const res = resolveLayoutForGet({ existingLayout: existing })
    assert.equal(res.migrated, false)
    assert.deepEqual(res.layout, existing)
  })

  it('migrates from legacy pinnedTiles when no layout is persisted', () => {
    const res = resolveLayoutForGet({ existingLayout: [], pinnedTiles: ['weight', 'strength-curve'] })
    assert.equal(res.migrated, true)
    assert.deepEqual(res.layout, [
      { id: 'weight', kind: 'stat', size: '1x1' },
      { id: 'strength-curve', kind: 'metric', size: '1x1' },
    ])
  })

  it('falls back to the RICH default layout for a fresh user with no legacy data', () => {
    const res = resolveLayoutForGet({ existingLayout: [] })
    assert.equal(res.migrated, true)
    assert.deepEqual(res.layout, richDefaultLayout())
  })

  it('treats a null existingLayout as empty (fresh user) → rich default', () => {
    const res = resolveLayoutForGet({ existingLayout: null })
    assert.equal(res.migrated, true)
    assert.deepEqual(res.layout, richDefaultLayout())
  })

  it('heals the stale legacy 4-stat default → rich default (and persists)', () => {
    const res = resolveLayoutForGet({ existingLayout: defaultLayout() })
    assert.equal(res.migrated, true)
    assert.deepEqual(res.layout, richDefaultLayout())
  })

  it('does NOT clobber a customized layout that merely starts with the default ids', () => {
    // Same 4 ids but one is resized — a real customization, must be preserved.
    const customized = [
      { id: 'streak', kind: 'stat' as const, size: '2x1' as const },
      { id: 'mood', kind: 'stat' as const, size: '1x1' as const },
      { id: 'weekly', kind: 'stat' as const, size: '1x1' as const },
      { id: 'goal', kind: 'stat' as const, size: '1x1' as const },
    ]
    const res = resolveLayoutForGet({ existingLayout: customized })
    assert.equal(res.migrated, false)
    assert.deepEqual(res.layout, customized)
  })

  it('does NOT treat the rich default as stale (no heal loop)', () => {
    const res = resolveLayoutForGet({ existingLayout: richDefaultLayout() })
    assert.equal(res.migrated, false)
    assert.deepEqual(res.layout, richDefaultLayout())
  })

  it('is idempotent: feeding a migrated layout back in does NOT re-migrate', () => {
    const first = resolveLayoutForGet({ existingLayout: [], pinnedTiles: ['streak', 'strength-curve'] })
    assert.equal(first.migrated, true)
    const second = resolveLayoutForGet({ existingLayout: first.layout, pinnedTiles: ['streak', 'strength-curve'] })
    assert.equal(second.migrated, false)
    assert.deepEqual(second.layout, first.layout)
  })
})

describe('richDefaultLayout', () => {
  it('returns all 8 stat tiles plus a smart-rotating tile', () => {
    const layout = richDefaultLayout()
    const statIds = layout.filter((t) => t.kind === 'stat').map((t) => t.id)
    assert.deepEqual([...statIds].sort(), [...STAT_TILE_IDS].sort())
    const smart = layout.filter((t) => t.kind === 'smart-rotating')
    assert.equal(smart.length, 1)
    assert.equal(smart[0].size, '2x1')
    assert.equal(smart[0].locked, null)
  })

  it('includes size variety (at least one 2x1 stat tile)', () => {
    const layout = richDefaultLayout()
    assert.ok(layout.some((t) => t.kind === 'stat' && t.size === '2x1'))
  })

  it('returns a fresh array each call (safe to mutate)', () => {
    assert.notEqual(richDefaultLayout(), richDefaultLayout())
  })
})

describe('isLegacyDefaultLayout', () => {
  it('is true for the exact legacy default', () => {
    assert.equal(isLegacyDefaultLayout(defaultLayout()), true)
  })
  it('is false for the rich default', () => {
    assert.equal(isLegacyDefaultLayout(richDefaultLayout()), false)
  })
  it('is false when a tile is resized', () => {
    const l = defaultLayout()
    l[0].size = '2x1'
    assert.equal(isLegacyDefaultLayout(l), false)
  })
  it('is false for a different-length layout', () => {
    assert.equal(isLegacyDefaultLayout(defaultLayout().slice(0, 3)), false)
  })
})

describe('parseStatPrefParam', () => {
  it('parses a comma-separated list, trimming + dropping blanks', () => {
    assert.deepEqual(parseStatPrefParam(' streak , mood ,, '), ['streak', 'mood'])
  })
  it('returns [] for null/empty/undefined', () => {
    assert.deepEqual(parseStatPrefParam(null), [])
    assert.deepEqual(parseStatPrefParam(''), [])
    assert.deepEqual(parseStatPrefParam(undefined), [])
  })
})
