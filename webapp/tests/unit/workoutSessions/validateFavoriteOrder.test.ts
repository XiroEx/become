// Run with: npm run test:file tests/unit/workoutSessions/validateFavoriteOrder.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateFavoriteOrderPayload } from '../../../lib/workoutSessions/validateFavoriteOrder'

test('validate: missing body → error', () => {
  const r = validateFavoriteOrderPayload(null)
  assert.equal(r.ok, false)
})

test('validate: order missing → error', () => {
  const r = validateFavoriteOrderPayload({})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /order must be an array/)
})

test('validate: order must be array', () => {
  const r = validateFavoriteOrderPayload({ order: 'a,b,c' })
  assert.equal(r.ok, false)
})

test('validate: non-string entries rejected', () => {
  const r = validateFavoriteOrderPayload({ order: ['a', 42] })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /must be strings/)
})

test('validate: trims, drops blanks, dedups (first-occurrence)', () => {
  const r = validateFavoriteOrderPayload({
    order: ['  sess-1  ', '', 'sess-2', 'sess-1'],
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.order, ['sess-1', 'sess-2'])
})

test('validate: empty array is valid (clears the order)', () => {
  const r = validateFavoriteOrderPayload({ order: [] })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.order, [])
})

test('validate: rejects > 200 entries', () => {
  const r = validateFavoriteOrderPayload({
    order: Array.from({ length: 201 }, (_, i) => `s${i}`),
  })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /may not exceed 200/)
})

test('validate: ordering is preserved', () => {
  const r = validateFavoriteOrderPayload({
    order: ['c', 'a', 'b'],
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.deepEqual(r.order, ['c', 'a', 'b'])
})
