// Run with: npm run test:file tests/unit/allowance/inventoryClaims.test.ts
//
// THE COUNTED CAPS WERE A READ-THEN-WRITE RACE.
//
// `consumeAllowance` took the non-window branch for every inventory feature:
// peekAllowance() ran a countDocuments, compared it to the limit, and the route
// created the row afterwards with nothing serialising the two steps. Ten
// concurrent POST /api/nutrition/foods from a free member sitting at 0/3
// returned 201 TEN times, zero 403s, final used:10 against a limit of 3 —
// measured on production, reproduced from zero on three separate accounts at a
// 100% rate, and true of custom-programs, custom-exercises, custom-meals and
// custom-sessions alike. A delete-then-burst loop made it unbounded.
//
// The windowed path never had this, because it decides from the value an atomic
// increment RETURNED. Inventory could not copy that: what it caps is a live
// count of rows the member owns, and that live count is the only reason
// deleting one frees a slot. So the read stays and the ORDER changes —
// claim first, count second, decide from both (lib/inventoryClaims.ts).
//
// These tests are written against fakes that model the same contract as Mongo
// ($push is atomic and returns the array after the push; the row count is read
// at a moment), and every concurrency case runs the requests genuinely
// interleaved through Promise.all with awaits inside the fakes. The first test
// is the control: it drives the OLD shape through the SAME harness and watches
// the cap fall over, so this file is known to be able to see the defect.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { consumeAllowance, peekAllowance, type AllowanceCtx } from '../../../lib/allowances'
import {
  CLAIM_CAP,
  CLAIM_TTL_MS,
  claimRank,
  claimStoreFrom,
  mintClaimToken,
  openWithRetry,
  type ClaimOps,
  type InventoryClaimStore,
} from '../../../lib/inventoryClaims'
import { FREE_LIMITS } from '../../../lib/entitlements'

const USER = '65f0000000000000000000aa'
const FEATURE = 'custom-foods' as const
const LIMIT = FREE_LIMITS[FEATURE].limit // 3

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** A real yield, so Promise.all interleaves the way concurrent requests do. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * The member's world: rows they own, plus the claim document.
 *
 * `push` mutates SYNCHRONOUSLY between two awaits — that is the contract Mongo
 * gives ($push is atomic and returns the post-push array). Modelling it as a
 * read-modify-write with an await in the middle would put a race in the fake
 * rather than testing the one in the code.
 */
function world(startingRows = 0) {
  let rows = startingRows
  let claims: string[] = []
  let pushes = 0
  let pulls = 0

  const ops: ClaimOps = {
    async push({ token }) {
      await tick()
      pushes += 1
      claims = [...claims, token].slice(-CLAIM_CAP)
      const snapshot = [...claims]
      await tick()
      return snapshot
    },
    async pull({ token }) {
      await tick()
      pulls += 1
      claims = claims.filter((t) => t !== token)
    },
  }

  const ctx: AllowanceCtx = {
    userId: USER,
    claims: claimStoreFrom(ops),
    async countRows() {
      await tick()
      return rows
    },
  }

  return {
    ctx,
    ops,
    get rows() { return rows },
    get claims() { return claims },
    get pushes() { return pushes },
    get pulls() { return pulls },
    seedClaims(tokens: string[]) { claims = [...tokens] },
    deleteRow() { rows -= 1 },

    /** One create request, end to end: gate → write the row → release. */
    async create(enforce = true): Promise<boolean> {
      const gate = await consumeAllowance(FEATURE, ctx, { enforce })
      if (gate.allowed) {
        await tick() // the insert
        rows += 1
      }
      // Production releases this after the response (lib/afterResponse.ts).
      // Either way it happens strictly AFTER the row is committed.
      await gate.releaseClaim?.()
      return gate.allowed
    },

    /** The shape that shipped: count, compare, then write. */
    async createTheOldWay(): Promise<boolean> {
      const state = await peekAllowance(FEATURE, ctx)
      const allowed = state.used < state.limit
      if (allowed) {
        await tick()
        rows += 1
      }
      return allowed
    },
  }
}

// ─── The control: the harness can see the bug ────────────────────────────────

test('CONTROL: the read-then-write shape lets 10 concurrent creates through a limit of 3', async () => {
  const w = world()
  const results = await Promise.all(Array.from({ length: 10 }, () => w.createTheOldWay()))

  assert.equal(results.filter(Boolean).length, 10, 'this is the production defect, reproduced')
  assert.equal(w.rows, 10)
})

