// Run with: npm run test:file tests/unit/allowance/windowAnchor.test.ts
//
// THE DAILY WINDOW IS NOT THE CLIENT'S TO CHOOSE.
//
// A direct `tz` on an AI call was already ignored — windowTzOffset() reads the
// member's stored profile instead. But the STORED offset is client-written:
// POST /api/workouts accepts `tz` and persists it verbatim, and that field keys
// the allowance bucket. Proven on production:
//
//   1. spend the 1/day food estimate            → 403, remaining 0
//   2. POST /api/workouts { kind:'quick', tz:-720 }
//   3. wait out the 60s timezone memo
//   4. GET /api/me/entitlements                 → remaining 1
//   5. estimate again                           → 200
//
// Repeatable at will, because 26 hours of legitimate offsets always contain a
// local date that is not the one you just spent.
//
// Validating the offset cannot fix that (every value used above is a real
// timezone), so the rule is ONE WINDOW PER ELAPSED WINDOW: the ledger says
// which window the member is in and when it ends, and a clock change can
// neither leave it early nor walk back into it. What follows drives both
// directions, plus the two things an honest traveller must not lose.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  anchorBucket,
  consumeAllowance,
  peekAllowance,
  currentWindowKey,
  windowBucket,
  __clearTzCache,
  __primeTzCache,
} from '../../../lib/allowances'
import type {
  AllowanceLedger,
  ChargeQuery,
  ChargeResult,
  LedgerCounts,
  WindowAnchor,
} from '../../../lib/allowanceLedger'

const USER = '65f0000000000000000000aa'
/** Eastern Daylight Time — 240 minutes WEST of UTC (browser convention). */
const EDT = 240
/** UTC+12 — 720 minutes EAST. The offset the live exploit reported. */
const NZ = -720

/**
 * The real contract, including the anchor read: one counter per (feature,
 * bucketKey), a `resetsAt` remembered per row, and `latest()` answering with
 * the newest row the member has.
 */
function fakeLedger() {
  const rows = new Map<string, LedgerCounts & { bucketKey: string; resetsAt: Date }>()
  const keyOf = (q: { feature: string; bucketKey: string }) => `${q.feature}|${q.bucketKey}`

  const ledger: AllowanceLedger = {
    async charge(q: ChargeQuery): Promise<ChargeResult> {
      const k = keyOf(q)
      const row = rows.get(k) ?? {
        used: 0,
        followUps: 0,
        refunds: 0,
        bucketKey: q.bucketKey,
        resetsAt: q.resetsAt,
      }
      row[q.field ?? 'used'] += 1
      rows.set(k, row)
      return { used: row.used, followUps: row.followUps, refunds: row.refunds, charged: true, ticketId: `t-${k}` }
    },
    async read(q) {
      const row = rows.get(keyOf(q))
      return row ? { used: row.used, followUps: row.followUps, refunds: row.refunds } : null
    },
    async giveBack() {},
    async latest(q): Promise<WindowAnchor | null> {
      const mine = [...rows.entries()]
        .filter(([k]) => k.startsWith(`${q.feature}|`))
        .map(([, r]) => r)
      if (!mine.length) return null
      const newest = mine.reduce((a, b) => (a.resetsAt > b.resetsAt ? a : b))
      return { bucketKey: newest.bucketKey, resetsAt: newest.resetsAt }
    },
  }
  return { ledger, rows }
}

function ctxFor(l: ReturnType<typeof fakeLedger>, tz: number) {
  __clearTzCache()
  __primeTzCache(USER, tz)
  return { userId: USER, ledger: l.ledger }
}

/** Move the member's stored offset, as POST /api/workouts { tz } would. */
function moveClock(tz: number) {
  __clearTzCache()
  __primeTzCache(USER, tz)
}

// ─── The exploit, end to end ─────────────────────────────────────────────────

