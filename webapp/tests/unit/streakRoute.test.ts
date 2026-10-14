// Run with: npm run test:file tests/unit/streakRoute.test.ts
//
// GET /api/streak used to return `progress.streakDays` verbatim — the raw
// stored number, un-recomputed, for as long as a member stayed quiet. These
// drive the route for real (the pattern in workouts-replay-attempt.test.ts):
// `UserProgress`'s statics are swapped for in-memory fakes and
// `global.mongoose` is pre-seeded so dbConnect() never opens a socket.
//
// Every case also asserts UserProgress.updateOne/create were never called —
// the read path must never write streakDays, longestStreak, streakFreezes or
// milestonesReached back to the stored document.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import UserProgress from '../../models/UserProgress'
import { signToken } from '../../lib/auth'

const USER_ID = 'streak-route-user'
const DAY_MS = 24 * 60 * 60 * 1000

/** A thenable that also answers the query-builder calls the route chains onto it. */
function chain(value: unknown): Promise<unknown> {
  const p = Promise.resolve(value) as Promise<unknown> & Record<string, unknown>
  for (const method of ['lean', 'select', 'sort', 'limit']) p[method] = () => chain(value)
  p.exec = () => chain(value)
  return p
}

type Progress = {
  streakDays?: number
  longestStreak?: number
  streakFreezes?: number
  lastActivityDate?: Date | null
  milestonesReached?: number[]
} | null

function installFakes(progress: Progress) {
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

  return {
    writes,
    restore: () => {
      for (const [target, name] of patched) delete target[name]
    },
  }
}

async function getStreak(progress: Progress, tz = 0): Promise<{ status: number; body: Record<string, unknown>; writes: unknown[] }> {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  g.mongoose = { conn: {}, promise: null }

  const fakes = installFakes(progress)
  try {
    const { GET } = await import('../../app/api/streak/route')
    const token = await signToken({ userId: USER_ID, email: 'streak-route@example.com' })
    const request = new NextRequest(`http://localhost/api/streak?tz=${tz}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const res = await GET(request)
    const body = await res.json()
    return { status: res.status, body, writes: fakes.writes }
  } finally {
    fakes.restore()
  }
}

test('active today: reports the stored streakDays as-is', async () => {
  const { status, body, writes } = await getStreak({
    streakDays: 12,
    longestStreak: 20,
    streakFreezes: 1,
    lastActivityDate: new Date(Date.now() - 0 * DAY_MS),
    milestonesReached: [7],
  })
  assert.equal(status, 200)
  assert.equal(body.streakDays, 12)
  assert.equal(body.activityToday, true)
  assert.deepEqual(writes, [], 'GET must never write')
})

test('missed one day, still savable: reports the stored streakDays, not 0', async () => {
  const { body, writes } = await getStreak({
    streakDays: 12,
    longestStreak: 20,
    streakFreezes: 1,
    lastActivityDate: new Date(Date.now() - 1 * DAY_MS),
  })
  assert.equal(body.streakDays, 12)
  assert.deepEqual(writes, [])
})

test('missed exactly one day and still holds a freeze: streak stays on screen', async () => {
  const { body, writes } = await getStreak({
    streakDays: 12,
    longestStreak: 20,
    streakFreezes: 1,
    lastActivityDate: new Date(Date.now() - 2 * DAY_MS),
  })
  assert.equal(body.streakDays, 12, 'a freeze will save it on the next log, so it is not dead yet')
  assert.deepEqual(writes, [])
})

test('missed exactly one day with NO freezes left: dead, reports 0', async () => {
  const { body, writes } = await getStreak({
    streakDays: 12,
    longestStreak: 20,
    streakFreezes: 0,
    lastActivityDate: new Date(Date.now() - 2 * DAY_MS),
  })
  assert.equal(body.streakDays, 0)
  // longestStreak is the member's best-ever run and is untouched by a lapse.
  assert.equal(body.longestStreak, 20)
  assert.deepEqual(writes, [])
})

test('quiet for 7 days: dead, reports 0 and a truthful next milestone', async () => {
  const { body, writes } = await getStreak({
    streakDays: 12,
    longestStreak: 20,
    streakFreezes: 2,
    lastActivityDate: new Date(Date.now() - 7 * DAY_MS),
  })
  assert.equal(body.streakDays, 0)
  // nextMilestone is computed off the now-zeroed streakDays, not the stale 12.
  assert.notEqual(body.nextMilestone, null)
  assert.ok((body.nextMilestone as number) > 0)
  assert.deepEqual(writes, [])
})

test('quiet for 14 days: dead, reports 0', async () => {
  const { body, writes } = await getStreak({
    streakDays: 30,
    longestStreak: 30,
    streakFreezes: 1,
    lastActivityDate: new Date(Date.now() - 14 * DAY_MS),
  })
  assert.equal(body.streakDays, 0)
  assert.deepEqual(writes, [])
})

test('a member with no progress document: 0, no crash, no write', async () => {
  const { status, body, writes } = await getStreak(null)
  assert.equal(status, 200)
  assert.equal(body.streakDays, 0)
  assert.equal(body.longestStreak, 0)
  assert.deepEqual(writes, [])
})
