// Run with: npm run test:file tests/unit/nativeTzParity.test.ts
//
// ─── Native and web must describe the same day ───────────────────────────────
//
// The shared client used to append `tz=America/New_York` — an IANA zone — to
// every date-scoped read, and nothing at all to write bodies. The server reads
// `tz` as a NUMBER of minutes west of UTC and turns anything else into 0, so
// every native read was answered for the UTC day and every native write landed
// on the UTC day.
//
// This test drives the REAL shared client helpers (shared/api-client/src/tz.ts)
// into the REAL server-side readers (lib/dayWindow.ts) and asserts the two ends
// agree — and shows the old form landing on the wrong day, so the regression
// cannot come back quietly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendTz,
  currentTzOffsetMinutes,
  mergeTzIntoBody,
} from '../../../shared/api-client/src/tz'
import {
  readTzOffset,
  readTzOffsetFromBody,
  readOptionalTzOffsetFromBody,
  readZoneFromBody,
  localDateKey,
  utcMidnightDateKey,
  isEntryOnDay,
  entryDayKeys,
  dateKey,
} from '../../lib/dayWindow'
import { localHourForUser } from '../../lib/notifications/cronNotify'
import { resolveTimezoneReport } from '../../lib/captureUserTimezone'

/** 9pm on 2026-07-15 in New York — EDT, so 240 minutes west of UTC. */
const NINE_PM_NEW_YORK = new Date('2026-07-16T01:00:00Z')
const ZONE = 'America/New_York'

/** Run `fn` as if the device were in `zone`, then put the clock back. */
function inZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = zone
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

/** What the server sees on the query string of a native GET. */
function serverTzFromNativeGet(path: string, offset: number | undefined): number {
  const url = appendTz(path, offset)
  return readTzOffset(new URLSearchParams(url.split('?')[1] ?? ''))
}

test('native sends the same tz the WEB sends: minutes west of UTC', () => {
  const nativeOffset = inZone(ZONE, () => currentTzOffsetMinutes(NINE_PM_NEW_YORK))
  // webapp/lib/... clients all send `tz=${new Date().getTimezoneOffset()}`.
  const webOffset = inZone(ZONE, () => NINE_PM_NEW_YORK.getTimezoneOffset())
  assert.equal(nativeOffset, 240)
  assert.equal(nativeOffset, webOffset)
})

test('a mood logged natively at 9pm in New York is stored on THAT day', () => {
  const offset = inZone(ZONE, () => currentTzOffsetMinutes(NINE_PM_NEW_YORK))

  // What the native client now POSTs to /api/mood.
  const body = mergeTzIntoBody({ mood: 4 }, offset, ZONE)

  // POST /api/mood, verbatim: tz from the body → the local day key → the
  // UTC-midnight day marker the row is written at.
  const tzOffset = readTzOffsetFromBody(body)
  const todayKey = localDateKey(null, tzOffset, NINE_PM_NEW_YORK)
  const storedAt = utcMidnightDateKey(todayKey)
  assert.equal(tzOffset, 240)
  assert.equal(todayKey, '2026-07-15')

  // GET /api/mood from the WEB, same instant, same member: the row is today's.
  const webTodayKey = localDateKey(null, 240, NINE_PM_NEW_YORK)
  assert.equal(webTodayKey, '2026-07-15')
  assert.equal(isEntryOnDay(storedAt, webTodayKey, 240), true)
})

test('the old IANA form dated that 9pm mood TOMORROW (the bug)', () => {
  // `tz=America/New_York` is not a number, so the server read 0 = UTC.
  const legacyBody = { mood: 4, tz: ZONE }
  const legacyOffset = readTzOffsetFromBody(legacyBody)
  assert.equal(legacyOffset, 0)

  const legacyKey = localDateKey(null, legacyOffset, NINE_PM_NEW_YORK)
  assert.equal(legacyKey, '2026-07-16', 'the UTC day, i.e. tomorrow in New York')

  // The stored day marker is what the web RENDERS the entry as — the progress
  // history labels every row by its own date (lib/data/userProgress.ts
  // formatProgressData) — so the member's Wednesday-evening mood showed up on
  // Thursday.
  const legacyStoredAt = utcMidnightDateKey(legacyKey)
  assert.equal(dateKey(legacyStoredAt, 0), '2026-07-16')

  const fixedStoredAt = utcMidnightDateKey(
    localDateKey(null, readTzOffsetFromBody(mergeTzIntoBody({ mood: 4 }, 240, ZONE)), NINE_PM_NEW_YORK),
  )
  assert.equal(dateKey(fixedStoredAt, 0), '2026-07-15')

  // Why this went unnoticed: entryDayKeys is deliberately tolerant — a marker
  // is accepted read either way, so a legacy row is not lost — and the
  // tomorrow-dated row therefore still satisfied "did you log today?". The
  // damage was the DATE on the entry, which the member reads.
  assert.equal(isEntryOnDay(legacyStoredAt, '2026-07-16', 240), true, 'it also counts as tomorrow')
  assert.deepEqual(entryDayKeys(legacyStoredAt, 240), ['2026-07-16', '2026-07-15'])
})

