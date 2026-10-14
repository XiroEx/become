import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import {
  computeMeditationStats,
  type MeditationSessionSummary,
} from '../../lib/meditation'
import {
  localDayWindowForKey,
  dateKey,
} from '../../lib/dayWindow'
import Meditation from '../../models/Meditation'
import { signToken } from '../../lib/auth'

/**
 * Baseline reference implementation from `webapp/app/api/meditation/route.ts` (sha 431aac9a).
 * Used as the gold standard to prove 100% bug-for-bug behavioural parity.
 */
function legacyComputeStats(
  all: Array<{ completedAt: Date | string; durationMinutes: number }>,
  tz: number,
  todayKey: string,
) {
  const totalMinutes = all.reduce((s, e) => s + e.durationMinutes, 0)
  const totalSessions = all.length

  const [ty, tm, td] = todayKey.split('-').map(Number)
  const todayDow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() // 0=Sun
  const daysFromMon = todayDow === 0 ? 6 : todayDow - 1 // Mon=0
  const mondayKey = (() => {
    const d = new Date(Date.UTC(ty, tm - 1, td - daysFromMon))
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dy = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${mo}-${dy}`
  })()
  const { start: weekStart } = localDayWindowForKey(mondayKey, tz)
  const thisWeek = all.filter((e) => new Date(e.completedAt) >= weekStart).length

  const uniqueDates = [
    ...new Set(
      all.map((e) => dateKey(new Date(e.completedAt), tz)),
    ),
  ].sort((a, b) => b.localeCompare(a)) // descending

  let streakDays = 0
  let cursorKey = todayKey
  for (const ds of uniqueDates) {
    if (ds === cursorKey) {
      streakDays++
      const [cy, cm, cd] = cursorKey.split('-').map(Number)
      const prev = new Date(Date.UTC(cy, cm - 1, cd - 1))
      cursorKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`
    } else if (ds < cursorKey) {
      break
    }
  }

  const meditatedToday = uniqueDates.includes(todayKey)

  return { totalMinutes, totalSessions, thisWeek, streakDays, meditatedToday }
}

test('fixture history crossing Mon-Sun boundary with a streak gap matches legacy behavior', () => {
  // Anchor: Wednesday, 2026-10-14 (todayKey = '2026-10-14', tz = 0)
  // Current week Mon-Sun: Monday 2026-10-12 to Sunday 2026-10-18
  // Previous week Sunday: 2026-10-11
  // Gap on Saturday: 2026-10-10
  // Previous week sessions before gap: 2026-10-09 (Fri), 2026-10-08 (Thu)
  const fixture: MeditationSessionSummary[] = [
    { completedAt: new Date('2026-10-14T10:00:00.000Z'), durationMinutes: 15 }, // Wed (today, this week)
    { completedAt: new Date('2026-10-13T18:30:00.000Z'), durationMinutes: 20 }, // Tue (yesterday, this week)
    { completedAt: new Date('2026-10-12T08:00:00.000Z'), durationMinutes: 10 }, // Mon (start of this week)
    { completedAt: new Date('2026-10-11T20:00:00.000Z'), durationMinutes: 25 }, // Sun (previous week)
    // 2026-10-10 (Sat) is a gap!
    { completedAt: new Date('2026-10-09T09:15:00.000Z'), durationMinutes: 30 }, // Fri (previous week, before gap)
    { completedAt: new Date('2026-10-08T12:00:00.000Z'), durationMinutes: 10 }, // Thu (previous week, before gap)
  ]

  const todayKey = '2026-10-14'
  const tz = 0

  const legacy = legacyComputeStats(fixture, tz, todayKey)
  const current = computeMeditationStats(fixture, tz, todayKey)

  // 1. Assert exact match with legacy baseline
  assert.deepEqual(current, legacy)

  // 2. Assert concrete values:
  // - totalMinutes: 15 + 20 + 10 + 25 + 30 + 10 = 110
  // - totalSessions: 6
  // - thisWeek: 3 (10-14, 10-13, 10-12)
  // - streakDays: 4 (10-14, 10-13, 10-12, 10-11; broken by gap on 10-10)
  // - meditatedToday: true (session logged on 10-14)
  assert.equal(current.totalMinutes, 110)
  assert.equal(current.totalSessions, 6)
  assert.equal(current.thisWeek, 3)
  assert.equal(current.streakDays, 4)
  assert.equal(current.meditatedToday, true)
})

