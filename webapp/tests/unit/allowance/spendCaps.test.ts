// Run with: npx tsx --test tests/unit/allowance/spendCaps.test.ts
//
// Spend ceilings are NOT the paywall, and every difference matters.
//
// They exist because several AI surfaces dispatch with no user in the loop:
// lib/mind/precompose.ts composes a session on app open, MindJourney fetches
// suggestions from an effect, and the food-flag pipeline can relaunch itself.
// All three were braked only by localStorage, which is per device, per browser
// profile, and gone with any storage wipe. A client-side cooldown is not a
// spend limit.
//
// But they must not become a price by accident: no upsell, identical for free
// and plus, and OFF until someone deliberately turns them on — the launch
// contract is "zero user-visible gating until the switch is flipped".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SPEND_CAPS,
  SPEND_CAP_KEYS,
  abuseCapsEnforced,
  chargeSpendCap,
  spendCapLedgerKey,
} from '../../../lib/spendCaps'
import { __clearTzCache, __primeTzCache } from '../../../lib/allowances'
import type { AllowanceLedger, ChargeQuery, LedgerCounts } from '../../../lib/allowanceLedger'

const USER = '65f0000000000000000000bb'

function fakeLedger() {
  const rows = new Map<string, LedgerCounts>()
  const charges: ChargeQuery[] = []
  const ledger: AllowanceLedger = {
    async charge(q) {
      charges.push(q)
      const k = `${q.feature}|${q.bucketKey}`
      const row = rows.get(k) ?? { used: 0, followUps: 0, refunds: 0 }
      row[q.field ?? 'used'] += 1
      rows.set(k, row)
      return { ...row, charged: true, ticketId: `t${charges.length}` }
    },
    async read() { return null },
    async giveBack() {},
  }
  __clearTzCache()
  __primeTzCache(USER, 0)
  return { ledger, charges }
}

function withEnv(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.ALLOWANCE_ABUSE_CAPS_ENFORCED
  if (value === undefined) delete process.env.ALLOWANCE_ABUSE_CAPS_ENFORCED
  else process.env.ALLOWANCE_ABUSE_CAPS_ENFORCED = value
  return fn().finally(() => {
    if (prev === undefined) delete process.env.ALLOWANCE_ABUSE_CAPS_ENFORCED
    else process.env.ALLOWANCE_ABUSE_CAPS_ENFORCED = prev
  })
}

// ─── The switch ──────────────────────────────────────────────────────────────

test('ceilings are OFF unless explicitly enabled', async () => {
  await withEnv(undefined, async () => assert.equal(abuseCapsEnforced(), false))
  await withEnv('', async () => assert.equal(abuseCapsEnforced(), false))
  await withEnv('false', async () => assert.equal(abuseCapsEnforced(), false))
  await withEnv('maybe', async () => assert.equal(abuseCapsEnforced(), false))
})

test('the truthy spellings all work, so a plausible value is never silently ignored', async () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) {
    await withEnv(v, async () => assert.equal(abuseCapsEnforced(), true, `${v} should enable`))
  }
})

test('with the ceiling off, nothing is ever refused — but everything is counted', async () => {
  await withEnv(undefined, async () => {
    const l = fakeLedger()
    const cap = SPEND_CAPS['mind-composition'].limit
    let last = await chargeSpendCap(USER, 'mind-composition', { ledger: l.ledger })
    for (let i = 0; i < cap + 5; i += 1) {
      last = await chargeSpendCap(USER, 'mind-composition', { ledger: l.ledger })
    }
    assert.equal(last.allowed, true, 'launch day must see zero user-visible gating')
    assert.equal(last.used, cap + 6, 'but the real distribution is recorded from day one')
    assert.equal(l.charges[0].shadow, true)
  })
})

test('with the ceiling on, the limit bites at exactly the stated number', async () => {
  await withEnv('true', async () => {
    const l = fakeLedger()
    const cap = SPEND_CAPS['food-verification'].limit
    for (let i = 1; i <= cap; i += 1) {
      const r = await chargeSpendCap(USER, 'food-verification', { ledger: l.ledger })
      assert.equal(r.allowed, true, `dispatch ${i} of ${cap} should pass`)
    }
    const over = await chargeSpendCap(USER, 'food-verification', { ledger: l.ledger })
    assert.equal(over.allowed, false)
    assert.equal(over.remaining, 0)
  })
})

// ─── Not a paywall ───────────────────────────────────────────────────────────

test('admin bypasses every ceiling and is not even counted', async () => {
  await withEnv('true', async () => {
    const l = fakeLedger()
    const r = await chargeSpendCap(USER, 'coach-message', { ledger: l.ledger, role: 'admin' })
    assert.equal(r.allowed, true)
    assert.equal(l.charges.length, 0)
  })
})

test('a ceiling refusal carries no tier and no feature', async () => {
  // lib/entitlementsClient.ts#gateFrom only raises the upgrade sheet for a 403
  // carrying BOTH `feature` and `requiresTier`. A ceiling is not something
  // money fixes, so its refusal must never satisfy that shape.
  const keys = Object.keys(SPEND_CAPS['coach-message'])
  assert.ok(!keys.includes('requiresTier'))
  assert.ok(!keys.includes('feature'))
})

test('every ceiling sits far above a real session', async () => {
  for (const key of SPEND_CAP_KEYS) {
    assert.ok(
      SPEND_CAPS[key].limit >= 20,
      `${key} is tight enough that a genuine member could meet it`,
    )
  }
})

test('ceiling rows cannot collide with a priced feature in the shared ledger', async () => {
  await withEnv('true', async () => {
    const l = fakeLedger()
    await chargeSpendCap(USER, 'coach-message', { ledger: l.ledger })
    assert.equal(l.charges[0].feature, 'cap:coach-message')
    assert.equal(spendCapLedgerKey('coach-message'), 'cap:coach-message')
    for (const key of SPEND_CAP_KEYS) {
      assert.match(spendCapLedgerKey(key), /^cap:/)
    }
  })
})

// ─── Failure posture ─────────────────────────────────────────────────────────

test('a ledger outage fails OPEN — a metering blip must not take the coach offline', async () => {
  await withEnv('true', async () => {
    __clearTzCache()
    __primeTzCache(USER, 0)
    const broken: AllowanceLedger = {
      async charge() { throw new Error('ledger unreachable') },
      async read() { return null },
      async giveBack() {},
    }
    const r = await chargeSpendCap(USER, 'coach-message', { ledger: broken })
    assert.equal(r.allowed, true)
    assert.equal(r.degraded, true)
  })
})

test('a ceiling charge hands back a ticket so a failed trigger can be refunded', async () => {
  await withEnv('true', async () => {
    const l = fakeLedger()
    const r = await chargeSpendCap(USER, 'coach-message', { ledger: l.ledger })
    assert.ok(r.ticketId)
  })
})
