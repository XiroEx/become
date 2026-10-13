// Run with: npm run test:file tests/unit/rewardCatalog.test.ts
//
// Static referential-integrity checks for Become's redReward config. These catch
// a ConfigError BEFORE runtime: createRedReward() throws if any achievement reward
// id is missing from the catalog, or if there are duplicate collectible/achievement
// ids. They import ONLY the pure data modules (no singleton, no live DB).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalog } from '../../lib/reward/catalog'
import { achievements } from '../../lib/reward/achievements'

test('no duplicate collectible ids', () => {
  const ids = catalog.map((c) => c.id)
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i)
  assert.deepEqual(dups, [], `duplicate collectible ids: ${dups.join(', ')}`)
})

test('no duplicate achievement ids', () => {
  const ids = achievements.map((a) => a.id)
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i)
  assert.deepEqual(dups, [], `duplicate achievement ids: ${dups.join(', ')}`)
})

test('every achievement reward id exists in the catalog', () => {
  const catalogIds = new Set(catalog.map((c) => c.id))
  const missing: string[] = []
  for (const a of achievements) {
    for (const r of a.rewards) {
      if (!catalogIds.has(r)) missing.push(`${a.id} -> ${r}`)
    }
  }
  assert.deepEqual(missing, [], `achievement rewards missing from catalog: ${missing.join(', ')}`)
})

test('every source:"achievement" collectible is granted by some achievement (no orphans)', () => {
  const granted = new Set(achievements.flatMap((a) => a.rewards))
  const orphans = catalog
    .filter((c) => c.source === 'achievement' && !granted.has(c.id))
    .map((c) => c.id)
  assert.deepEqual(orphans, [], `orphan achievement collectibles (never granted): ${orphans.join(', ')}`)
})

test('all 10 default icons are present and source:"default"', () => {
  const defaults = catalog.filter((c) => c.type === 'icon' && c.source === 'default')
  assert.equal(defaults.length, 10)
})
