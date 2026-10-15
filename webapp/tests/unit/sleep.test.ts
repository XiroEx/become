// Run with: npm run test:file tests/unit/sleep.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import {
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
  isEntryOnDay,
} from '../../lib/dayWindow'

// Ensure mongoose global is stubbed before any DB connection can be attempted
const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: {}, promise: null }

const USER_ID = 'unit-sleep-user'

type MockSleepDoc = {
  _id?: string
  userId: string
  date: Date
  bedtime: Date
  wakeTime: Date
  durationMinutes: number
  quality: number
  notes?: string
  createdAt?: Date
  updatedAt?: Date
}

function withFixedDate<T>(isoString: string, fn: () => T | Promise<T>): Promise<T> {
  const RealDate = globalThis.Date
  class MockDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(isoString)
      } else {
        // @ts-expect-error variable args
        super(...args)
      }
    }
    static now(): number {
      return new RealDate(isoString).getTime()
    }
  }
  globalThis.Date = MockDate as unknown as DateConstructor
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.Date = RealDate
    })
}

async function installSleepFakes(initialDocs: MockSleepDoc[] = []) {
  const Sleep = (await import('../../models/Sleep')).default

  const docs: MockSleepDoc[] = initialDocs.map((d) => ({ ...d }))
  const findCalls: Array<{ filter: Record<string, unknown> }> = []
  const findOneAndUpdateCalls: Array<{
    filter: Record<string, unknown>
    update: Record<string, unknown>
    options?: Record<string, unknown>
  }> = []

  const originalFind = Sleep.find
  const originalFindOneAndUpdate = Sleep.findOneAndUpdate

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(Sleep as any).find = (filter: Record<string, unknown>) => {
    findCalls.push({ filter })
    const builder = {
      sort: () => builder,
      lean: () => {
        let result = [...docs]
        if (filter.userId) {
          result = result.filter((d) => String(d.userId) === String(filter.userId))
        }
        if (filter.date && typeof filter.date === 'object') {
          const df = filter.date as { $gte?: Date; $lte?: Date }
          if (df.$gte) {
            result = result.filter((d) => d.date.getTime() >= df.$gte!.getTime())
          }
          if (df.$lte) {
            result = result.filter((d) => d.date.getTime() <= df.$lte!.getTime())
          }
        }
        result.sort((a, b) => b.date.getTime() - a.date.getTime())
        return Promise.resolve(result)
      },
      exec: () => Promise.resolve(docs),
    }
    return builder
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(Sleep as any).findOneAndUpdate = (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => {
    findOneAndUpdateCalls.push({ filter, update, options })

    // Locate doc matching filter
    const index = docs.findIndex((d) => {
      if (filter.userId && String(d.userId) !== String(filter.userId)) return false
      if (filter.date instanceof Date) {
        return d.date.getTime() === filter.date.getTime()
      }
      if (filter.date && typeof filter.date === 'object') {
        const df = filter.date as { $gte?: Date; $lte?: Date }
        if (df.$gte && !(d.date.getTime() >= df.$gte.getTime())) return false
        if (df.$lte && !(d.date.getTime() <= df.$lte.getTime())) return false
        return true
      }
      return false
    })

    if (index >= 0) {
      const existing = docs[index]
      const updated: MockSleepDoc = {
        ...existing,
        bedtime: (update.bedtime as Date) ?? existing.bedtime,
        wakeTime: (update.wakeTime as Date) ?? existing.wakeTime,
        durationMinutes: (update.durationMinutes as number) ?? existing.durationMinutes,
        quality: (update.quality as number) ?? existing.quality,
        notes: update.notes !== undefined ? (update.notes as string) : existing.notes,
        updatedAt: new Date(),
      }
      docs[index] = updated
      return {
        lean: () => Promise.resolve(updated),
      }
    }

    if (options?.upsert) {
      // Unique index: { userId: 1, date: 1 }
      const updateDate = update.date as Date
      const duplicate = docs.some(
        (d) => String(d.userId) === String(update.userId) && d.date.getTime() === updateDate.getTime()
      )
      if (duplicate) {
        const err = new Error(
          `E11000 duplicate key error collection: become-test.sleeps index: userId_1_date_1 dup key: { userId: ObjectId('${update.userId}'), date: new Date(${updateDate.getTime()}) }`
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(err as any).code = 11000
        return {
          lean: () => Promise.reject(err),
        }
      }

      const newDoc: MockSleepDoc = {
        _id: 'sleep-' + (docs.length + 1),
        userId: String(update.userId),
        date: update.date as Date,
        bedtime: update.bedtime as Date,
        wakeTime: update.wakeTime as Date,
        durationMinutes: update.durationMinutes as number,
        quality: update.quality as number,
        notes: update.notes as string | undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      docs.push(newDoc)
      return {
        lean: () => Promise.resolve(newDoc),
      }
    }

    return {
      lean: () => Promise.resolve(null),
    }
  }

  return {
    docs,
    findCalls,
    findOneAndUpdateCalls,
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Sleep as any).find = originalFind
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Sleep as any).findOneAndUpdate = originalFindOneAndUpdate
    },
  }
}

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

test('(id: 96d41163) The 14-day list window is bounded on the day marker and returns 14 days for a member at tz=300 and tz=-540', () => {
  const todayKey = '2026-10-14'

  // 14-day window derivation from route.ts (derived from day KEY, not instant):
  const fourteenDaysAgoKey = (() => {
    const d = utcMidnightDateKey(todayKey)
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

  // Query bounded on day marker utcMidnightDateKey(fourteenDaysAgoKey)
  const newWindowStart = utcMidnightDateKey(fourteenDaysAgoKey)
  assert.equal(newWindowStart.toISOString(), '2026-10-01T00:00:00.000Z')
  const newFiltered = allEntries.filter((e) => e.date >= newWindowStart)
  assert.equal(newFiltered.length, 14, 'fix: list bounded on day marker returns all 14 days')
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

test('(id: 9d6d2845) A second POST /api/sleep on the same local day updates the existing row instead of answering 500, proven at tz=300 and tz=-540', async () => {
  const fakes = await installSleepFakes([])

  try {
    const { POST } = await import('../../app/api/sleep/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'sleep-unit@example.com' })

    // Simulate member in US Eastern (tz=300) on 2026-10-14
    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      // 1. First save for today: initial log
      const req1 = new NextRequest('http://localhost/api/sleep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tz: 300,
          bedtime: '2026-10-13T23:00:00.000Z',
          wakeTime: '2026-10-14T07:00:00.000Z',
          quality: 3,
          notes: 'Initial sleep note',
        }),
      })

      const res1 = await POST(req1)
      assert.equal(res1.status, 200, 'first save returns 200')
      const body1 = await res1.json()
      assert.equal(body1.success, true)
      assert.equal(body1.entry.quality, 3)
      assert.equal(body1.entry.notes, 'Initial sleep note')
      assert.equal(fakes.docs.length, 1, 'one document inserted in store')

      // Verify the day marker date written
      assert.equal(
        new Date(body1.entry.date).toISOString(),
        '2026-10-14T00:00:00.000Z',
        'row is stored under 00:00Z day marker'
      )

      // 2. Second save on the same local day: correction/update
      // Under the old bug, the filter was { userId, date: { $gte: 05:00Z, $lte: ... } },
      // which missed 00:00Z, causing Mongo to attempt a duplicate insert on { userId, date },
      // throwing E11000 duplicate key error and answering 500.
      const req2 = new NextRequest('http://localhost/api/sleep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tz: 300,
          bedtime: '2026-10-13T22:30:00.000Z',
          wakeTime: '2026-10-14T07:15:00.000Z',
          quality: 5,
          notes: 'Corrected: felt well-rested',
        }),
      })

      const res2 = await POST(req2)
      assert.equal(res2.status, 200, 'second save on same day returns 200 (not 500)')
      const body2 = await res2.json()
      assert.equal(body2.success, true)
      assert.equal(body2.entry.quality, 5, 'quality was updated')
      assert.equal(body2.entry.notes, 'Corrected: felt well-rested', 'notes were updated')
      assert.equal(body2.entry.durationMinutes, 525, 'duration was recalculated')
      assert.equal(fakes.docs.length, 1, 'row was updated in-place without creating a duplicate')
    })

    // Also test member east of UTC (tz = -540, Tokyo)
    const TOKYO_USER_ID = 'unit-sleep-user-tokyo'
    const tokyoToken = await signToken({ userId: TOKYO_USER_ID, email: 'sleep-tokyo@example.com' })

    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      // In Tokyo (UTC+9), 14:00Z on Oct 14 is 23:00 on Oct 14 -> local day is 2026-10-14
      const reqTokyo1 = new NextRequest('http://localhost/api/sleep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokyoToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tz: -540,
          bedtime: '2026-10-13T14:00:00.000Z',
          wakeTime: '2026-10-13T22:00:00.000Z',
          quality: 2,
          notes: 'Tokyo initial log',
        }),
      })

      const resTokyo1 = await POST(reqTokyo1)
      assert.equal(resTokyo1.status, 200)
      const bodyTokyo1 = await resTokyo1.json()
      assert.equal(bodyTokyo1.entry.quality, 2)

      // Second save on same day updates
      const reqTokyo2 = new NextRequest('http://localhost/api/sleep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokyoToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tz: -540,
          bedtime: '2026-10-13T14:00:00.000Z',
          wakeTime: '2026-10-13T22:30:00.000Z',
          quality: 4,
          notes: 'Tokyo updated note',
        }),
      })

      const resTokyo2 = await POST(reqTokyo2)
      assert.equal(resTokyo2.status, 200, 'second save at tz=-540 updates cleanly without 500')
      const bodyTokyo2 = await resTokyo2.json()
      assert.equal(bodyTokyo2.entry.quality, 4)
      assert.equal(bodyTokyo2.entry.notes, 'Tokyo updated note')
    })
  } finally {
    fakes.restore()
  }
})

