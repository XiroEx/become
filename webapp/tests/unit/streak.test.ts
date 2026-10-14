//
// Tests for streak calculation and GET /api/streak:
//
// 1. lastActivityDate stored as day-marker (UTC midnight) reads as active today
//    for callers west of UTC (e.g. US Eastern tz=300), at UTC (tz=0), and
//    east of UTC (e.g. Japan tz=-540).
// 2. Parity between GET /api/streak's activityToday (using isEntryOnDay) and
//    GET /api/streaks' overall.activeToday (either-reading rule in compute.ts).
// 3. GET /api/streak endpoint integration with in-memory fakes.
// 4. recordStreakActivity awaits the lastStreakEmailDate throttle write,
//    and a failed write cannot fail the member's action.
//

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { isEntryOnDay, dateKey } from '../../lib/dayWindow'

// Ensure mongoose global is stubbed before any DB connection can be attempted
const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: {}, promise: null }

const USER_ID = 'unit-streak-user'

/** A thenable that also answers query-builder chaining (.lean, .select, etc.) */
function chain(value: unknown): Promise<unknown> {
  const p = Promise.resolve(value) as Promise<unknown> & Record<string, unknown>
  for (const method of ['lean', 'select', 'sort', 'limit']) p[method] = () => chain(value)
  p.exec = () => chain(value)
  return p
}

type ProgressDoc = {
  userId?: string
  streakDays?: number
  longestStreak?: number
  streakFreezes?: number
  lastActivityDate?: Date | null
  lastStreakEmailDate?: Date | null
  milestonesReached?: number[]
} | null