test('streak resets to 0 when user has not meditated today', () => {
  // Same history as above, but omitting today's session (2026-10-14)
  const fixtureNoToday: MeditationSessionSummary[] = [
    { completedAt: new Date('2026-10-13T18:30:00.000Z'), durationMinutes: 20 },
    { completedAt: new Date('2026-10-12T08:00:00.000Z'), durationMinutes: 10 },
    { completedAt: new Date('2026-10-11T20:00:00.000Z'), durationMinutes: 25 },
    // Gap on 2026-10-10
    { completedAt: new Date('2026-10-09T09:15:00.000Z'), durationMinutes: 30 },
    { completedAt: new Date('2026-10-08T12:00:00.000Z'), durationMinutes: 10 },
  ]

  const todayKey = '2026-10-14'
  const tz = 0

  const legacy = legacyComputeStats(fixtureNoToday, tz, todayKey)
  const current = computeMeditationStats(fixtureNoToday, tz, todayKey)

  assert.deepEqual(current, legacy)
  assert.equal(current.totalMinutes, 95)
  assert.equal(current.totalSessions, 5)
  assert.equal(current.thisWeek, 2) // Mon 10-12 & Tue 10-13
  assert.equal(current.streakDays, 0) // strict streak rule: no session today => 0
  assert.equal(current.meditatedToday, false)
})

test('timezones west and east of UTC preserve local day key bucketing and streak calculation', () => {
  // Event logged on Sunday night UTC: 2026-10-11T23:30:00.000Z
  // In UTC (tz = 0): 2026-10-11 (Sunday, last week)
  // In New York (EDT, tz = 240): 19:30 on 2026-10-11 (Sunday, last week)
  // In Tokyo (JST, tz = -540): 08:30 on 2026-10-12 (Monday, current week!)
  const sundayNightSession: MeditationSessionSummary = {
    completedAt: new Date('2026-10-11T23:30:00.000Z'),
    durationMinutes: 20,
  }

  // Tokyo (tz = -540): Sunday night UTC is Monday morning in Tokyo
  const tokyoToday = '2026-10-12'
  const tokyoStats = computeMeditationStats([sundayNightSession], -540, tokyoToday)
  const tokyoLegacy = legacyComputeStats([sundayNightSession], -540, tokyoToday)
  assert.deepEqual(tokyoStats, tokyoLegacy)
  assert.equal(tokyoStats.thisWeek, 1) // On Monday, so in this week
  assert.equal(tokyoStats.streakDays, 1) // Meditated on Monday (today in Tokyo)
  assert.equal(tokyoStats.meditatedToday, true)

  // New York (tz = 240): Sunday night UTC is Sunday evening in New York
  const nyToday = '2026-10-12' // Monday today in NY
  const nyStats = computeMeditationStats([sundayNightSession], 240, nyToday)
  const nyLegacy = legacyComputeStats([sundayNightSession], 240, nyToday)
  assert.deepEqual(nyStats, nyLegacy)
  assert.equal(nyStats.thisWeek, 0) // Sunday session belongs to prior week
  assert.equal(nyStats.streakDays, 0) // No session on Monday (today in NY)
  assert.equal(nyStats.meditatedToday, false)
})

test('multiple sessions on the same day accumulate totalMinutes and totalSessions but count as 1 streak day', () => {
  const multiSessions: MeditationSessionSummary[] = [
    { completedAt: new Date('2026-10-14T08:00:00.000Z'), durationMinutes: 10 },
    { completedAt: new Date('2026-10-14T14:00:00.000Z'), durationMinutes: 20 },
    { completedAt: new Date('2026-10-13T09:00:00.000Z'), durationMinutes: 15 },
    { completedAt: new Date('2026-10-13T21:00:00.000Z'), durationMinutes: 15 },
  ]

  const todayKey = '2026-10-14'
  const tz = 0

  const legacy = legacyComputeStats(multiSessions, tz, todayKey)
  const current = computeMeditationStats(multiSessions, tz, todayKey)

  assert.deepEqual(current, legacy)
  assert.equal(current.totalSessions, 4)
  assert.equal(current.totalMinutes, 60)
  assert.equal(current.thisWeek, 4)
  assert.equal(current.streakDays, 2) // 2 consecutive days
  assert.equal(current.meditatedToday, true)
})

test('empty history returns zeroed stats', () => {
  const current = computeMeditationStats([], 0, '2026-10-14')
  assert.deepEqual(current, {
    totalMinutes: 0,
    totalSessions: 0,
    thisWeek: 0,
    streakDays: 0,
    meditatedToday: false,
  })
})

test('large history (> 30 sessions) counts all sessions for stats', () => {
  // Generate 45 daily sessions ending on 2026-10-14
  const largeHistory: MeditationSessionSummary[] = []
  const base = new Date('2026-10-14T12:00:00.000Z').getTime()
  for (let i = 0; i < 45; i++) {
    largeHistory.push({
      completedAt: new Date(base - i * 86_400_000),
      durationMinutes: 10,
    })
  }

  const legacy = legacyComputeStats(largeHistory, 0, '2026-10-14')
  const current = computeMeditationStats(largeHistory, 0, '2026-10-14')

  assert.deepEqual(current, legacy)
  assert.equal(current.totalSessions, 45)
  assert.equal(current.totalMinutes, 450)
  assert.equal(current.streakDays, 45)
  assert.equal(current.meditatedToday, true)
})

