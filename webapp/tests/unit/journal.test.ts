// Run with: npm run test:file tests/unit/journal.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import {
  localDayWindowForKey,
  isEntryOnDay,
} from '../../lib/dayWindow'

// Ensure mongoose global is stubbed before any DB connection can be attempted
const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: {}, promise: null }

const USER_ID = 'unit-journal-user'

type JournalDoc = {
  _id?: string
  userId: string
  date: Date
  content: string
  mood?: number
  prompt?: string
}

async function installFakes(entries: JournalDoc[]) {
  const Journal = (await import('../../models/Journal')).default

  const queryCalls: Array<{ method: string; args: unknown[] }> = []
  const originalFind = Journal.find

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(Journal as any).find = (...args: unknown[]) => {
    queryCalls.push({ method: 'find', args })
    const builder = {
      sort: (sortArg: unknown) => {
        queryCalls.push({ method: 'sort', args: [sortArg] })
        return builder
      },
      limit: (limitArg: unknown) => {
        queryCalls.push({ method: 'limit', args: [limitArg] })
        return builder
      },
      lean: () => {
        queryCalls.push({ method: 'lean', args: [] })
        return Promise.resolve(entries)
      },
      exec: () => Promise.resolve(entries),
    }
    return builder
  }

  return {
    queryCalls,
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Journal as any).find = originalFind
    },
  }
}

/** Set system clock for test block and restore afterwards */
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

test('(id: 96d4116b) a row stored at 2026-10-14T00:00:00Z is today entry at tz=300, tz=0 and tz=-540', () => {
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

  // With isEntryOnDay (the fix), the day marker row is found in all timezones:
  // tz=300 (US Eastern), tz=0 (UTC), tz=-540 (Japan)
  assert.equal(
    isEntryOnDay(storedRowDate, todayKey, 300),
    true,
    'found as today at tz=300 (US Eastern)'
  )
  assert.equal(
    isEntryOnDay(storedRowDate, todayKey, 0),
    true,
    'found as today at tz=0 (UTC)'
  )
  assert.equal(
    isEntryOnDay(storedRowDate, todayKey, -540),
    true,
    'found as today at tz=-540 (Japan)'
  )

  // A row from yesterday is not matched as today in any timezone
  const yesterdayRowDate = new Date('2026-10-13T00:00:00.000Z')
  assert.equal(
    isEntryOnDay(yesterdayRowDate, todayKey, 300),
    false,
    'yesterday is not today at tz=300'
  )
  assert.equal(
    isEntryOnDay(yesterdayRowDate, todayKey, 0),
    false,
    'yesterday is not today at tz=0'
  )
  assert.equal(
    isEntryOnDay(yesterdayRowDate, todayKey, -540),
    false,
    'yesterday is not today at tz=-540'
  )
})

test('(id: 96d4116c) a legacy row stored at a real instant inside the member local day is still matched at tz=300', () => {
  const todayKey = '2026-10-14'

  // Legacy row stored at 2026-10-14T14:23:00Z (10:23 AM EDT on 2026-10-14)
  const legacyRowDate = new Date('2026-10-14T14:23:00.000Z')
  assert.equal(
    isEntryOnDay(legacyRowDate, todayKey, 300),
    true,
    'legacy row at 2026-10-14T14:23:00Z is today at tz=300'
  )

  // Legacy row stored late in the evening: 9:00 PM EDT on 2026-10-14 is 2026-10-15T01:00:00Z
  const legacyEveningRowDate = new Date('2026-10-15T01:00:00.000Z')
  assert.equal(
    isEntryOnDay(legacyEveningRowDate, todayKey, 300),
    true,
    'legacy evening row matches today at tz=300'
  )

  // Legacy row from yesterday: 10:23 AM EDT on 2026-10-13 is 2026-10-13T14:23:00Z
  const legacyYesterdayRowDate = new Date('2026-10-13T14:23:00.000Z')
  assert.equal(
    isEntryOnDay(legacyYesterdayRowDate, todayKey, 300),
    false,
    'legacy row from yesterday does not match today'
  )
})