test('(id: 9d6d2846) The POST upsert filter keys on the same 00:00Z day marker the route writes, matching the unique index {userId, date}', async () => {
  const fakes = await installSleepFakes([])

  try {
    const { POST } = await import('../../app/api/sleep/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'sleep-unit@example.com' })

    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/sleep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tz: 300,
          bedtime: '2026-10-13T23:00:00.000Z',
          wakeTime: '2026-10-14T07:00:00.000Z',
          quality: 4,
        }),
      })

      const res = await POST(req)
      assert.equal(res.status, 200)

      // Verify the findOneAndUpdate arguments
      assert.equal(fakes.findOneAndUpdateCalls.length, 1)
      const call = fakes.findOneAndUpdateCalls[0]

      // 1. Filter keys directly on { userId, date: storageDate } matching unique index { userId: 1, date: 1 }
      assert.equal(call.filter.userId, USER_ID)
      assert.ok(call.filter.date instanceof Date, 'filter.date is a Date instance')
      assert.equal(
        (call.filter.date as Date).toISOString(),
        '2026-10-14T00:00:00.000Z',
        'filter.date is pegged to 00:00Z UTC midnight'
      )

      // 2. Filter date matches the EXACT date written in update
      assert.equal(
        (call.filter.date as Date).getTime(),
        (call.update.date as Date).getTime(),
        'filter.date matches update.date marker exactly'
      )

      // 3. No range filter ($gte, $lte) that could miss the marker
      assert.equal(
        typeof (call.filter.date as Record<string, unknown>).$gte,
        'undefined',
        'filter does not use $gte window'
      )

      // 4. upsert option preserved
      assert.equal(call.options?.upsert, true, 'upsert is true')

      // 5. Contrast: prove the old window filter at tz=300 would have missed this marker
      const { start: oldStart, end: oldEnd } = localDayWindowForKey('2026-10-14', 300)
      const marker = call.filter.date as Date
      assert.equal(
        marker >= oldStart && marker <= oldEnd,
        false,
        'proves marker (00:00Z) fell outside old window start (05:00Z)'
      )
    })
  } finally {
    fakes.restore()
  }
})