// ─── The fix ─────────────────────────────────────────────────────────────────

test('THE BUG: 10 concurrent creates land exactly 3 rows against a limit of 3', async () => {
  const w = world()
  const results = await Promise.all(Array.from({ length: 10 }, () => w.create()))

  assert.equal(results.filter(Boolean).length, LIMIT)
  assert.equal(w.rows, LIMIT, 'the cap is on ROWS, not on how politely they arrived')
  assert.deepEqual(w.claims, [], 'every claim is released once its create finishes')
})

test('the cap holds at every burst size, from 2 to 40', async () => {
  for (const n of [2, 3, 4, 5, 10, 25, 40]) {
    const w = world()
    const results = await Promise.all(Array.from({ length: n }, () => w.create()))
    assert.equal(
      results.filter(Boolean).length,
      Math.min(n, LIMIT),
      `burst of ${n} admitted the wrong number`,
    )
    assert.equal(w.rows, Math.min(n, LIMIT), `burst of ${n} landed the wrong row count`)
  }
})

test('a burst on top of existing rows tops up to the limit and no further', async () => {
  const w = world(2) // already holding 2 of 3
  const results = await Promise.all(Array.from({ length: 6 }, () => w.create()))

  assert.equal(results.filter(Boolean).length, 1)
  assert.equal(w.rows, LIMIT)
})

test('a member already at the cap gets nothing, however many they fire', async () => {
  const w = world(LIMIT)
  const results = await Promise.all(Array.from({ length: 8 }, () => w.create()))

  assert.equal(results.filter(Boolean).length, 0)
  assert.equal(w.rows, LIMIT)
})

test('sequential creates are unaffected — rank 1 means the live count is the whole answer', async () => {
  const w = world()
  assert.equal(await w.create(), true)
  assert.equal(await w.create(), true)
  assert.equal(await w.create(), true)
  assert.equal(await w.create(), false, 'the fourth is refused')
  assert.equal(w.rows, LIMIT)
})

// ─── The escape hatch, which matters more than the cap ───────────────────────

test('deleting frees a slot IMMEDIATELY — there is no counter to catch up', async () => {
  const w = world(LIMIT)
  assert.equal(await w.create(), false)

  w.deleteRow()
  assert.equal(await w.create(), true, 'a delete must free a slot on the very next request')
  assert.equal(w.rows, LIMIT)
})

test('a delete-then-burst loop cannot exceed the cap', async () => {
  const w = world(LIMIT)
  for (let round = 0; round < 3; round += 1) {
    w.deleteRow()
    await Promise.all(Array.from({ length: 6 }, () => w.create()))
    assert.equal(w.rows, LIMIT, `round ${round} broke the cap`)
  }
})

test('a leaked claim stops counting, so a lost release can never lock a member out', async () => {
  const w = world()
  const stale = Date.now() - CLAIM_TTL_MS - 1000
  w.seedClaims([mintClaimToken(stale), mintClaimToken(stale + 1), mintClaimToken(stale + 2)])

  assert.equal(await w.create(), true, 'three stale claims must not stand in for three rows')
  assert.equal(w.rows, 1)
})

test('an unreleased claim is still counted while it is fresh', async () => {
  // The other half of the same rule: fresh means a create really is in flight.
  const w = world(2)
  w.seedClaims([mintClaimToken(Date.now())])

  assert.equal(await w.create(), false, '2 rows + 1 create in flight is already 3')
  assert.equal(w.rows, 2)
})

// ─── Failing open ────────────────────────────────────────────────────────────

test('an unreachable claim store fails OPEN, exactly as the count does', async () => {
  const broken: InventoryClaimStore = {
    async open() { throw new Error('claim store unreachable') },
  }
  const ctx: AllowanceCtx = {
    userId: USER,
    claims: broken,
    async countRows() { return 1 },
  }

  const gate = await consumeAllowance(FEATURE, ctx, { enforce: true })
  assert.equal(gate.allowed, true, 'a metering outage must not take a feature away')
  assert.equal(gate.degraded, true)
  assert.equal(gate.state.used, 1, 'and the live count is still reported honestly')
})

