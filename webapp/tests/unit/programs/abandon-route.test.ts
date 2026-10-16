// Run with: npm run test:file tests/unit/programs/abandon-route.test.ts

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, mock, before } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import UserProgress from '../../../models/UserProgress'
import Schedule from '../../../models/Schedule'
import { signToken } from '../../../lib/auth'

let postHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/programs/abandon/route')
  postHandler = (mod as any).POST ?? (mod as any).default?.POST
})

function makeRequest(body?: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/programs/abandon', {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function authedHeader(userId: string) {
  const token = await signToken({ userId, email: 'test@example.com' })
  return `Bearer ${token}`
}

test('(id: 9d6d29c2) Whole-document userProgress.save() is replaced with targeted update (currentProgram matches)', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'prog-123'

  let saveCalled = false
  const userProgressDoc: any = {
    userId,
    activePrograms: [{ programId, programName: 'Test Program' }],
    currentProgram: { programId, programName: 'Test Program' },
    save: async () => {
      saveCalled = true
    },
  }

  const findOneMock = mock.method(UserProgress, 'findOne', async () => userProgressDoc)
  const updateOneCalls: any[] = []
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })
  const deleteOneCalls: any[] = []
  const deleteOneMock = mock.method(Schedule, 'deleteOne', async (filter: any) => {
    deleteOneCalls.push(filter)
    return { acknowledged: true, deletedCount: 1 }
  })

  try {
    const req = makeRequest({ programId }, token)
    const res = await postHandler(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      success: true,
      message: 'Program abandoned successfully',
    })

    assert.equal(saveCalled, false, 'userProgress.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1)
    assert.deepEqual(updateOneCalls[0].filter, { userId })
    assert.deepEqual(updateOneCalls[0].update, {
      $pull: { activePrograms: { programId } },
      $unset: { currentProgram: 1 },
    })

    assert.equal(deleteOneCalls.length, 1)
    assert.deepEqual(deleteOneCalls[0], { userId, programId })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
    deleteOneMock.mock.restore()
  }
})

test('(id: 9d6d29c2) Whole-document userProgress.save() is replaced with targeted update (currentProgram does not match)', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'prog-abandon'

  let saveCalled = false
  const userProgressDoc: any = {
    userId,
    activePrograms: [{ programId, programName: 'To Abandon' }, { programId: 'prog-other', programName: 'Other' }],
    currentProgram: { programId: 'prog-other', programName: 'Other' },
    save: async () => {
      saveCalled = true
    },
  }

  const findOneMock = mock.method(UserProgress, 'findOne', async () => userProgressDoc)
  const updateOneCalls: any[] = []
  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: any, update: any) => {
    updateOneCalls.push({ filter, update })
    return { acknowledged: true, modifiedCount: 1 }
  })
  const deleteOneCalls: any[] = []
  const deleteOneMock = mock.method(Schedule, 'deleteOne', async (filter: any) => {
    deleteOneCalls.push(filter)
    return { acknowledged: true, deletedCount: 1 }
  })

  try {
    const req = makeRequest({ programId }, token)
    const res = await postHandler(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, {
      success: true,
      message: 'Program abandoned successfully',
    })

    assert.equal(saveCalled, false, 'userProgress.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1)
    assert.deepEqual(updateOneCalls[0].filter, { userId })
    assert.deepEqual(updateOneCalls[0].update, {
      $pull: { activePrograms: { programId } },
    })
    assert.equal(updateOneCalls[0].update.$unset, undefined)

    assert.equal(deleteOneCalls.length, 1)
    assert.deepEqual(deleteOneCalls[0], { userId, programId })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
    deleteOneMock.mock.restore()
  }
})

test('(id: 9d6d29c3) Errors during UserProgress update are logged to console.error', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const programId = 'prog-err'

  const userProgressDoc: any = {
    userId,
    activePrograms: [{ programId, programName: 'Err Program' }],
    currentProgram: { programId, programName: 'Err Program' },
  }

  const loggedErrors: any[] = []
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    loggedErrors.push(args)
  }

  const findOneMock = mock.method(UserProgress, 'findOne', async () => userProgressDoc)
  const dbError = new Error('Database write failure during updateOne')
  const updateOneMock = mock.method(UserProgress, 'updateOne', async () => {
    throw dbError
  })
  const deleteOneCalls: any[] = []
  const deleteOneMock = mock.method(Schedule, 'deleteOne', async (filter: any) => {
    deleteOneCalls.push(filter)
    return { acknowledged: true, deletedCount: 1 }
  })

  try {
    const req = makeRequest({ programId }, token)
    const res = await postHandler(req)
    assert.equal(res.status, 500)
    const json = await res.json()
    assert.deepEqual(json, { error: 'Internal server error' })

    // Verify console.error was called with expected message
    const foundErrorLog = loggedErrors.some((args) =>
      args.some((arg: any) =>
        typeof arg === 'string' && arg.includes('POST /api/programs/abandon update error:')
      )
    )
    assert.ok(foundErrorLog, 'console.error must log "POST /api/programs/abandon update error:"')

    // Schedule deletion should not happen if update failed
    assert.equal(deleteOneCalls.length, 0, 'Schedule.deleteOne should not be called if update failed')
  } finally {
    console.error = originalConsoleError
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
    deleteOneMock.mock.restore()
  }
})

test('(id: 9d6d29c5) Response format and status codes remain unchanged', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  // 1. 401 Unauthorized
  const unauthReq = makeRequest({ programId: 'p1' })
  const unauthRes = await postHandler(unauthReq)
  assert.equal(unauthRes.status, 401)
  const unauthJson = await unauthRes.json()
  assert.equal(typeof unauthJson.error, 'string')

  // 2. 400 Bad Request (missing programId)
  const badReq = makeRequest({}, token)
  const badRes = await postHandler(badReq)
  assert.equal(badRes.status, 400)
  assert.deepEqual(await badRes.json(), { error: 'Program ID is required' })

  // 3. 404 No progress found
  const findOneNullMock = mock.method(UserProgress, 'findOne', async () => null)
  try {
    const notFoundReq = makeRequest({ programId: 'p1' }, token)
    const notFoundRes = await postHandler(notFoundReq)
    assert.equal(notFoundRes.status, 404)
    assert.deepEqual(await notFoundRes.json(), { error: 'No progress found' })
  } finally {
    findOneNullMock.mock.restore()
  }

  // 4. 404 Program not found in active programs
  const findOneNoProgMock = mock.method(UserProgress, 'findOne', async () => ({
    userId,
    activePrograms: [{ programId: 'other-prog' }],
  }))
  try {
    const progNotFoundReq = makeRequest({ programId: 'p1' }, token)
    const progNotFoundRes = await postHandler(progNotFoundReq)
    assert.equal(progNotFoundRes.status, 404)
    assert.deepEqual(await progNotFoundRes.json(), { error: 'Program not found in active programs' })
  } finally {
    findOneNoProgMock.mock.restore()
  }
})
