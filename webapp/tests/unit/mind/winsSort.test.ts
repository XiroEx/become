// Run with: npm run test:file tests/unit/mind/winsSort.test.ts
//
// Tests for GET /api/mind/wins:
// - Deterministic sort order: newest win of the newest day first ({ date: -1, createdAt: -1 }) (9d6d2856)
// - Proves two wins created on the same local day come back newest-first
// - Limit parameter respected as row count (9d6d2859)
// - Response shape { wins } intact (9d6d2858)

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import DailyWin from '../../../models/DailyWin'
import { signToken } from '../../../lib/auth'

const TEST_USER_ID = '65f00000000000000000ff99'
let getHandler: (req: NextRequest) => Promise<Response>
const originalFind = DailyWin.find

before(async () => {
  const mod = await import('../../../app/api/mind/wins/route')
  getHandler = mod.GET
})

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(DailyWin as any).find = originalFind
})

async function authedToken(userId = TEST_USER_ID) {
  const token = await signToken({ userId, email: 'wins-test@example.com' })
  return `Bearer ${token}`
}

function makeGetRequest(url: string, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest(url, { method: 'GET', headers })
}

test('(id: 9d6d2856) GET /api/mind/wins passes { date: -1, createdAt: -1 } to DailyWin.find().sort()', async () => {
  const token = await authedToken()
  let capturedSort: unknown = null
  let capturedLimit: unknown = null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(DailyWin as any).find = (query: any) => {
    assert.equal(query.userId, TEST_USER_ID)
    const builder = {
      sort: (sortArg: unknown) => {
        capturedSort = sortArg
        return builder
      },
      limit: (limitArg: unknown) => {
        capturedLimit = limitArg
        return builder
      },
      lean: () => Promise.resolve([]),
    }
    return builder
  }

  const req = makeGetRequest('http://localhost/api/mind/wins', token)
  const res = await getHandler(req)
  assert.equal(res.status, 200)

  assert.deepEqual(capturedSort, { date: -1, createdAt: -1 })
  assert.equal(capturedLimit, 7) // default row limit
})

test('(id: 9d6d2856) GET /api/mind/wins returns two same-day wins newest-first', async () => {
  const token = await authedToken()

  // Two wins on the same local day (2026-10-15 midnight UTC marker):
  // win1: logged at 08:30 UTC
  // win2: logged at 15:45 UTC (newer)
  // win3: logged yesterday
  const win1 = {
    _id: 'win-1',
    userId: TEST_USER_ID,
    date: new Date('2026-10-15T00:00:00.000Z'),
    createdAt: new Date('2026-10-15T08:30:00.000Z'),
    win: 'Morning win: finished heavy squat session',
  }
  const win2 = {
    _id: 'win-2',
    userId: TEST_USER_ID,
    date: new Date('2026-10-15T00:00:00.000Z'),
    createdAt: new Date('2026-10-15T15:45:00.000Z'),
    win: 'Afternoon win: hit protein goal early',
  }
  const win3 = {
    _id: 'win-3',
    userId: TEST_USER_ID,
    date: new Date('2026-10-14T00:00:00.000Z'),
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    win: 'Yesterday win: walked 10k steps',
  }

  // Raw mock records in arbitrary insertion order
  const rawRows = [win1, win3, win2]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(DailyWin as any).find = () => {
    let sortCriteria: Record<string, number> = {}
    let limitCount = 7
    const builder = {
      sort: (sortArg: Record<string, number>) => {
        sortCriteria = sortArg
        return builder
      },
      limit: (limitArg: number) => {
        limitCount = limitArg
        return builder
      },
      lean: () => {
        // Implement Mongo sort semantics for { date: -1, createdAt: -1 }
        const sorted = [...rawRows].sort((a, b) => {
          if (sortCriteria.date) {
            const dateDiff = (b.date.getTime() - a.date.getTime()) * Math.sign(sortCriteria.date)
            if (dateDiff !== 0) return -dateDiff
          }
          if (sortCriteria.createdAt) {
            const createdDiff = (b.createdAt.getTime() - a.createdAt.getTime()) * Math.sign(sortCriteria.createdAt)
            if (createdDiff !== 0) return -createdDiff
          }
          return 0
        })
        return Promise.resolve(sorted.slice(0, limitCount))
      },
    }
    return builder
  }

  const req = makeGetRequest('http://localhost/api/mind/wins', token)
  const res = await getHandler(req)
  assert.equal(res.status, 200)

  const data = await res.json()
  assert.ok(Array.isArray(data.wins))
  assert.equal(data.wins.length, 3)

  // Verify same-day wins are ordered newest-first: win2 (15:45) before win1 (08:30)
  assert.equal(data.wins[0].win, 'Afternoon win: hit protein goal early')
  assert.equal(data.wins[1].win, 'Morning win: finished heavy squat session')
  assert.equal(data.wins[2].win, 'Yesterday win: walked 10k steps')
})

test('(id: 9d6d2859) GET /api/mind/wins applies limit parameter as row count', async () => {
  const token = await authedToken()
  let capturedLimit: number | null = null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(DailyWin as any).find = () => {
    const builder = {
      sort: () => builder,
      limit: (limitArg: number) => {
        capturedLimit = limitArg
        return builder
      },
      lean: () => Promise.resolve([]),
    }
    return builder
  }

  // Explicit limit=3
  const req = makeGetRequest('http://localhost/api/mind/wins?limit=3', token)
  const res = await getHandler(req)
  assert.equal(res.status, 200)
  assert.equal(capturedLimit, 3)
})

test('(id: 9d6d2858) GET /api/mind/wins retains { wins } shape', async () => {
  const token = await authedToken()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(DailyWin as any).find = () => {
    const builder = {
      sort: () => builder,
      limit: () => builder,
      lean: () => Promise.resolve([{ _id: 'w1', win: 'Great session', date: new Date() }]),
    }
    return builder
  }

  const req = makeGetRequest('http://localhost/api/mind/wins', token)
  const res = await getHandler(req)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.deepEqual(Object.keys(data), ['wins'])
  assert.equal(data.wins.length, 1)
  assert.equal(data.wins[0].win, 'Great session')
})