test('failing open still refuses a member who is genuinely at the cap', async () => {
  const broken: InventoryClaimStore = {
    async open() { throw new Error('claim store unreachable') },
  }
  const gate = await consumeAllowance(FEATURE, {
    userId: USER,
    claims: broken,
    async countRows() { return LIMIT },
  }, { enforce: true })

  assert.equal(gate.allowed, false)
  assert.equal(gate.reason, 'limit')
})

// ─── Shadow mode ─────────────────────────────────────────────────────────────

test('shadow mode never denies, and still runs the identical claim + count', async () => {
  const w = world()
  const results = await Promise.all(Array.from({ length: 6 }, () => w.create(false)))

  assert.equal(results.filter(Boolean).length, 6, 'ENTITLEMENTS_ENFORCED off gates nothing')
  assert.equal(w.pushes, 6, 'the claim is taken regardless — flipping the switch changes only the ANSWER')
  assert.equal(w.pulls, 6)
})

test('the number the member is shown is unchanged when nothing is racing', async () => {
  const w = world(2)
  const gate = await consumeAllowance(FEATURE, w.ctx, { enforce: true })
  assert.equal(gate.state.used, 2, 'used is the live count; rank only shows up under a burst')
  assert.equal(gate.state.remaining, 1)
  assert.equal(gate.state.resetsAt, null)
  await gate.releaseClaim?.()
})

// ─── Binary features (limit 0) are untouched ─────────────────────────────────

test('vision still refuses without taking a claim', async () => {
  for (const feature of ['vision'] as const) {
    let opened = 0
    const ctx: AllowanceCtx = {
      userId: USER,
      claims: { async open() { opened += 1; throw new Error('should not be reached') } },
    }
    const gate = await consumeAllowance(feature, ctx, { enforce: true })
    assert.equal(gate.allowed, false, `${feature} must stay closed`)
    assert.equal(gate.reason, 'limit')
    assert.equal(opened, 0, `${feature} counts nothing, so there is nothing to serialise`)
  }
})

// ─── The claim primitives ────────────────────────────────────────────────────

test('rank counts me plus every fresh claim ahead of me IN THE ARRAY', () => {
  const now = 1_000_000
  const a = `${now}:aaa`
  const b = `${now}:bbb`
  const mine = `${now}:ccc`
  const after = `${now}:ddd`

  assert.equal(claimRank([a, b, mine, after], mine, now), 3)
  assert.equal(claimRank([mine], mine, now), 1)
  assert.equal(claimRank([], mine, now), 1, 'I am always counted, even if my token was dropped')
})

test('rank follows arrival order, NOT the token — a burst mints one timestamp', () => {
  // Every claim in a burst is minted in the same millisecond, so anything that
  // ordered by the token would be ordering by a random nonce: two racers would
  // each rank themselves first and both spend the same slot. Position in the
  // array is the arrival order Mongo's $push gives, and every claimant reads
  // the same one.
  const t = 2_000_000
  const first = `${t}:zzzzzz`   // pushed first, sorts LAST by token
  const second = `${t}:aaaaaa`  // pushed second, sorts FIRST by token

  assert.equal(claimRank([first], first, t), 1)
  assert.equal(claimRank([first, second], second, t), 2, 'the second claimant must rank second')
})

test('a claim older than the TTL is ignored', () => {
  const now = 10_000_000
  const mine = `${now}:mine`
  const stale = `${now - CLAIM_TTL_MS - 1}:old`
  assert.equal(claimRank([stale, mine], mine, now), 1)
  assert.equal(claimRank([`${now - CLAIM_TTL_MS + 1}:recent`, mine], mine, now), 2)
})

test('a token from a clock-skewed peer reads as fresh, not as free', () => {
  const now = 10_000_000
  const mine = `${now}:mine`
  const future = `${now + 5_000}:ahead`
  // It arrived first, so it is ahead of me and it counts. A future timestamp
  // must never read as expired: that would be a free slot per skewed clock.
  assert.equal(claimRank([future, mine], mine, now), 2)
})

test('an unparseable token counts as stale rather than throwing', () => {
  const now = 5_000_000
  const mine = `${now}:mine`
  assert.equal(claimRank(['garbage', mine], mine, now), 1)
})