async function installFakes(progress: ProgressDoc) {
  const UserProgress = (await import('../../models/UserProgress')).default
  const User = (await import('../../models/User')).default

  const writes: Array<{ fn: string; args: unknown[] }> = []
  const patched: Array<[Record<string, unknown>, string]> = []
  const patch = (model: unknown, name: string, impl: unknown) => {
    const target = model as Record<string, unknown>
    patched.push([target, name])
    target[name] = impl
  }

  patch(UserProgress, 'findOne', () => chain(progress ? { userId: USER_ID, ...progress } : null))
  patch(UserProgress, 'updateOne', (...args: unknown[]) => {
    writes.push({ fn: 'updateOne', args })
    return chain({ acknowledged: true })
  })
  patch(UserProgress, 'create', (...args: unknown[]) => {
    writes.push({ fn: 'create', args })
    return Promise.resolve({})
  })
  patch(User, 'findById', () => chain({ emailPreferences: { engagement: true } }))

  return {
    writes,
    patch,
    UserProgress,
    restore: () => {
      for (const [target, name] of patched) delete target[name]
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

test('(id: 96d41159) for lastActivityDate 2026-10-14T00:00:00Z and today 2026-10-14, activityToday is true at tz=300, tz=0 and tz=-540', () => {
  const lastActivityDate = new Date('2026-10-14T00:00:00Z')
  const todayKey = '2026-10-14'

  // Demonstrates the bug with dateKey(lastActivityDate, tz):
  // West of UTC, dateKey shifts backwards into yesterday:
  assert.equal(dateKey(lastActivityDate, 300), '2026-10-13', 'dateKey shifts day backwards for US Eastern')
  assert.notEqual(dateKey(lastActivityDate, 300), todayKey, 'bug: dateKey === todayKey fails for US Eastern')

  // With isEntryOnDay (the fix), all timezones evaluate to true:
  assert.equal(isEntryOnDay(lastActivityDate, todayKey, 300), true, 'active at tz=300 (US Eastern)')
  assert.equal(isEntryOnDay(lastActivityDate, todayKey, 0), true, 'active at tz=0 (UTC)')
  assert.equal(isEntryOnDay(lastActivityDate, todayKey, -540), true, 'active at tz=-540 (Japan)')
})

test("(id: 96d4115a) /api/streak's activityToday and /api/streaks' overall.activeToday agree for the same stored row and tz", () => {
  const todayKey = '2026-10-14'

  // /api/streak derivation:
  const apiStreakRule = (lastActivityDate: Date | null, tz: number) =>
    lastActivityDate ? isEntryOnDay(lastActivityDate, todayKey, tz) : false

  // /api/streaks rule from webapp/lib/streaks/compute.ts line 180:
  // activeToday: lastActivity ? dateKey(lastActivity, tz) === todayKey || dateKey(lastActivity, 0) === todayKey : false
  const apiStreaksRule = (lastActivity: Date | null, tz: number) =>
    lastActivity
      ? dateKey(lastActivity, tz) === todayKey || dateKey(lastActivity, 0) === todayKey
      : false

  const testCases: Array<{ desc: string; date: Date | null }> = [
    { desc: 'day marker today', date: new Date('2026-10-14T00:00:00Z') },
    { desc: 'day marker yesterday', date: new Date('2026-10-13T00:00:00Z') },
    { desc: 'day marker tomorrow', date: new Date('2026-10-15T00:00:00Z') },
    { desc: 'instant today 14:00Z', date: new Date('2026-10-14T14:00:00Z') },
    { desc: 'instant today 02:00Z', date: new Date('2026-10-14T02:00:00Z') },
    { desc: 'instant yesterday evening', date: new Date('2026-10-13T23:30:00Z') },
    { desc: 'null lastActivityDate', date: null },
  ]

  for (const tz of [300, 0, -540, 480, -60]) {
    for (const { desc, date } of testCases) {
      const streakVal = apiStreakRule(date, tz)
      const streaksVal = apiStreaksRule(date, tz)
      assert.equal(
        streakVal,
        streaksVal,
        `Expected agreement for ${desc} at tz=${tz}: /api/streak=${streakVal}, /api/streaks=${streaksVal}`
      )
    }
  }
})

test('GET /api/streak returns activityToday=true for US member (tz=300) with day marker 2026-10-14T00:00:00Z', async () => {
  const lastActivityDate = new Date('2026-10-14T00:00:00Z')
  const fakes = await installFakes({
    streakDays: 7,
    longestStreak: 14,
    streakFreezes: 2,
    lastActivityDate,
    milestonesReached: [3, 7],
  })

  try {
    const { GET } = await import('../../app/api/streak/route')
    const { signToken } = await import('../../lib/auth')
    const token = await signToken({ userId: USER_ID, email: 'streak-unit@example.com' })

    // Test at 14:00 UTC (10:00 EDT) -> today is 2026-10-14 for tz=300 and tz=0
    await withFixedDate('2026-10-14T14:00:00Z', async () => {
      for (const tz of [300, 0]) {
        const req = new NextRequest(`http://localhost/api/streak?tz=${tz}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const res = await GET(req)
        assert.equal(res.status, 200)
        const body = await res.json()

        assert.equal(body.activityToday, true, `activityToday must be true at tz=${tz}`)
        assert.equal(body.streakDays, 7)
        assert.equal(body.longestStreak, 14)
        assert.equal(body.streakFreezes, 2)
        assert.deepEqual(body.milestonesReached, [3, 7])
        assert.equal(body.nextMilestone, 14)
        assert.equal(body.lastActivityDate, lastActivityDate.toISOString())
        assert.deepEqual(fakes.writes, [], 'GET must never write')
      }
    })

    // Japan (tz=-540): at 05:00 UTC (14:00 JST), todayKey is '2026-10-14'
    await withFixedDate('2026-10-14T05:00:00Z', async () => {
      const reqJapan = new NextRequest('http://localhost/api/streak?tz=-540', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const resJapan = await GET(reqJapan)
      assert.equal(resJapan.status, 200)
      const bodyJapan = await resJapan.json()
      assert.equal(bodyJapan.activityToday, true, 'activityToday must be true at tz=-540')
    })
  } finally {
    fakes.restore()
  }
})

test('(id: 96d4115b) lastStreakEmailDate throttle write in recordStreakActivity is awaited and cannot fail the action', async () => {
  const { recordStreakActivity } = await import('../../lib/streak')

  // Set up progress doc at 2 streak days, so next activity reaches milestone 3
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  yesterday.setHours(0, 0, 0, 0)

  let emailDateWriteAwaited = false
  let emailDateWritten = false

  const fakes = await installFakes({
    streakDays: 2,
    longestStreak: 2,
    streakFreezes: 1,
    lastActivityDate: yesterday,
    lastStreakEmailDate: null,
    milestonesReached: [],
  })

  // Mock updateOne to delay the lastStreakEmailDate write slightly to prove it is awaited
  fakes.patch(fakes.UserProgress, 'updateOne', (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    const set = (update as { $set?: Record<string, unknown> })?.$set ?? {}
    if (set.lastStreakEmailDate) {
      emailDateWritten = true
      return new Promise((resolve) => {
        setTimeout(() => {
          emailDateWriteAwaited = true
          resolve({ acknowledged: true })
        }, 30)
      })
    }
    return chain({ acknowledged: true })
  })

  try {
    const result = await recordStreakActivity(USER_ID, 'member@example.com')
    assert.equal(emailDateWritten, true, 'lastStreakEmailDate write was initiated')
    assert.equal(emailDateWriteAwaited, true, 'lastStreakEmailDate write was awaited before recordStreakActivity returned')
    assert.equal(result.streakDays, 3)
    assert.equal(result.newMilestone, 3)
  } finally {
    fakes.restore()
  }

  // Also verify that if lastStreakEmailDate update fails, recordStreakActivity still succeeds (cannot fail action)
  const fakesFailing = await installFakes({
    streakDays: 2,
    longestStreak: 2,
    streakFreezes: 1,
    lastActivityDate: yesterday,
    lastStreakEmailDate: null,
    milestonesReached: [],
  })

  fakesFailing.patch(fakesFailing.UserProgress, 'updateOne', (filter: Record<string, unknown>, update: Record<string, unknown>) => {
    const set = (update as { $set?: Record<string, unknown> })?.$set ?? {}
    if (set.lastStreakEmailDate) {
      return Promise.reject(new Error('simulated MongoDB connection loss during email date throttle write'))
    }
    return chain({ acknowledged: true })
  })

  try {
    const result = await recordStreakActivity(USER_ID, 'member@example.com')
    assert.equal(result.streakDays, 3)
    assert.equal(result.newMilestone, 3)
  } finally {
    fakesFailing.restore()
  }
})