// --- Route integration tests with fakes --------------------------------------

function chain(value: unknown): Promise<unknown> {
  const p = Promise.resolve(value) as Promise<unknown> & Record<string, unknown>
  for (const method of ['lean', 'select', 'sort', 'limit']) p[method] = () => chain(value)
  p.exec = () => chain(value)
  return p
}

test('GET /api/meditation: 401 when unauthenticated', async () => {
  const { GET } = await import('../../app/api/meditation/route')
  const req = new NextRequest('http://localhost/api/meditation', { method: 'GET' })
  const res = await GET(req)
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Unauthorized/)
})

test('GET /api/meditation: returns 30 newest sessions and computes stats without fetching full history twice', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) g.mongoose = { conn: null, promise: null }
  g.mongoose.conn = {}
  g.mongoose.promise = Promise.resolve({})

  const calls: Array<{ filter: unknown; projection?: unknown; sort?: unknown; limit?: unknown }> = []
  const originalFind = Meditation.find

  const fakeSessions = Array.from({ length: 30 }, (_, i) => ({
    _id: `session-${i}`,
    userId: 'test-user-id',
    categoryId: 'recovery',
    categoryName: 'Deep Recovery',
    durationMinutes: 10,
    completedAt: new Date(Date.now() - i * 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

  const fakeProjectedHistory = Array.from({ length: 40 }, (_, i) => ({
    _id: `session-${i}`,
    durationMinutes: 10,
    completedAt: new Date(Date.now() - i * 86_400_000),
  }))

  Meditation.find = ((filter: unknown, projection?: unknown) => {
    calls.push({ filter, projection })
    if (!projection) {
      return chain(fakeSessions)
    }
    return chain(fakeProjectedHistory)
  }) as unknown as typeof Meditation.find

  try {
    const { GET } = await import('../../app/api/meditation/route')
    const token = await signToken({ userId: 'test-user-id', email: 'test@example.com' })
    const req = new NextRequest('http://localhost/api/meditation?tz=0', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    const res = await GET(req)
    assert.equal(res.status, 200)
    const json = await res.json()

    // Response shape contract: { sessions, stats }
    assert.ok(Array.isArray(json.sessions))
    assert.equal(json.sessions.length, 30)
    assert.equal(json.sessions[0]._id, 'session-0')
    assert.equal(json.sessions[0].categoryName, 'Deep Recovery')

    assert.ok(json.stats)
    assert.equal(typeof json.stats.totalMinutes, 'number')
    assert.equal(typeof json.stats.totalSessions, 'number')
    assert.equal(typeof json.stats.thisWeek, 'number')
    assert.equal(typeof json.stats.streakDays, 'number')
    assert.equal(typeof json.stats.meditatedToday, 'boolean')

    // Verify database calls:
    // First query: find({ userId: 'test-user-id' }) for newest 30 sessions
    // Second query: find({ userId: 'test-user-id' }, 'completedAt durationMinutes') - projection only!
    // Never an unbounded full-document query.
    assert.equal(calls.length, 2)
    assert.equal(calls[0].projection, undefined) // sessions query (chained with .sort().limit())
    assert.equal(calls[1].projection, 'completedAt durationMinutes') // lightweight stats projection
  } finally {
    Meditation.find = originalFind
  }
})

test('GET /api/meditation: when member has < 30 sessions, only 1 database query is performed', async () => {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  if (!g.mongoose) g.mongoose = { conn: null, promise: null }
  g.mongoose.conn = {}
  g.mongoose.promise = Promise.resolve({})

  const calls: Array<{ filter: unknown; projection?: unknown }> = []
  const originalFind = Meditation.find

  const fakeFewSessions = [
    {
      _id: 'session-1',
      userId: 'few-user-id',
      categoryId: 'box',
      categoryName: 'Box Breathing',
      durationMinutes: 15,
      completedAt: new Date(),
    },
  ]

  Meditation.find = ((filter: unknown, projection?: unknown) => {
    calls.push({ filter, projection })
    return chain(fakeFewSessions)
  }) as unknown as typeof Meditation.find

  try {
    const { GET } = await import('../../app/api/meditation/route')
    const token = await signToken({ userId: 'few-user-id', email: 'few@example.com' })
    const req = new NextRequest('http://localhost/api/meditation?tz=0', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    const res = await GET(req)
    assert.equal(res.status, 200)
    const json = await res.json()

    assert.equal(json.sessions.length, 1)
    assert.equal(json.stats.totalSessions, 1)
    assert.equal(json.stats.totalMinutes, 15)
    assert.equal(json.stats.meditatedToday, true)

    // When sessions.length < 30, history reuses sessions directly. Only 1 find call!
    assert.equal(calls.length, 1)
  } finally {
    Meditation.find = originalFind
  }
})
