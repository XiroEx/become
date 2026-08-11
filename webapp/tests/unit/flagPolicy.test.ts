// Run with: npx tsx --test tests/unit/flagPolicy.test.ts
//
// Admission policy for food flags. Every rule here exists to bound how many
// GROUNDED SEARCHES get fired, since that is the metered cost in the
// verification pipeline — not tokens.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideFlag,
  canClaim,
  isClaimLive,
  CLAIM_TTL_MS,
  DAILY_FLAG_LIMIT,
  NEW_ACCOUNT_DAILY_FLAG_LIMIT,
  REVERIFY_COOLDOWN_MS,
  type FlagContext,
} from '../../lib/nutrition/flagPolicy'

const NOW = 1_780_000_000_000
const YEAR = 365 * 24 * 60 * 60 * 1000

const ctx = (over: Partial<FlagContext> = {}): FlagContext => ({
  now: NOW,
  userFlagsToday: 0,
  userCreatedAt: NOW - YEAR,
  alreadyFlaggedByUser: false,
  foodState: 'unverified',
  hasPhoto: false,
  ...over,
})

test('a first report on an unverified food dispatches', () => {
  assert.deepEqual(decideFlag(ctx()), { action: 'dispatch' })
})

test('the same user cannot flag the same food twice', () => {
  // Re-flagging is the cheapest way to burn budget, and blocking it makes the
  // flag count a real corroboration signal.
  const d = decideFlag(ctx({ alreadyFlaggedByUser: true }))
  assert.equal(d.action, 'reject')
})

test('over the daily cap the flag is still RECORDED, just queued', () => {
  // A thorough reporter should not be silenced, only deferred.
  const d = decideFlag(ctx({ userFlagsToday: DAILY_FLAG_LIMIT }))
  assert.equal(d.action, 'queue')
  assert.notEqual(d.action, 'reject')
})

test('new accounts get a stricter cap', () => {
  const young = { userCreatedAt: NOW - 60_000 }
  assert.equal(decideFlag(ctx({ ...young, userFlagsToday: NEW_ACCOUNT_DAILY_FLAG_LIMIT })).action, 'queue')
  // ...while an established account is still fine at that count.
  assert.equal(decideFlag(ctx({ userFlagsToday: NEW_ACCOUNT_DAILY_FLAG_LIMIT })).action, 'dispatch')
})

test('a flag during an in-flight run attaches instead of dispatching a second', () => {
  const d = decideFlag(ctx({ foodState: 'running', claimedAt: NOW - 1000, runId: 'run_abc' }))
  assert.deepEqual(d, { action: 'attach', runId: 'run_abc' })
})

test('a STALE claim does not count as in flight', () => {
  // Runs die mid-flight and leave state behind — an ssh_shell keepalive timeout
  // did exactly that today. Without expiry, one dead run wedges a food forever.
  const d = decideFlag(ctx({ foodState: 'running', claimedAt: NOW - CLAIM_TTL_MS - 1, runId: 'run_dead' }))
  assert.deepEqual(d, { action: 'dispatch' })
})

test('a recently verified food is not re-run on suspicion alone', () => {
  const recent = { foodState: 'verified' as const, verifiedAt: NOW - 1000 }
  assert.equal(decideFlag(ctx(recent)).action, 'queue')
})

test('...but a photo of the panel overrides the cooldown', () => {
  // The person holding the package outranks our last check.
  const d = decideFlag(ctx({ foodState: 'verified', verifiedAt: NOW - 1000, hasPhoto: true }))
  assert.deepEqual(d, { action: 'dispatch' })
})

test('an old verification re-runs without needing a photo', () => {
  const d = decideFlag(ctx({ foodState: 'verified', verifiedAt: NOW - REVERIFY_COOLDOWN_MS - 1 }))
  assert.deepEqual(d, { action: 'dispatch' })
})

test('rejection beats every other rule', () => {
  // Already-flagged is checked first, so a duplicate never even reaches the
  // dispatch path regardless of how attractive the other conditions look.
  const d = decideFlag(
    ctx({ alreadyFlaggedByUser: true, hasPhoto: true, foodState: 'unverified' }),
  )
  assert.equal(d.action, 'reject')
})

test('claim liveness is bounded by the TTL', () => {
  assert.equal(isClaimLive({ now: NOW, claimedAt: NOW - 1000 }), true)
  assert.equal(isClaimLive({ now: NOW, claimedAt: NOW - CLAIM_TTL_MS }), false)
  assert.equal(isClaimLive({ now: NOW, claimedAt: undefined }), false)
})

test('canClaim mirrors the atomic database guard', () => {
  assert.equal(canClaim({ now: NOW, foodState: 'unverified' }), true)
  assert.equal(canClaim({ now: NOW, foodState: 'verified' }), true)
  // Held by a live run.
  assert.equal(canClaim({ now: NOW, foodState: 'running', claimedAt: NOW - 1000 }), false)
  // Held by a dead one.
  assert.equal(canClaim({ now: NOW, foodState: 'running', claimedAt: NOW - CLAIM_TTL_MS - 1 }), true)
  // Queued with no claim stamp at all is reclaimable rather than wedged.
  assert.equal(canClaim({ now: NOW, foodState: 'queued' }), true)
})
