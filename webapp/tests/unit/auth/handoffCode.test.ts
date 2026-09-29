// Run with: npm run test:file tests/unit/auth/handoffCode.test.ts
//
// The half of the hand-off that is MONGO SEMANTICS and cannot be faked: a code
// is spent exactly once, by exactly one caller, and an expired one buys
// nothing. Drives the real model against the loopback, disposable test database
// (tests/unit/_guard.ts refuses to let it point anywhere else).
//
// Why a race test: the claim is one atomic findOneAndUpdate filtered on
// `usedAt: null`. Written as read-then-write — find the row, check it, mark it
// — two browsers opening the same URL at the same moment would BOTH get a
// session, which is the whole failure mode a single-use code exists to prevent.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

import HandoffCode, {
  claimHandoffCode,
  createHandoffCode,
  generateHandoffCode,
  hashHandoffCode,
} from '../../../models/HandoffCode'
import { HANDOFF_CODE_TTL_MS, decideRedemption } from '../../../lib/authHandoff'

/** Every row this file writes carries it, so cleanup cannot touch anything else. */
const USER = 'handoff-test-user'

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
})

after(async () => {
  await HandoffCode.deleteMany({ userId: new RegExp(`^${USER}`) })
  await mongoose.disconnect()
})

test('a minted code is redeemable exactly once', async () => {
  const now = new Date()
  const { code, expiresAt } = await createHandoffCode({
    userId: USER,
    path: '/dashboard/programs/new',
    now,
  })

  assert.equal(expiresAt.getTime() - now.getTime(), HANDOFF_CODE_TTL_MS)

  const first = await claimHandoffCode(code, now)
  assert.ok(first, 'the first redemption found nothing to claim')
  assert.deepEqual(decideRedemption(first, now), {
    ok: true,
    userId: USER,
    path: '/dashboard/programs/new',
  })

  // Second time: the row is already burned, so the claim matches nothing and
  // the decision is a refusal — NOT another session.
  const second = await claimHandoffCode(code, new Date(now.getTime() + 1))
  assert.equal(second, null, 'a spent code was claimed a second time')
  assert.deepEqual(decideRedemption(second, now), { ok: false, reason: 'unknown_or_used' })
})

test('two redemptions racing the same code produce exactly one winner', async () => {
  const now = new Date()
  const { code } = await createHandoffCode({ userId: USER, path: '/dashboard', now })

  const results = await Promise.all([
    claimHandoffCode(code, now),
    claimHandoffCode(code, now),
    claimHandoffCode(code, now),
  ])
  assert.equal(results.filter(Boolean).length, 1, 'more than one caller claimed the same code')
})

test('an expired code is refused, and is burned by the attempt', async () => {
  const minted = new Date(Date.now() - 10 * 60_000)
  const { code, expiresAt } = await createHandoffCode({
    userId: USER,
    path: '/dashboard',
    now: minted,
  })
  const now = new Date()
  assert.ok(expiresAt.getTime() < now.getTime(), 'the fixture is not actually expired')

  const claim = await claimHandoffCode(code, now)
  assert.ok(claim, 'the row should still be claimable — expiry is decided in code')
  assert.deepEqual(decideRedemption(claim, now), { ok: false, reason: 'expired' })

  // …and the attempt spent it, so a code cannot be ground against the clock.
  assert.equal(await claimHandoffCode(code, now), null)
})

test('an unknown code is refused the same way a spent one is', async () => {
  const claim = await claimHandoffCode(generateHandoffCode(), new Date())
  assert.equal(claim, null)
  assert.deepEqual(decideRedemption(claim, new Date()), { ok: false, reason: 'unknown_or_used' })
})

test('a code is bound to the member it was minted for', async () => {
  const now = new Date()
  const mine = await createHandoffCode({ userId: `${USER}-a`, path: '/dashboard', now })
  const theirs = await createHandoffCode({ userId: `${USER}-b`, path: '/dashboard', now })

  const claim = await claimHandoffCode(mine.code, now)
  assert.equal(claim?.userId, `${USER}-a`)

  // Nothing about one member's code touches another's.
  const other = await claimHandoffCode(theirs.code, now)
  assert.equal(other?.userId, `${USER}-b`)
})

test('the code itself is never stored — only its hash', async () => {
  const now = new Date()
  const { code } = await createHandoffCode({ userId: USER, path: '/dashboard', now })

  const rows = await HandoffCode.find({ userId: USER }).lean()
  const serialised = JSON.stringify(rows)
  assert.ok(!serialised.includes(code), 'the raw code is readable in the collection')

  const row = await HandoffCode.findOne({ codeHash: hashHandoffCode(code) }).lean()
  assert.ok(row, 'the hash is not what the row is found by')
  assert.equal(row?.path, '/dashboard')
})

test('the claim is filtered on an UNUSED code, not merely on the code', async () => {
  // The filter is the single-use rule. Pinned against the model's own index
  // usage so a refactor that drops `usedAt: null` fails here rather than in
  // production, where it would look like nothing at all.
  const now = new Date()
  const { code } = await createHandoffCode({ userId: USER, path: '/dashboard', now })
  await claimHandoffCode(code, now)

  const row = await HandoffCode.findOne({ codeHash: hashHandoffCode(code) }).lean()
  assert.ok(row?.usedAt instanceof Date, 'the claim did not record when the code was spent')
})