test('a clock change cannot mint a second daily estimate', async () => {
  const l = fakeLedger()
  // 01:00 UTC — 21:00 the previous evening in New York, already tomorrow in NZ.
  const now = new Date('2026-09-04T01:00:00Z')

  const first = await consumeAllowance('ai-food-estimate', ctxFor(l, EDT), { enforce: true, now })
  assert.equal(first.allowed, true)
  const spentKey = [...l.rows.values()][0].bucketKey
  assert.equal(spentKey, '2026-09-03', 'the member spent their New York Thursday')

  // The exploit: report a timezone far enough east to be on the next date.
  moveClock(NZ)
  assert.equal(
    windowBucket('day', NZ, now).key,
    '2026-09-04',
    'precondition: the raw offset really does land on a different date',
  )

  const second = await consumeAllowance('ai-food-estimate', { userId: USER, ledger: l.ledger }, { enforce: true, now })
  assert.equal(second.allowed, false, 'moving the clock must not open a new window')
  assert.equal(second.state.remaining, 0)
  assert.equal(l.rows.size, 1, 'and must not open a second ledger row')
})

test('and /api/me/entitlements reports the same window the gate uses', async () => {
  // Two answers to "which day is it" is how a member reads 1/1 remaining while
  // the gate reads 0/1 — the peek goes through the same anchor.
  //
  // The peek is handed the SAME `now` as the consume. Reading the real clock
  // here instead made this test a time bomb: it passed only while wall-clock
  // sat inside the fixture's window and has been red since 2026-09-04T04:00Z.
  const l = fakeLedger()
  const now = new Date('2026-09-04T01:00:00Z')
  await consumeAllowance('ai-food-estimate', ctxFor(l, EDT), { enforce: true, now })

  moveClock(NZ)
  const peek = await peekAllowance('ai-food-estimate', { userId: USER, ledger: l.ledger }, now)
  assert.equal(peek.used, 1)
  assert.equal(peek.remaining, 0)
})

test('the follow-up ticket minted before the change still names the current window', async () => {
  // Same fixed clock as the consume, for the same reason as above.
  //
  // The ticket carries the bucketKey its parent unit was charged in. If the
  // bucket followed the clock, a member who crossed a zone mid-correction
  // would have their correction charged as a second estimate — the same
  // outcome billed twice.
  const l = fakeLedger()
  const now = new Date('2026-09-04T01:00:00Z')
  await consumeAllowance('ai-food-estimate', ctxFor(l, EDT), { enforce: true, now })
  const atMint = await currentWindowKey('ai-food-estimate', { userId: USER, ledger: l.ledger }, now)

  moveClock(NZ)
  const afterMove = await currentWindowKey('ai-food-estimate', { userId: USER, ledger: l.ledger }, now)
  assert.equal(afterMove, atMint)
  assert.equal(atMint, '2026-09-03', 'and it is the window the consume actually charged')
})

// ─── The honest traveller ────────────────────────────────────────────────────

test('one window per elapsed window, flying east', async () => {
  const l = fakeLedger()
  const morning = new Date('2026-09-03T13:00:00Z') // 09:00 in New York
  await consumeAllowance('ai-food-estimate', ctxFor(l, EDT), { enforce: true, now: morning })

  // Lands in NZ the same evening — locally it is already the 4th.
  moveClock(NZ)
  const inFlight = await consumeAllowance(
    'ai-food-estimate',
    { userId: USER, ledger: l.ledger },
    { enforce: true, now: new Date('2026-09-03T20:00:00Z') },
  )
  assert.equal(inFlight.allowed, false, 'no gain: the New York day has not ended yet')

  // 04:00 UTC on the 4th — midnight in New York, so the window they were in
  // has genuinely rolled, and NZ is well into its own next day.
  const next = await consumeAllowance(
    'ai-food-estimate',
    { userId: USER, ledger: l.ledger },
    { enforce: true, now: new Date('2026-09-04T04:00:00Z') },
  )
  assert.equal(next.allowed, true, 'no loss: the next window opens on time')
})