test('a lost insert race retries exactly once and does not double-claim', async () => {
  let pushes = 0
  const ops: ClaimOps = {
    async push({ token }) {
      pushes += 1
      if (pushes === 1) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
      return [token]
    },
    async pull() {},
  }

  const claim = await openWithRetry(ops, { userId: USER, feature: FEATURE, nowMs: Date.now() })
  assert.equal(pushes, 2)
  assert.equal(claim.rank, 1)
})

test('a non-duplicate error propagates, so the consume can fail OPEN', async () => {
  const ops: ClaimOps = {
    async push() { throw new Error('connection reset') },
    async pull() {},
  }
  await assert.rejects(
    () => openWithRetry(ops, { userId: USER, feature: FEATURE, nowMs: Date.now() }),
    /connection reset/,
  )
})

test('release is idempotent — a double release cannot pull a later claim', async () => {
  let pulls = 0
  const ops: ClaimOps = {
    async push({ token }) { return [token] },
    async pull() { pulls += 1 },
  }
  const claim = await openWithRetry(ops, { userId: USER, feature: FEATURE, nowMs: Date.now() })
  await claim.release()
  await claim.release()
  assert.equal(pulls, 1)
})

// ─── The order is the mechanism, so it is pinned in source ───────────────────

test('the inventory consume claims BEFORE it counts', () => {
  const src = read('lib/allowances.ts')
  const fn = src.slice(src.indexOf('async function consumeInventory'))
  const claimAt = fn.indexOf('.open(ctx.userId')
  const countAt = fn.indexOf('await usedFor(feature, ctx)')

  assert.ok(claimAt > 0 && countAt > 0, 'consumeInventory must both claim and count')
  assert.ok(
    claimAt < countAt,
    'counting first re-opens the race: the count could miss a create that has not committed ' +
      'while the rank sees nothing ahead of it',
  )
})

test('the decision adds the rank to the live count', () => {
  const src = read('lib/allowances.ts')
  assert.match(src, /const used = live \+ \(claim\?\.rank \?\? 1\) - 1/)
  assert.match(src, /const withinLimit = used < spec\.limit/)
})

test('the claim is released after the response, and no route may release it', () => {
  const src = read('lib/allowances.ts')
  assert.match(src, /afterResponse\(release\)/)

  // A route calling releaseClaim() would release before its row is committed,
  // which is the race again. It is a test seam and must stay one.
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.name.endsWith('.ts')) continue
      if (/releaseClaim/.test(fs.readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(ROOT, full))
      }
    }
  }
  walk(path.join(ROOT, 'app/api'))
  assert.deepEqual(offenders, [], `releaseClaim is not for routes: ${offenders.join(', ')}`)
})

test('nothing durable is written, so a delete can never be out-voted by a counter', () => {
  // The claim document holds in-flight tokens and an expiry, and nothing else.
  // A `used`/`count` field here would be a second source of truth about how
  // many rows a member owns, and the one that cannot be fixed by deleting.
  const model = read('models/InventoryClaim.ts')
  assert.match(model, /claims: \{ type: \[String\], default: \[\] \}/)
  assert.match(model, /expiresAt: \{ type: Date, required: true \}/)
  assert.doesNotMatch(model, /used:\s*\{\s*type:\s*Number/)
  assert.doesNotMatch(model, /count:\s*\{\s*type:\s*Number/)
  assert.match(model, /InventoryClaimSchema\.index\(\{ userId: 1, feature: 1 \}, \{ unique: true \}\)/)
  assert.match(model, /expireAfterSeconds: 0/)
})

test('every inventory feature goes through the claim, not just custom-foods', async () => {
  const inventory = (Object.keys(FREE_LIMITS) as (keyof typeof FREE_LIMITS)[]).filter(
    (f) => FREE_LIMITS[f].kind === 'inventory' && FREE_LIMITS[f].limit > 0,
  )
  assert.deepEqual(inventory.sort(), [
    'custom-exercises',
    'custom-foods',
    'custom-meals',
    'custom-programs',
    'custom-sessions',
  ])

  for (const feature of inventory) {
    let opened = 0
    const ctx: AllowanceCtx = {
      userId: USER,
      claims: {
        async open(userId, f) {
          opened += 1
          assert.equal(f, feature)
          return { token: 't', rank: 1, async release() {} }
        },
      },
      async countRows() { return 0 },
    }
    await consumeAllowance(feature, ctx, { enforce: true })
    assert.equal(opened, 1, `${feature} took no claim`)
  }
})