test('GET /api/journal route integration: returns todayEntry for member at tz=300 with day marker (id: 96d4116b)', async () => {
  const markerRowDate = new Date('2026-10-14T00:00:00.000Z')
  const entries: JournalDoc[] = [
    {
      _id: 'entry-marker-1',
      userId: USER_ID,
      date: markerRowDate,
      content: 'Reflecting on today morning run',
      mood: 4,
    },
  ]

  const fakes = await installFakes(entries)

  try {
    const { GET } = await import('../../app/api/journal/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'journal-unit@example.com' })

    // Simulate request at 14:00 UTC (10:00 AM EDT) on 2026-10-14
    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/journal?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const res = await GET(req)
      assert.equal(res.status, 200)

      const body = await res.json()
      assert.equal(Array.isArray(body.entries), true)
      assert.equal(body.entries.length, 1)
      assert.ok(body.todayEntry, 'todayEntry must not be null for tz=300')
      assert.equal(body.todayEntry._id, 'entry-marker-1')
      assert.equal(new Date(body.todayEntry.date).toISOString(), markerRowDate.toISOString())
      assert.equal(body.todayEntry.content, 'Reflecting on today morning run')

      // Verify query constraints: sorted by date -1 and limited to 30
      assert.ok(fakes.queryCalls.some((c) => c.method === 'sort' && JSON.stringify(c.args[0]) === JSON.stringify({ date: -1 })))
      assert.ok(fakes.queryCalls.some((c) => c.method === 'limit' && c.args[0] === 30))
    })
  } finally {
    fakes.restore()
  }
})

test('GET /api/journal route integration: returns todayEntry for member at tz=300 with legacy instant row (id: 96d4116c)', async () => {
  const legacyRowDate = new Date('2026-10-14T14:23:00.000Z')
  const entries: JournalDoc[] = [
    {
      _id: 'entry-legacy-1',
      userId: USER_ID,
      date: legacyRowDate,
      content: 'Legacy journal entry at mid-day',
      mood: 5,
    },
  ]

  const fakes = await installFakes(entries)

  try {
    const { GET } = await import('../../app/api/journal/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'journal-unit@example.com' })

    await withFixedDate('2026-10-14T16:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/journal?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const res = await GET(req)
      assert.equal(res.status, 200)

      const body = await res.json()
      assert.ok(body.todayEntry, 'todayEntry must match legacy row for tz=300')
      assert.equal(body.todayEntry._id, 'entry-legacy-1')
      assert.equal(new Date(body.todayEntry.date).toISOString(), legacyRowDate.toISOString())
    })
  } finally {
    fakes.restore()
  }
})

test('GET /api/journal route integration: returns todayEntry null when no entry on member day', async () => {
  const yesterdayRowDate = new Date('2026-10-13T00:00:00.000Z')
  const entries: JournalDoc[] = [
    {
      _id: 'entry-yesterday-1',
      userId: USER_ID,
      date: yesterdayRowDate,
      content: 'Yesterday thoughts',
    },
  ]

  const fakes = await installFakes(entries)

  try {
    const { GET } = await import('../../app/api/journal/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'journal-unit@example.com' })

    await withFixedDate('2026-10-14T14:00:00.000Z', async () => {
      const req = new NextRequest('http://localhost/api/journal?tz=300', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const res = await GET(req)
      assert.equal(res.status, 200)

      const body = await res.json()
      assert.equal(body.entries.length, 1)
      assert.equal(body.todayEntry, null, 'todayEntry must be null when only yesterday entry exists')
    })
  } finally {
    fakes.restore()
  }
})

test('GET /api/journal returns 401 Unauthorized for unauthenticated request', async () => {
  const { GET } = await import('../../app/api/journal/route')
  const req = new NextRequest('http://localhost/api/journal?tz=300')
  const res = await GET(req)
  assert.equal(res.status, 401)
  const body = await res.json()
  assert.equal(body.error, 'Unauthorized')
})