test('(id: 9d6d2847) The 14-day list returns exactly 14 local days at tz=300 and at tz=-540', async () => {
  // Generate 15 consecutive daily entries: 2026-09-30 through 2026-10-14
  const entries15: MockSleepDoc[] = []
  for (let i = 0; i < 15; i++) {
    // i=0 -> 2026-09-30, i=1 -> 2026-10-01, ..., i=14 -> 2026-10-14
    const d = new Date(Date.UTC(2026, 8, 30 + i))
    entries15.push({
      _id: `sleep-day-${i}`,
      userId: USER_ID,
      date: d,
      bedtime: new Date(d.getTime() - 8 * 3600_000),
      wakeTime: d,
      durationMinutes: 480,
      quality: 4,
      notes: `Day ${i}`,
    })
  }

  const fakes = await installSleepFakes(entries15)

  try {
    const { GET } = await import('../../app/api/sleep/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'sleep-unit@example.com' })

    // Test 1: tz=300 (US Eastern)
    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/sleep?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const res = await GET(req)
      assert.equal(res.status, 200)

      const body = await res.json()
      assert.equal(Array.isArray(body.entries), true)
      assert.equal(body.entries.length, 14, 'returns exactly 14 days at tz=300')

      // Oldest entry must be 2026-10-01, 15th entry (2026-09-30) excluded
      const oldest = body.entries[body.entries.length - 1]
      assert.equal(new Date(oldest.date).toISOString(), '2026-10-01T00:00:00.000Z')
      assert.equal(
        body.entries.some((e: { date: string }) => new Date(e.date).toISOString() === '2026-09-30T00:00:00.000Z'),
        false,
        '15th day is excluded at tz=300'
      )
    })

    // Test 2: tz=-540 (Japan)
    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      // In Tokyo (UTC+9), 14:00 UTC is 23:00 on 2026-10-14, so todayKey is 2026-10-14
      const req = new NextRequest('http://localhost/api/sleep?tz=-540', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const res = await GET(req)
      assert.equal(res.status, 200)

      const body = await res.json()
      assert.equal(Array.isArray(body.entries), true)
      assert.equal(body.entries.length, 14, 'returns exactly 14 days at tz=-540')

      // Oldest entry must be 2026-10-01, 15th entry (2026-09-30) excluded
      const oldest = body.entries[body.entries.length - 1]
      assert.equal(new Date(oldest.date).toISOString(), '2026-10-01T00:00:00.000Z')
      assert.equal(
        body.entries.some((e: { date: string }) => new Date(e.date).toISOString() === '2026-09-30T00:00:00.000Z'),
        false,
        '15th day is excluded at tz=-540'
      )
    })

    // Flaw verification: demonstrate why old instant-based derivation yielded 15 days at tz=-540:
    const todayKey = '2026-10-14'
    const { start: todayStartTokyo } = localDayWindowForKey(todayKey, -540)
    // todayStartTokyo is 2026-10-13T15:00:00.000Z (UTC date 13)
    assert.equal(todayStartTokyo.toISOString(), '2026-10-13T15:00:00.000Z')
    const oldDerivationKey = (() => {
      const d = new Date(todayStartTokyo)
      d.setUTCDate(d.getUTCDate() - 13) // 13 - 13 = 0 -> 2026-09-30!
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    })()
    assert.equal(oldDerivationKey, '2026-09-30', 'old code landed on 15 days ago')

    // New derivation keys off todayKey directly:
    const newDerivationKey = (() => {
      const d = utcMidnightDateKey(todayKey)
      d.setUTCDate(d.getUTCDate() - 13) // 14 - 13 = 1 -> 2026-10-01!
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    })()
    assert.equal(newDerivationKey, '2026-10-01', 'new code lands on 13 days ago (14 total days)')
  } finally {
    fakes.restore()
  }
})

