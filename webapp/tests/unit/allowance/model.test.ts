// Run with: npx tsx --test tests/unit/allowance/model.test.ts
//
// The schema, in process, with no database.
//
// The unique compound index is not a nicety here — it is the mechanism. Without
// it the charge upsert can create a SECOND row for the same window under
// concurrency, and then two racing claims each increment their own private
// counter, each read "1", and each pass a limit of 1. The whole atomicity story
// in lib/allowanceLedger.ts rests on this one index existing, and an index is
// exactly the kind of thing that gets dropped in a refactor without anything
// failing to compile.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import AllowanceUsage, { ROW_RETENTION_MS } from '../../../models/AllowanceUsage'

type IndexSpec = [Record<string, number>, Record<string, unknown> | undefined]

const indexes = () => AllowanceUsage.schema.indexes() as unknown as IndexSpec[]

function findIndex(keys: string[]): IndexSpec | undefined {
  return indexes().find(([def]) => {
    const got = Object.keys(def)
    return got.length === keys.length && keys.every((k, i) => got[i] === k)
  })
}

test('the claim key is a UNIQUE compound index', () => {
  const idx = findIndex(['userId', 'feature', 'bucketKey'])
  assert.ok(idx, 'the {userId, feature, bucketKey} index is missing')
  assert.equal(
    idx![1]?.unique,
    true,
    'without unique, one window can fork into two rows and two racing claims both pass'
  )
})

test('closed windows clean themselves up', () => {
  const idx = findIndex(['expiresAt'])
  assert.ok(idx, 'the TTL index is missing')
  assert.equal(idx![1]?.expireAfterSeconds, 0)
})

test('a member\'s live windows are one index hit', () => {
  const idx = findIndex(['userId', 'resetsAt'])
  assert.ok(idx, 'the dashboard peek would collection-scan without this')
})

test('retention outlives the window by enough to analyse a month of shadow data', () => {
  assert.ok(ROW_RETENTION_MS >= 30 * 24 * 60 * 60 * 1000)
})

test('a well-formed row validates, and the counters start at zero', () => {
  const now = new Date('2026-09-02T04:00:00.000Z')
  const doc = new AllowanceUsage({
    userId: new Types.ObjectId(),
    feature: 'ai-food-estimate',
    bucketKey: '2026-09-01',
    resetsAt: now,
    expiresAt: new Date(now.getTime() + ROW_RETENTION_MS),
  })

  assert.equal(doc.validateSync(), undefined)
  assert.equal(doc.used, 0)
  assert.equal(doc.followUps, 0)
  assert.equal(doc.refunds, 0)
  assert.equal(doc.shadow, false, 'a row must not claim shadow provenance it was not given')
  assert.deepEqual(doc.dedupes, [])
  assert.deepEqual(doc.refunded, [])
})

test('the window identity fields are required', () => {
  for (const missing of ['userId', 'feature', 'bucketKey', 'resetsAt', 'expiresAt']) {
    const base: Record<string, unknown> = {
      userId: new Types.ObjectId(),
      feature: 'ai-food-estimate',
      bucketKey: '2026-09-01',
      resetsAt: new Date(),
      expiresAt: new Date(),
    }
    delete base[missing]
    const err = new AllowanceUsage(base).validateSync()
    assert.ok(err?.errors?.[missing], `${missing} must be required — a row without it cannot be found again`)
  }
})

test('a counter cannot be persisted negative', () => {
  const doc = new AllowanceUsage({
    userId: new Types.ObjectId(),
    feature: 'ai-food-estimate',
    bucketKey: '2026-09-01',
    resetsAt: new Date(),
    expiresAt: new Date(),
    used: -1,
  })
  assert.ok(doc.validateSync()?.errors?.used, 'a refund bug must not be able to hand out free units')
})

test('`feature` is an open string, so spend-cap rows share the collection', () => {
  // cap:* rows are ceilings, not priced features. A schema enum over Feature
  // would reject them at the write and silently disable every abuse cap.
  const doc = new AllowanceUsage({
    userId: new Types.ObjectId(),
    feature: 'cap:mind-composition',
    bucketKey: '2026-09-01',
    resetsAt: new Date(),
    expiresAt: new Date(),
  })
  assert.equal(doc.validateSync(), undefined)
})
