// NP-209 / CI send-back #2: memberWeightUnit() must never throw, even for a
// userId that isn't a real ObjectId — e.g. "replay-user" / "slot-credit-user"
// fixtures elsewhere in this suite, used before this guard existed and took
// down the whole workout-save path with `CastError: Cast to ObjectId failed`.
// These test fixtures are not real Mongo ids on purpose: the guard must
// short-circuit BEFORE any DB query, so none of these need a live connection.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { memberWeightUnit } from '../../lib/memberWeightUnit'

test('a non-ObjectId userId degrades to undefined instead of throwing', async () => {
  await assert.doesNotReject(async () => {
    const result = await memberWeightUnit('replay-user')
    assert.equal(result, undefined)
  })
})

test('another non-ObjectId fixture id also degrades safely', async () => {
  const result = await memberWeightUnit('slot-credit-user')
  assert.equal(result, undefined)
})

test('empty/missing userId degrades to undefined', async () => {
  assert.equal(await memberWeightUnit(''), undefined)
  assert.equal(await memberWeightUnit(undefined), undefined)
  assert.equal(await memberWeightUnit(null), undefined)
})
