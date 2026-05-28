// Run with: npx tsx --test tests/unit/suggestions/userProgress-dismissedSuggestions-schema.test.ts
//
// Schema-level assertions for the dismissedSuggestions subdocument added to
// UserProgress. No DB — exercises the Mongoose schema directly so the test
// runs in any environment.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import UserProgress from '../../../models/UserProgress'

test('UserProgress schema declares dismissedSuggestions as an array defaulting to []', () => {
  const path = UserProgress.schema.path('dismissedSuggestions') as unknown as {
    instance: string
    defaultValue?: unknown
    options?: { default?: unknown }
  }
  assert.ok(path, 'dismissedSuggestions path must exist on the schema')
  assert.equal(path.instance, 'Array')

  const dflt =
    typeof path.options?.default === 'function'
      ? (path.options.default as () => unknown)()
      : path.options?.default ?? path.defaultValue
  assert.ok(Array.isArray(dflt), `default must be an array, got ${typeof dflt}`)
  assert.equal((dflt as unknown[]).length, 0)
})

test('new UserProgress() instances start with dismissedSuggestions = []', () => {
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  const obj = doc.toObject()
  assert.ok(Array.isArray(obj.dismissedSuggestions))
  assert.equal(obj.dismissedSuggestions.length, 0)
})

test('docs constructed WITHOUT dismissedSuggestions (legacy prod docs) validate cleanly', () => {
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  const err = doc.validateSync()
  assert.equal(err, undefined, 'no validation errors expected for pre-migration shape')
})

test('a well-formed DismissedSuggestion subdocument validates cleanly', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    dismissedSuggestions: [
      { id: 'log-weight', dismissedAt: new Date('2026-05-27T00:00:00Z') },
      { id: 'streak-milestone-7', dismissedAt: new Date('2026-05-28T00:00:00Z') },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
  const obj = doc.toObject()
  assert.equal(obj.dismissedSuggestions.length, 2)
  assert.equal(obj.dismissedSuggestions[0].id, 'log-weight')
})

test('DismissedSuggestion without required id fails validation', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    dismissedSuggestions: [
      { dismissedAt: new Date() },
    ],
  })
  const err = doc.validateSync()
  assert.ok(err, 'expected validation error')
  assert.match(String(err), /id/)
})

test('DismissedSuggestion auto-defaults dismissedAt to Date.now when omitted', () => {
  const before = Date.now()
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    dismissedSuggestions: [{ id: 'log-weight' }],
  })
  const obj = doc.toObject()
  const at = (obj.dismissedSuggestions[0].dismissedAt as Date).getTime()
  assert.ok(at >= before)
  assert.ok(at <= Date.now())
})