test('GET /api/streak from native carries tz=240 in a New York summer', () => {
  const offset = inZone(ZONE, () => currentTzOffsetMinutes(NINE_PM_NEW_YORK))
  assert.equal(appendTz('/api/streak', offset), '/api/streak?tz=240')
  assert.equal(serverTzFromNativeGet('/api/streak', offset), 240)

  // The same value the web sends, so both ends compute the same day key — and
  // therefore the same streak.
  assert.equal(
    localDateKey(null, serverTzFromNativeGet('/api/streak', offset), NINE_PM_NEW_YORK),
    localDateKey(null, 240, NINE_PM_NEW_YORK),
  )

  // In January the same zone is 300, because the offset is computed per request.
  const winter = new Date('2026-01-15T21:00:00Z')
  assert.equal(
    serverTzFromNativeGet('/api/streak', inZone(ZONE, () => currentTzOffsetMinutes(winter))),
    300,
  )

  // The legacy zone-as-tz value was silently discarded: 0 = UTC.
  assert.equal(
    readTzOffset(new URLSearchParams(`tz=${ZONE}`)),
    0,
    'proof the server never understood the IANA form',
  )
})

test('every widened family is tagged on a native GET, not just the original eight', () => {
  const offset = inZone(ZONE, () => currentTzOffsetMinutes(NINE_PM_NEW_YORK))
  for (const path of [
    '/api/me/entitlements',
    '/api/sleep',
    '/api/meal-logs',
    '/api/meditation',
    '/api/journal',
    '/api/goals',
    '/api/checkin',
    '/api/becoming/journey',
    '/api/streaks',
    '/api/widgets/summary',
  ]) {
    assert.equal(serverTzFromNativeGet(path, offset), 240, path)
  }
})

test('a native workout save reports the zone, so reminders fire at the local hour', () => {
  const offset = inZone(ZONE, () => currentTzOffsetMinutes(NINE_PM_NEW_YORK))
  const body = mergeTzIntoBody(
    { programId: 'p1', phase: 1, day: 'Day 1', completed: true },
    offset,
    ZONE,
  )

  // POST /api/workouts only PERSISTS a genuinely-reported offset, and prefers
  // the IANA zone beside it (lib/captureUserTimezone.ts).
  const reported = readOptionalTzOffsetFromBody(body)
  assert.equal(reported, 240)
  assert.equal(readZoneFromBody(body), ZONE)

  // With nothing reported — native's behaviour before this change — the route
  // stores nothing at all and the member stays unzoned.
  const legacyBody = { programId: 'p1', phase: 1, day: 'Day 1', completed: true }
  assert.equal(readOptionalTzOffsetFromBody(legacyBody), null)
  assert.equal(readZoneFromBody(legacyBody), undefined)

  // Why it matters: the morning reminder window is a LOCAL hour. 08:00 UTC is
  // 4am for this member, and the stored zone is what says so.
  const at8amUtc = new Date('2026-07-16T08:00:00Z')
  assert.equal(localHourForUser(at8amUtc, reported ?? undefined, readZoneFromBody(body)), 4)
  // An unzoned member is treated as UTC: the "morning" push at 4am local.
  assert.equal(localHourForUser(at8amUtc, 0), 8)
})

test('an app open reports the zone even for a member who never saves a workout', () => {
  // POST /api/me/timezone is what both apps call when they open. Before it
  // existed, a workout save was the ONLY thing that recorded a zone — and the
  // notify cron skips a member who has none, so a member who logs food and
  // nothing else received no reminders at all.
  const offset = inZone(ZONE, () => currentTzOffsetMinutes(NINE_PM_NEW_YORK))
  // The native caller sends an EMPTY body and lets the shared client fill it.
  const body = mergeTzIntoBody({}, offset, ZONE)
  assert.deepEqual(body, { tz: 240, tzZone: ZONE })

  const report = resolveTimezoneReport(body, NINE_PM_NEW_YORK)
  assert.equal(report.ok, true)
  assert.deepEqual(report.ok && report.captured, { timezoneOffset: 240, timezone: ZONE })

  // Which is what puts the daily check-in reminder in their early afternoon
  // rather than in the cron's UTC one: 16:00Z is 12:00 in New York.
  const noonLocal = new Date('2026-07-15T16:00:00Z')
  const captured = report.ok ? report.captured : null
  assert.equal(localHourForUser(noonLocal, captured?.timezoneOffset, captured?.timezone), 12)
  assert.equal(
    localHourForUser(noonLocal, undefined),
    null,
    'with nothing stored the cron skips them entirely — the bug this closes',
  )
})

test('a native write never sends tz=0 as a stand-in for unknown', () => {
  // A fabricated 0 would be PERSISTED as the member's zone by POST /api/workouts.
  const body = mergeTzIntoBody({ programId: 'p1' }, undefined, undefined)
  assert.equal(readOptionalTzOffsetFromBody(body), null)
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'tz'), false)
})
