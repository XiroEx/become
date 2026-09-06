// Run with: npm run test:file tests/unit/dashboardTiles/validatePinnedTiles.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePinnedTilesPayload } from '../../../lib/dashboardTiles/validatePinnedTiles'

test('validate: missing body → error', () => {
  const r = validatePinnedTilesPayload(null)
  assert.equal(r.ok, false)
})

test('validate: pinnedTiles missing → error', () => {
  const r = validatePinnedTilesPayload({})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /pinnedTiles must be an array/)
})

test('validate: pinnedTiles must be array', () => {
  const r = validatePinnedTilesPayload({ pinnedTiles: 'a,b,c' })
  assert.equal(r.ok, false)
})

test('validate: non-string entries rejected', () => {
  const r = validatePinnedTilesPayload({ pinnedTiles: ['a', 42] })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /must be strings/)
})

test('validate: trims, drops blanks, dedups (first-occurrence)', () => {
  const r = validatePinnedTilesPayload({
    pinnedTiles: ['  workouts  ', '', 'streak', 'workouts'],
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.pinnedTiles, ['workouts', 'streak'])
})

test('validate: empty array is valid (clears all pins)', () => {
  const r = validatePinnedTilesPayload({ pinnedTiles: [] })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.pinnedTiles, [])
})

test('validate: rejects > 20 entries', () => {
  const r = validatePinnedTilesPayload({
    pinnedTiles: Array.from({ length: 21 }, (_, i) => `t${i}`),
  })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /may not exceed 20/)
})

test('validate: ordering is preserved', () => {
  const r = validatePinnedTilesPayload({
    pinnedTiles: ['c', 'a', 'b'],
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.pinnedTiles, ['c', 'a', 'b'])
})