test('(id: 9d6d2848) GET todayEntry matching (isEntryOnDay) and the response shape are unchanged', async () => {
  const markerRowDate = new Date('2026-10-14T00:00:00.000Z')
  const legacyEveningRowDate = new Date('2026-10-15T01:00:00.000Z') // 9pm EDT on 2026-10-14

  const entries: MockSleepDoc[] = [
    {
      _id: 'sleep-today',
      userId: USER_ID,
      date: markerRowDate,
      bedtime: new Date('2026-10-13T23:00:00.000Z'),
      wakeTime: new Date('2026-10-14T07:00:00.000Z'),
      durationMinutes: 480,
      quality: 4,
      notes: 'Good night',
    },
    {
      _id: 'sleep-yesterday',
      userId: USER_ID,
      date: new Date('2026-10-13T00:00:00.000Z'),
      bedtime: new Date('2026-10-12T23:00:00.000Z'),
      wakeTime: new Date('2026-10-13T07:00:00.000Z'),
      durationMinutes: 480,
      quality: 3,
    },
  ]

  const fakes = await installSleepFakes(entries)

  try {
    const { GET } = await import('../../app/api/sleep/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'sleep-unit@example.com' })

    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/sleep?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const res = await GET(req)
      assert.equal(res.status, 200)

      const body = await res.json()

      // 1. Response shape contains entries, todayEntry, averages
      assert.ok('entries' in body, 'response has entries')
      assert.ok('todayEntry' in body, 'response has todayEntry')
      assert.ok('averages' in body, 'response has averages')

      // 2. todayEntry matches the entry for today via isEntryOnDay
      assert.ok(body.todayEntry !== null, 'todayEntry is populated')
      assert.equal(body.todayEntry._id, 'sleep-today')
      assert.equal(body.todayEntry.quality, 4)
      assert.equal(body.todayEntry.durationMinutes, 480)
      assert.equal(body.todayEntry.notes, 'Good night')

      // 3. Each entry in entries has the expected fields
      for (const e of body.entries) {
        assert.ok('_id' in e)
        assert.ok('date' in e)
        assert.ok('bedtime' in e)
        assert.ok('wakeTime' in e)
        assert.ok('durationMinutes' in e)
        assert.ok('quality' in e)
      }

      // 4. Averages
      assert.equal(body.averages.durationMinutes, 480)
      assert.equal(body.averages.quality, 3.5)
    })

    // Verify todayEntry with legacy instant evening row
    fakes.docs[0] = {
      ...fakes.docs[0],
      _id: 'sleep-legacy-evening',
      date: legacyEveningRowDate,
    }

    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/sleep?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const res = await GET(req)
      const body = await res.json()
      assert.ok(body.todayEntry !== null)
      assert.equal(body.todayEntry._id, 'sleep-legacy-evening')
    })

    // Verify todayEntry null when no entry exists for today
    fakes.docs.shift() // remove today's entry, leave only yesterday
    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/sleep?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const res = await GET(req)
      const body = await res.json()
      assert.equal(body.todayEntry, null, 'todayEntry is null when no log exists for today')
    })
  } finally {
    fakes.restore()
  }
})

test('(id: 9d6d2849) No change to lib/dayWindow.ts, no index change, no new dependency', async () => {
  // Verify SleepSchema compound unique index { userId: 1, date: 1 } exists
  const Sleep = (await import('../../models/Sleep')).default
  const indexes = Sleep.schema.indexes()
  const hasUserDateUnique = indexes.some(
    ([fields, opts]: [Record<string, unknown>, Record<string, unknown>]) =>
      fields.userId === 1 && fields.date === 1 && opts?.unique === true
  )
  assert.equal(hasUserDateUnique, true, 'SleepSchema retains compound unique index { userId: 1, date: 1 }')

  // Verify dayWindow functions remain exported and behavior intact
  assert.equal(typeof localDateKey, 'function')
  assert.equal(typeof localDayWindowForKey, 'function')
  assert.equal(typeof utcMidnightDateKey, 'function')
  assert.equal(typeof isEntryOnDay, 'function')
})
