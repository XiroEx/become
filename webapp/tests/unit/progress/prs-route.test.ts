// Run with: npm run test:file tests/unit/progress/prs-route.test.ts

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
import { signToken } from '../../../lib/auth'

let patchHandler: any
let deleteHandler: any

before(async () => {
  const g = globalThis as any
  g.mongoose = g.mongoose || { conn: null, promise: null }
  g.mongoose.conn = { readyState: 1 }
  const mod = await import('../../../app/api/progress/prs/route')
  patchHandler = (mod as any).PATCH ?? (mod as any).default?.PATCH
  deleteHandler = (mod as any).DELETE ?? (mod as any).default?.DELETE
})

function makePatchRequest(body?: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/progress/prs', {
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeDeleteRequest(params?: string, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  const url = params ? `http://localhost/api/progress/prs?${params}` : 'http://localhost/api/progress/prs'
  return new NextRequest(url, {
    method: 'DELETE',
    headers,
  })
}

async function authedHeader(userId: string) {
  const token = await signToken({ userId, email: 'test@example.com' })
  return `Bearer ${token}`
}

test('(id: 9d6d2a0c) Whole-document progress.save() in DELETE handler is replaced with targeted $pull update', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const exerciseSlug = 'bench-press'

  let saveCalled = false
  const userProgressDoc: any = {
    userId,
    exercisePRs: [
      { exerciseSlug: 'bench-press', exerciseName: 'Bench Press', maxWeight: { weight: 225, reps: 5, date: new Date() } },
      { exerciseSlug: 'squat', exerciseName: 'Squat', maxWeight: { weight: 315, reps: 5, date: new Date() } },
    ],
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

  try {
    const req = makeDeleteRequest(`exerciseSlug=${exerciseSlug}`, token)
    const res = await deleteHandler(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.deepEqual(json, { success: true })

    assert.equal(saveCalled, false, 'progress.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1)
    assert.deepEqual(updateOneCalls[0].filter, { userId })
    assert.deepEqual(updateOneCalls[0].update, {
      $pull: { exercisePRs: { exerciseSlug } },
    })
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a0d) Whole-document progress.save() in PATCH handler is replaced with targeted update', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const exerciseSlug = 'bench-press'
  const recordDate = new Date('2026-03-01T12:00:00Z')

  let saveCalled = false
  const userProgressDoc: any = {
    userId,
    exercisePRs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        maxWeight: { weight: 225, reps: 5, date: recordDate },
        maxReps: { weight: 225, reps: 5, date: recordDate },
        maxE1RM: { weight: 225, reps: 5, date: recordDate, e1rm: 262 },
      },
    ],
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

  try {
    const req = makePatchRequest({ exerciseSlug, weight: 245, reps: 6 }, token)
    const res = await patchHandler(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.pr.exerciseSlug, 'bench-press')
    assert.equal(json.pr.weight, 245)
    assert.equal(json.pr.reps, 6)

    assert.equal(saveCalled, false, 'progress.save() must NOT be called')
    assert.equal(updateOneCalls.length, 1)
    assert.deepEqual(updateOneCalls[0].filter, { userId })
    assert.deepEqual(updateOneCalls[0].update, {
      $set: { exercisePRs: userProgressDoc.exercisePRs },
    })
    assert.equal(userProgressDoc.exercisePRs[0].maxWeight.weight, 245)
    assert.equal(userProgressDoc.exercisePRs[0].maxWeight.reps, 6)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a0e) Errors during UserProgress updates are logged to console.error', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)
  const exerciseSlug = 'bench-press'

  const userProgressDoc: any = {
    userId,
    exercisePRs: [
      { exerciseSlug: 'bench-press', exerciseName: 'Bench Press', maxWeight: { weight: 225, reps: 5, date: new Date() } },
    ],
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

  try {
    // 1. PATCH update error
    const patchReq = makePatchRequest({ exerciseSlug, weight: 235, reps: 5 }, token)
    const patchRes = await patchHandler(patchReq)
    assert.equal(patchRes.status, 500)
    const patchJson = await patchRes.json()
    assert.deepEqual(patchJson, { error: 'Internal server error' })

    const foundPatchErrorLog = loggedErrors.some((args) =>
      args.some((arg: any) =>
        typeof arg === 'string' && arg.includes('PATCH /api/progress/prs update error:')
      )
    )
    assert.ok(foundPatchErrorLog, 'console.error must log "PATCH /api/progress/prs update error:"')

    // 2. DELETE update error
    loggedErrors.length = 0
    const deleteReq = makeDeleteRequest(`exerciseSlug=${exerciseSlug}`, token)
    const deleteRes = await deleteHandler(deleteReq)
    assert.equal(deleteRes.status, 500)
    const deleteJson = await deleteRes.json()
    assert.deepEqual(deleteJson, { error: 'Internal server error' })

    const foundDeleteErrorLog = loggedErrors.some((args) =>
      args.some((arg: any) =>
        typeof arg === 'string' && arg.includes('DELETE /api/progress/prs update error:')
      )
    )
    assert.ok(foundDeleteErrorLog, 'console.error must log "DELETE /api/progress/prs update error:"')
  } finally {
    console.error = originalConsoleError
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
  }
})

test('(id: 9d6d2a10) Existing status codes and responses are preserved', async () => {
  const userId = new mongoose.Types.ObjectId().toString()
  const token = await authedHeader(userId)

  // PATCH 401 Unauthorized
  const patchUnauth = await patchHandler(makePatchRequest({ exerciseSlug: 'bench-press', weight: 100, reps: 5 }))
  assert.equal(patchUnauth.status, 401)
  assert.equal((await patchUnauth.json()).error, 'No token provided')

  // PATCH 400 Bad Request (missing exerciseSlug)
  const patchNoSlug = await patchHandler(makePatchRequest({ weight: 100, reps: 5 }, token))
  assert.equal(patchNoSlug.status, 400)
  assert.equal((await patchNoSlug.json()).error, 'A valid exercise is required')

  // PATCH 400 Bad Request (invalid weight)
  const patchBadWeight = await patchHandler(makePatchRequest({ exerciseSlug: 'squat', weight: -10, reps: 5 }, token))
  assert.equal(patchBadWeight.status, 400)

  // PATCH 400 Bad Request (invalid reps)
  const patchBadReps = await patchHandler(makePatchRequest({ exerciseSlug: 'squat', weight: 100, reps: 0 }, token))
  assert.equal(patchBadReps.status, 400)

  // PATCH 404 Not Found (user progress document not found)
  const findOneNullMock = mock.method(UserProgress, 'findOne', async () => null)
  try {
    const patchNotFound = await patchHandler(makePatchRequest({ exerciseSlug: 'squat', weight: 100, reps: 5 }, token))
    assert.equal(patchNotFound.status, 404)
    assert.equal((await patchNotFound.json()).error, 'Personal record not found')
  } finally {
    findOneNullMock.mock.restore()
  }

  // PATCH 404 Not Found (PR not found in exercisePRs)
  const findOneNoPrMock = mock.method(UserProgress, 'findOne', async () => ({
    userId,
    exercisePRs: [{ exerciseSlug: 'bench-press', maxWeight: { weight: 100, reps: 5 } }],
  }))
  try {
    const patchPrNotFound = await patchHandler(makePatchRequest({ exerciseSlug: 'deadlift', weight: 100, reps: 5 }, token))
    assert.equal(patchPrNotFound.status, 404)
    assert.equal((await patchPrNotFound.json()).error, 'Personal record not found')
  } finally {
    findOneNoPrMock.mock.restore()
  }

  // DELETE 401 Unauthorized
  const deleteUnauth = await deleteHandler(makeDeleteRequest('exerciseSlug=bench-press'))
  assert.equal(deleteUnauth.status, 401)
  assert.equal((await deleteUnauth.json()).error, 'No token provided')

  // DELETE 400 Bad Request (missing exerciseSlug)
  const deleteNoSlug = await deleteHandler(makeDeleteRequest('', token))
  assert.equal(deleteNoSlug.status, 400)
  assert.equal((await deleteNoSlug.json()).error, 'A valid exercise is required')

  // DELETE 404 Not Found (user progress document not found)
  const findOneNullDelete = mock.method(UserProgress, 'findOne', async () => null)
  try {
    const deleteNotFound = await deleteHandler(makeDeleteRequest('exerciseSlug=squat', token))
    assert.equal(deleteNotFound.status, 404)
    assert.equal((await deleteNotFound.json()).error, 'Personal record not found')
  } finally {
    findOneNullDelete.mock.restore()
  }

  // DELETE 404 Not Found (PR not found in exercisePRs)
  const findOneNoPrDelete = mock.method(UserProgress, 'findOne', async () => ({
    userId,
    exercisePRs: [{ exerciseSlug: 'bench-press', maxWeight: { weight: 100, reps: 5 } }],
  }))
  try {
    const deletePrNotFound = await deleteHandler(makeDeleteRequest('exerciseSlug=deadlift', token))
    assert.equal(deletePrNotFound.status, 404)
    assert.equal((await deletePrNotFound.json()).error, 'Personal record not found')
  } finally {
    findOneNoPrDelete.mock.restore()
  }
})
