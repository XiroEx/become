// Run with: npm run test:file tests/unit/timezone/meTimezoneRoute.test.ts
//
// ─── THE MEMBER WHO ONLY LOGS FOOD ───────────────────────────────────────────
//
// Every sweep in the notify cron SKIPS a member with no stored timezone (see
// app/api/cron/notify/route.ts — `timezoneOffset: { $exists: true }`), and the
// only route that ever stored one was POST /api/workouts. So a member who logs
// food, or runs Mind sessions, and never saves a workout received no reminders
// at all, and their windowed AI allowances were bucketed on UTC.
//
// POST /api/me/timezone is the fix: both apps call it when they open, at most
// once per local day. Because the field it writes is a PAYWALL INPUT as well as
// a notification input, this file drives the real route against the real
// (loopback, disposable) test database and pins both halves:
//
//   • what a report is allowed to mean — a valid offset lands, a stand-in `0`
//     with nothing to corroborate it does not, and neither does a non-number
//     or an out-of-range value;
//   • that writing this field mid-day cannot open a second AI-estimate window.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { POST } from '../../../app/api/me/timezone/route'
import UserProgress from '../../../models/UserProgress'
import { signToken } from '../../../lib/auth'
import { __clearTimezoneCache } from '../../../lib/captureUserTimezone'
import {
  CHECK_IN_REMINDER_START_HOUR,
  CHECK_IN_REMINDER_END_HOUR,
  localHourForUser,
} from '../../../lib/notifications/cronNotify'
import {
  consumeAllowance,
  windowBucket,
  __clearTzCache,
} from '../../../lib/allowances'
import type {
  AllowanceLedger,
  ChargeQuery,
  ChargeResult,
  LedgerCounts,
  WindowAnchor,
} from '../../../lib/allowanceLedger'

const USER_ID = '65f00000000000000000fa01'
/** New York in summer: minutes WEST of UTC, `Date.getTimezoneOffset()` units. */
const EDT = 240
/** UTC+12 with no daylight saving, so this test reads the same all year. */
const FAR_EAST_ZONE = 'Pacific/Tarawa'
const FAR_EAST = -720

let auth: string

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  auth = `Bearer ${await signToken({ userId: USER_ID, email: 'food-only@example.com' })}`
})

after(async () => {
  await UserProgress.deleteMany({ userId: USER_ID })
  await mongoose.disconnect()
})

beforeEach(async () => {
  await UserProgress.deleteMany({ userId: USER_ID })
  // The module-level dedupe cache would otherwise swallow the second case's
  // write, and the allowance memo would answer with a stale offset.
  __clearTimezoneCache()
  __clearTzCache()
})

function req(body: unknown, authHeader: string | null = null): NextRequest {
  // `null` means "use the signed-in member"; an explicit '' means no header at
  // all. A default parameter cannot express that — `undefined` would take the
  // default and silently authenticate the anonymous case.
  authHeader = authHeader === null ? auth : authHeader
  return build(body, authHeader)
}

function build(body: unknown, authHeader: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/me/timezone', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function stored(): Promise<{ timezoneOffset?: number; timezone?: string } | null> {
  return UserProgress.findOne({ userId: USER_ID })
    .select('timezoneOffset timezone')
    .lean<{ timezoneOffset?: number; timezone?: string } | null>()
}

// ─── Auth ────────────────────────────────────────────────────────────────────

test('POST /api/me/timezone: no auth → 401, and nothing is written', async () => {
  const res = await POST(req({ tz: EDT, tzZone: 'America/New_York' }, ''))
  assert.equal(res.status, 401)
  assert.equal(await stored(), null)
})

// ─── A valid offset ──────────────────────────────────────────────────────────

test('a valid offset is stored, so the check-in reminder can find them', async () => {
  const res = await POST(req({ tz: EDT, tzZone: 'America/New_York' }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    stored: true,
    timezoneOffset: EDT,
    timezone: 'America/New_York',
  })

  const doc = await stored()
  assert.equal(doc?.timezoneOffset, EDT)
  assert.equal(doc?.timezone, 'America/New_York')

  // This member has never saved a workout — they only log food — and they are
  // now inside the cron's candidate query rather than skipped by it.
  assert.ok(
    await UserProgress.exists({ userId: USER_ID, timezoneOffset: { $exists: true } }),
    'the daily check-in sweep selects on exactly this',
  )

  // And the hour it places them in is their own. 16:00 UTC is midday in New
  // York, inside the 12:00-16:00 LOCAL check-in window; at UTC (which is what
  // an unstored member is treated as) the same instant is 16:00 — and the 12:00
  // UTC sweep, which IS their midday sweep, would have read 12 for a member who
  // is actually at 08:00.
  const noon = new Date('2026-07-15T16:00:00Z')
  const hour = localHourForUser(noon, doc?.timezoneOffset, doc?.timezone)
  assert.equal(hour, 12)
  assert.ok(
    hour !== null && hour >= CHECK_IN_REMINDER_START_HOUR && hour <= CHECK_IN_REMINDER_END_HOUR,
    'a food-only member is reachable in their own early afternoon',
  )
  assert.equal(localHourForUser(noon, undefined), null, 'with nothing stored they are skipped')
})

test('a verifiable zone outranks the number beside it', async () => {
  // The number is the half the server cannot check. A caller reporting a New
  // Zealand offset with a New York zone is stored as New York.
  const res = await POST(req({ tz: FAR_EAST, tzZone: 'America/New_York' }))
  assert.equal(res.status, 200)
  const doc = await stored()
  assert.equal(doc?.timezone, 'America/New_York')
  assert.ok(doc?.timezoneOffset === 240 || doc?.timezoneOffset === 300, 'EDT or EST, never -720')
})