test('flying west does not re-charge a window that is already spent', async () => {
  const l = fakeLedger()
  // Spend the 3rd in New York, at 23:00 local.
  await consumeAllowance('ai-food-estimate', ctxFor(l, EDT), {
    enforce: true,
    now: new Date('2026-09-04T03:00:00Z'),
  })

  // Fly to Hawaii (UTC-10) and it is still the 3rd there, but New York has
  // rolled over. The bucket must not step BACK into the spent day and it must
  // not hand out a bonus one either.
  moveClock(600)
  const back = await consumeAllowance(
    'ai-food-estimate',
    { userId: USER, ledger: l.ledger },
    { enforce: true, now: new Date('2026-09-04T05:30:00Z') },
  )
  assert.equal(back.allowed, false)
  assert.equal(l.rows.size, 1, 'no second row for a day they already spent')
})

// ─── The rule itself ─────────────────────────────────────────────────────────

const bucket = (key: string, resetsAt: string) => ({ key, resetsAt })

test('anchorBucket: a live window cannot be left early', () => {
  const now = new Date('2026-09-03T20:00:00Z')
  const out = anchorBucket(
    bucket('2026-09-04', '2026-09-04T12:00:00Z'),
    { bucketKey: '2026-09-03', resetsAt: new Date('2026-09-04T04:00:00Z') },
    now,
  )
  assert.deepEqual(out, { key: '2026-09-03', resetsAt: '2026-09-04T04:00:00.000Z' })
})

test('anchorBucket: an elapsed window cannot be re-entered', () => {
  const now = new Date('2026-09-04T05:30:00Z')
  const out = anchorBucket(
    bucket('2026-09-03', '2026-09-04T10:00:00Z'),
    { bucketKey: '2026-09-03', resetsAt: new Date('2026-09-04T04:00:00Z') },
    now,
  )
  // Held in the spent bucket, but told the truth about when a new one opens.
  assert.equal(out.key, '2026-09-03')
  assert.equal(out.resetsAt, '2026-09-04T10:00:00Z')
})

test('anchorBucket: time moving on is not a clock change', () => {
  const now = new Date('2026-09-04T05:00:00Z')
  const base = bucket('2026-09-04', '2026-09-05T04:00:00Z')
  const out = anchorBucket(base, { bucketKey: '2026-09-03', resetsAt: new Date('2026-09-04T04:00:00Z') }, now)
  assert.deepEqual(out, base, 'the ordinary rollover must pass straight through')
})

test('anchorBucket: no anchor, no opinion', () => {
  const base = bucket('2026-09-04', '2026-09-05T04:00:00Z')
  assert.deepEqual(anchorBucket(base, null, new Date()), base)
})

test('week buckets sort the same way day buckets do', () => {
  // 'W2026-08-31' < 'W2026-09-07' lexicographically, which is the only
  // comparison anchorBucket makes.
  const now = new Date('2026-09-04T20:00:00Z')
  const out = anchorBucket(
    bucket('W2026-09-07', '2026-09-14T04:00:00Z'),
    { bucketKey: 'W2026-08-31', resetsAt: new Date('2026-09-07T04:00:00Z') },
    now,
  )
  assert.equal(out.key, 'W2026-08-31', 'a clock change must not jump the member into next week')
})

test('a ledger that cannot answer fails OPEN', async () => {
  // A metering outage must never take a feature away from someone entitled to
  // it — same posture as every other read in lib/allowances.ts.
  const l = fakeLedger()
  const blind: AllowanceLedger = {
    charge: l.ledger.charge.bind(l.ledger),
    read: l.ledger.read.bind(l.ledger),
    giveBack: l.ledger.giveBack.bind(l.ledger),
    async latest() {
      throw new Error('ledger unreachable')
    },
  }
  __clearTzCache()
  __primeTzCache(USER, EDT)
  const res = await consumeAllowance('ai-food-estimate', { userId: USER, ledger: blind }, {
    enforce: true,
    now: new Date('2026-09-04T01:00:00Z'),
  })
  assert.equal(res.allowed, true)
})
