// Run with: npm run test:file tests/unit/timezone/reportTimezone.test.ts
//
// ─── The web half of "record the timezone when the app opens" ────────────────
//
// The dashboard layout mounts <TimezoneSync />, which calls this once per app
// load. The gate below is what keeps that honest: one request per LOCAL
// calendar day, stamped only when the server actually took the report, and
// never a fabricated offset.
//
// The last test drives the body it sends into the SERVER's own reader, so the
// two ends cannot drift: a request this module makes must be one the route
// accepts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TZ_REPORT_STAMP_KEY,
  alreadyReportedToday,
  localDayStamp,
  reportTimezoneOnce,
  type StampStore,
} from '../../../lib/timezone/reportTimezone'
import { resolveTimezoneReport } from '../../../lib/captureUserTimezone'

/** 9pm on 15 July in New York: 01:00 UTC on the 16th. */
const NY_EVENING = new Date('2026-07-16T01:00:00Z')
const EDT = 240
const ZONE = 'America/New_York'

function memoryStorage(seed?: Record<string, string>): StampStore & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

function fakeFetch(status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit })
    return new Response(JSON.stringify({ stored: status === 200 }), { status })
  }) as unknown as typeof fetch
  return { impl, calls }
}

function bodyOf(call: { init: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init.body))
}

// ─── The day the member is actually living in ────────────────────────────────

test('the day is the MEMBER\'s day, not the UTC one', () => {
  // 9pm in New York is already tomorrow at UTC. Stamping the UTC date would
  // re-report at their 8pm every evening and skip the following morning.
  assert.equal(localDayStamp(NY_EVENING, EDT), '2026-07-15')
  assert.equal(localDayStamp(NY_EVENING, 0), '2026-07-16')
})

test('an unreadable storage never blocks the report', () => {
  const throwing: StampStore = {
    getItem() { throw new Error('private mode') },
    setItem() { throw new Error('private mode') },
  }
  assert.equal(alreadyReportedToday(throwing, NY_EVENING, EDT), false)
  assert.equal(alreadyReportedToday(null, NY_EVENING, EDT), false)
})

// ─── At most once a day, on app open ─────────────────────────────────────────

test('the first open of the day reports, and stamps the local day', async () => {
  const storage = memoryStorage()
  const f = fakeFetch()
  const result = await reportTimezoneOnce({
    token: 'jwt', storage, fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
  })

  assert.equal(result, 'reported')
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].url, '/api/me/timezone')
  assert.equal(f.calls[0].init.method, 'POST')
  assert.deepEqual(bodyOf(f.calls[0]), { tz: EDT, tzZone: ZONE })
  assert.equal(storage.map.get(TZ_REPORT_STAMP_KEY), '2026-07-15')
})

test('a second open the same local day sends nothing', async () => {
  const storage = memoryStorage({ [TZ_REPORT_STAMP_KEY]: '2026-07-15' })
  const f = fakeFetch()
  const result = await reportTimezoneOnce({
    token: 'jwt', storage, fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
  })
  assert.equal(result, 'already-today')
  assert.equal(f.calls.length, 0)
})

test('the next local day reports again', async () => {
  const storage = memoryStorage({ [TZ_REPORT_STAMP_KEY]: '2026-07-14' })
  const f = fakeFetch()
  const result = await reportTimezoneOnce({
    token: 'jwt', storage, fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
  })
  assert.equal(result, 'reported')
  assert.equal(f.calls.length, 1)
})

test('a refused or failed report does NOT burn the day', async () => {
  // Stamping before the answer is how one flaky open costs a member their
  // reminders until tomorrow.
  const storage = memoryStorage()
  const f = fakeFetch(500)
  assert.equal(
    await reportTimezoneOnce({
      token: 'jwt', storage, fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
    }),
    'failed',
  )
  assert.equal(storage.map.get(TZ_REPORT_STAMP_KEY), undefined)

  const ok = fakeFetch()
  assert.equal(
    await reportTimezoneOnce({
      token: 'jwt', storage, fetchImpl: ok.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
    }),
    'reported',
  )
  assert.equal(ok.calls.length, 1)
})

test('a thrown fetch (offline) is not an error the member ever sees', async () => {
  const storage = memoryStorage()
  const impl = (async () => { throw new Error('offline') }) as unknown as typeof fetch
  assert.equal(
    await reportTimezoneOnce({
      token: 'jwt', storage, fetchImpl: impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
    }),
    'failed',
  )
})

test('signed out: nothing is sent, because there is nobody to attribute it to', async () => {
  const f = fakeFetch()
  assert.equal(
    await reportTimezoneOnce({
      token: null, storage: memoryStorage(), fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT,
    }),
    'signed-out',
  )
  assert.equal(f.calls.length, 0)
})

test('an unknown offset is never sent as 0', async () => {
  // A fabricated 0 marks the member UTC, which fires their morning push at ~3am
  // local. Send nothing instead.
  const f = fakeFetch()
  assert.equal(
    await reportTimezoneOnce({
      token: 'jwt', storage: memoryStorage(), fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: Number.NaN,
    }),
    'failed',
  )
  assert.equal(f.calls.length, 0)
})

test('a device with no resolvable zone still reports its offset', async () => {
  // Intl could not name the zone (`tzZone: ''`). The offset is still a real
  // reading from a real clock, so it is still worth having — it is the zone
  // that is missing, not the report.
  const f = fakeFetch()
  await reportTimezoneOnce({
    token: 'jwt', storage: memoryStorage(), fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: '',
  })
  assert.deepEqual(bodyOf(f.calls[0]), { tz: EDT }, 'no empty tzZone key')
})

// ─── Both ends of the wire agree ─────────────────────────────────────────────

test('the body this sends is one POST /api/me/timezone accepts', async () => {
  const f = fakeFetch()
  await reportTimezoneOnce({
    token: 'jwt', storage: memoryStorage(), fetchImpl: f.impl, now: NY_EVENING, tzOffsetMinutes: EDT, tzZone: ZONE,
  })
  const report = resolveTimezoneReport(bodyOf(f.calls[0]), NY_EVENING)
  assert.equal(report.ok, true)
  assert.deepEqual(report.ok && report.captured, { timezoneOffset: EDT, timezone: ZONE })
})
