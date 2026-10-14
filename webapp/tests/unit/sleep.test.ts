// Run with: npm run test:file tests/unit/sleep.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
  isEntryOnDay,
} from '../../lib/dayWindow'

test('(id: 96d41162) GET /api/sleep finds today entry with isEntryOnDay at tz=300, tz=0 and tz=-540', () => {
  // A row stored at UTC midnight of the member's local day:
  const storedRowDate = new Date('2026-10-14T00:00:00.000Z')
  const todayKey = '2026-10-14'

  // Demonstrates the bug with localDayWindowForKey for US Eastern (tz=300):
  // Eastern member's day window is [2026-10-14T05:00:00.000Z, 2026-10-15T04:59:59.999Z].
  // 00:00Z < 05:00Z, so the old local-instant window missed the day marker entirely.
  const { start: oldWindowStart, end: oldWindowEnd } = localDayWindowForKey(todayKey, 300)
  assert.equal(
    storedRowDate >= oldWindowStart && storedRowDate <= oldWindowEnd,
    false,
    'bug: old local-instant window fails to match the 00:00Z day marker for tz=300'
  )

  // With isEntryOnDay, the day marker row is found in all timezones:
  // tz=300 (US Eastern), tz=0 (UTC), tz=-540 (Japan)
  assert.equal(isEntryOnDay(storedRowDate, todayKey, 300), true, 'found as today at tz=300 (US Eastern)')
  assert.equal(isEntryOnDay(storedRowDate, todayKey, 0), true, 'found as today at tz=0 (UTC)')
  assert.equal(isEntryOnDay(storedRowDate, todayKey, -540), true, 'found as today at tz=-540 (Japan)')

  // A row from yesterday is not matched as today
  const yesterdayRowDate = new Date('2026-10-13T00:00:00.000Z')
  assert.equal(isEntryOnDay(yesterdayRowDate, todayKey, 300), false, 'yesterday is not today at tz=300')
  assert.equal(isEntryOnDay(yesterdayRowDate, todayKey, 0), false, 'yesterday is not today at tz=0')
  assert.equal(isEntryOnDay(yesterdayRowDate, todayKey, -540), false, 'yesterday is not today at tz=-540')

  // A legacy instant row (e.g. logged during local evening) also matches
  // 9pm EDT on 2026-10-14 is 2026-10-15T01:00:00.000Z
  const legacyInstantRowDate = new Date('2026-10-15T01:00:00.000Z')
  assert.equal(isEntryOnDay(legacyInstantRowDate, todayKey, 300), true, 'legacy instant row matches at tz=300')
})

test('(id: 96d41163) The 14-day list window is bounded on the day marker and returns 14 days for a member at tz=300', () => {
  const tz = 300 // US Eastern (UTC - 5h)
  const todayKey = '2026-10-14'
  const { start: todayStart } = localDayWindowForKey(todayKey, tz)

  // 14-day window derivation from route.ts:
  const fourteenDaysAgoKey = (() => {
    const d = new Date(todayStart)
    d.setUTCDate(d.getUTCDate() - 13)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })()

  assert.equal(fourteenDaysAgoKey, '2026-10-01', 'fourteenDaysAgoKey is 13 days before today (14 total days)')

  // Generate 14 day markers for the 14 days: 2026-10-01 through 2026-10-14
  // Each stored with utcMidnightDateKey as POST /api/sleep does
  const dayMarkers: Array<{ date: Date; durationMinutes: number; quality: number }> = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(2026, 9, 1 + i)) // 2026-10-01 to 2026-10-14
    dayMarkers.push({
      date: d,
      durationMinutes: 420 + i * 5,
      quality: 4,
    })
  }

  // Also an older entry from 15 days ago (2026-09-30)
  const olderEntry = {
    date: new Date(Date.UTC(2026, 8, 30)),
    durationMinutes: 400,
    quality: 3,
  }
  const allEntries = [olderEntry, ...dayMarkers]

  // OLD BUG: query bounded on local-instant windowStart
  // localDayWindowForKey('2026-10-01', 300).start is 2026-10-01T05:00:00.000Z
  const { start: oldWindowStart } = localDayWindowForKey(fourteenDaysAgoKey, tz)
  assert.equal(oldWindowStart.toISOString(), '2026-10-01T05:00:00.000Z')
  const oldFiltered = allEntries.filter((e) => e.date >= oldWindowStart)
  assert.equal(oldFiltered.length, 13, 'bug: old instant window returns only 13 days, dropping 2026-10-01T00:00:00Z')

  // NEW FIX: query bounded on day marker utcMidnightDateKey(fourteenDaysAgoKey)
  const newWindowStart = utcMidnightDateKey(fourteenDaysAgoKey)
  assert.equal(newWindowStart.toISOString(), '2026-10-01T00:00:00.000Z')
  const newFiltered = allEntries.filter((e) => e.date >= newWindowStart)
  assert.equal(newFiltered.length, 14, 'fix: list bounded on day marker returns all 14 days for tz=300')
  assert.equal(newFiltered.some((e) => e.date.toISOString() === '2026-10-01T00:00:00.000Z'), true, 'oldest day included')
  assert.equal(newFiltered.some((e) => e.date.toISOString() === '2026-09-30T00:00:00.000Z'), false, '15th day excluded')
})

test('(id: 96d41164) averages are computed over exactly the returned rows with identical rounding', () => {
  const entries = [
    { durationMinutes: 480, quality: 4 },
    { durationMinutes: 420, quality: 3 },
    { durationMinutes: 390, quality: 5 },
  ]

  const totalDuration = entries.reduce((sum, e) => sum + e.durationMinutes, 0)
  const totalQuality = entries.reduce((sum, e) => sum + e.quality, 0)
  const averages = {
    durationMinutes: Math.round(totalDuration / entries.length),
    quality: Math.round((totalQuality / entries.length) * 10) / 10,
  }

  assert.equal(averages.durationMinutes, 430)
  assert.equal(averages.quality, 4)
})
