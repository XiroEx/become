// Run with: npm run test:file tests/unit/dashboardTiles/userProgress-rotator-schema.test.ts
//
// Schema-level assertions for the pinnedTiles + tileLastShownAt fields added
// to UserProgress. No DB — uses Mongoose validateSync + toObject for stable
// shape inspection.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import UserProgress from '../../../models/UserProgress'

function pathOptions(name: string) {
  const p = UserProgress.schema.path(name) as unknown as {
    instance: string
    defaultValue?: unknown
    options?: { default?: unknown }
  }
  assert.ok(p, `${name} must exist on the schema`)
  return p
}

function defaultOf(name: string): unknown {
  const p = pathOptions(name)
  return typeof p.options?.default === 'function'
    ? (p.options.default as () => unknown)()
    : p.options?.default ?? p.defaultValue
}

// --- pinnedTiles -------------------------------------------------------

test('UserProgress schema: pinnedTiles is Array, defaults to []', () => {
  assert.equal(pathOptions('pinnedTiles').instance, 'Array')
  const d = defaultOf('pinnedTiles')
  assert.ok(Array.isArray(d))
  assert.equal((d as unknown[]).length, 0)
})

test('new UserProgress() instances start with pinnedTiles = []', () => {
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  const obj = doc.toObject()
  assert.ok(Array.isArray(obj.pinnedTiles))
  assert.equal(obj.pinnedTiles.length, 0)
})

test('pinnedTiles accepts an array of strings', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    pinnedTiles: ['workouts-this-week', 'streak'],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
  const obj = doc.toObject()
  assert.deepEqual(obj.pinnedTiles, ['workouts-this-week', 'streak'])
})

// --- tileLastShownAt ---------------------------------------------------

test('UserProgress schema: tileLastShownAt is Array, defaults to []', () => {
  assert.equal(pathOptions('tileLastShownAt').instance, 'Array')
  const d = defaultOf('tileLastShownAt')
  assert.ok(Array.isArray(d))
  assert.equal((d as unknown[]).length, 0)
})

test('new UserProgress() instances start with tileLastShownAt = []', () => {
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  const obj = doc.toObject()
  assert.ok(Array.isArray(obj.tileLastShownAt))
  assert.equal(obj.tileLastShownAt.length, 0)
})

test('tileLastShownAt accepts well-formed { id, at } entries', () => {
  const at = new Date('2026-05-27T00:00:00Z')
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    tileLastShownAt: [{ id: 'workouts-this-week', at }],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
  const obj = doc.toObject()
  assert.equal(obj.tileLastShownAt.length, 1)
  assert.equal(obj.tileLastShownAt[0].id, 'workouts-this-week')
  assert.equal(
    (obj.tileLastShownAt[0].at as Date).toISOString(),
    at.toISOString(),
  )
})

test('tileLastShownAt rejects entries missing id', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    tileLastShownAt: [{ at: new Date() }],
  })
  const err = doc.validateSync()
  assert.ok(err, 'expected validation error')
  assert.match(String(err), /id/)
})

test('tileLastShownAt auto-defaults at to Date.now when omitted', () => {
  const before = Date.now()
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    tileLastShownAt: [{ id: 'workouts-this-week' }],
  })
  const obj = doc.toObject()
  const at = (obj.tileLastShownAt[0].at as Date).getTime()
  assert.ok(at >= before)
  assert.ok(at <= Date.now())
})

// --- legacy compatibility ---------------------------------------------

test('docs constructed WITHOUT pinnedTiles or tileLastShownAt (legacy) validate cleanly', () => {
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  const err = doc.validateSync()
  assert.equal(err, undefined)
})

test('full UserProgress with rotator fields + dismissed entries round-trips through toObject', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    pinnedTiles: ['a', 'b'],
    tileLastShownAt: [{ id: 'a', at: new Date('2026-05-27T00:00:00Z') }],
    dismissedSuggestions: [
      { id: 'log-weight', dismissedAt: new Date('2026-05-26T00:00:00Z') },
    ],
  })
  assert.equal(doc.validateSync(), undefined)
  const obj = doc.toObject()
  assert.deepEqual(obj.pinnedTiles, ['a', 'b'])
  assert.equal(obj.tileLastShownAt.length, 1)
  assert.equal(obj.dismissedSuggestions.length, 1)
})