// ─── Everything that must NOT change the stored zone ─────────────────────────

test('a stand-in 0 with no zone is refused', async () => {
  // "0" is what a client fabricates when it does not know, and this route
  // exists for members with NOTHING stored — so a wrong 0 is not a correction,
  // it is a 3am push. Real UTC is accepted when the zone corroborates it (see
  // the next test).
  await POST(req({ tz: EDT, tzZone: 'America/New_York' }))
  __clearTimezoneCache()

  const res = await POST(req({ tz: 0 }))
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { stored: false, error: 'tz_stand_in' })

  const doc = await stored()
  assert.equal(doc?.timezoneOffset, EDT, 'the stored zone is untouched')
  assert.equal(doc?.timezone, 'America/New_York')
})

test('a genuine UTC member IS stored, because their zone says so', async () => {
  const res = await POST(req({ tz: 0, tzZone: 'UTC' }))
  assert.equal(res.status, 200)
  const doc = await stored()
  assert.equal(doc?.timezoneOffset, 0)
  assert.equal(doc?.timezone, 'UTC')
})

test('a non-numeric tz never changes the stored zone', async () => {
  await POST(req({ tz: EDT, tzZone: 'America/New_York' }))
  __clearTimezoneCache()

  // The shared client's old form: an IANA zone sent as `tz`. The server reads
  // `tz` as a number, and a missing number must never be read as 0.
  for (const body of [
    { tz: 'America/New_York' },
    { tz: null },
    { tz: '240' },
    { tzZone: 'Asia/Tokyo' },
    {},
  ]) {
    const res = await POST(req(body))
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal((await res.json()).error, 'tz_required', JSON.stringify(body))
  }

  const doc = await stored()
  assert.equal(doc?.timezoneOffset, EDT)
  assert.equal(doc?.timezone, 'America/New_York')
})

test('an out-of-range tz never changes the stored zone', async () => {
  await POST(req({ tz: EDT, tzZone: 'America/New_York' }))
  __clearTimezoneCache()

  // -5000 is the one that matters: `readOptionalTzOffsetFromBody` would CLAMP
  // it to -840, which is a perfectly real offset (Kiritimati) the member never
  // reported. This route refuses the value instead of inventing a place.
  for (const tz of [-5000, 5000, -841, 721, 241, Number.NaN]) {
    const res = await POST(req({ tz }))
    assert.equal(res.status, 400, `tz=${tz}`)
    const json = await res.json()
    // NaN does not survive JSON, arriving as null — refused a line earlier.
    assert.ok(['tz_unusable', 'tz_required'].includes(json.error), `tz=${tz}: ${json.error}`)
  }

  const doc = await stored()
  assert.equal(doc?.timezoneOffset, EDT)
  assert.equal(doc?.timezone, 'America/New_York')
})

// ─── The paywall half: one window per elapsed window ─────────────────────────

/** The ledger contract, exactly as tests/unit/allowance/windowAnchor.test.ts. */
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
      return {
        used: row.used,
        followUps: row.followUps,
        refunds: row.refunds,
        charged: true,
        ticketId: `t-${k}`,
      }
    },
    async read(q) {
      const row = rows.get(keyOf(q))
      return row ? { used: row.used, followUps: row.followUps, refunds: row.refunds } : null
    },
    async giveBack() {},
    async latest(q): Promise<WindowAnchor | null> {
      const mine = [...rows.entries()].filter(([k]) => k.startsWith(`${q.feature}|`)).map(([, r]) => r)
      if (!mine.length) return null
      const newest = mine.reduce((a, b) => (a.resetsAt > b.resetsAt ? a : b))
      return { bucketKey: newest.bucketKey, resetsAt: newest.resetsAt }
    },
  }
  return { ledger, rows }
}

test('reporting a new zone mid-day does not open a second estimate window', async () => {
  const l = fakeLedger()
  // 01:00 UTC — 21:00 the previous evening in New York, already tomorrow east
  // of the date line.
  const now = new Date('2026-09-04T01:00:00Z')

  // The member's app reports New York on open, exactly as the web and native
  // callers do, and they spend their one daily food estimate.
  assert.equal((await POST(req({ tz: EDT, tzZone: 'America/New_York' }))).status, 200)
  __clearTzCache() // the offset memo is 60s; a test cannot wait it out

  const first = await consumeAllowance(
    'ai-food-estimate',
    { userId: USER_ID, ledger: l.ledger },
    { enforce: true, now },
  )
  assert.equal(first.allowed, true)
  assert.equal([...l.rows.values()][0].bucketKey, '2026-09-03', 'their New York Thursday')

  // Now they report a zone far enough east to be on the NEXT local date — the
  // live exploit, which this route would otherwise have made a one-liner.
  __clearTimezoneCache()
  assert.equal((await POST(req({ tz: FAR_EAST, tzZone: FAR_EAST_ZONE }))).status, 200)
  assert.equal((await stored())?.timezoneOffset, FAR_EAST, 'the write really did land')
  __clearTzCache()

  assert.equal(
    windowBucket('day', FAR_EAST, now).key,
    '2026-09-04',
    'precondition: the new offset really is on another date',
  )

  const second = await consumeAllowance(
    'ai-food-estimate',
    { userId: USER_ID, ledger: l.ledger },
    { enforce: true, now },
  )
  assert.equal(second.allowed, false, 'the window they are in has not ended')
  assert.equal(second.state.remaining, 0)
  assert.equal(l.rows.size, 1, 'and no second ledger row was opened')
})
