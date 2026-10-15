// Run with: npm run test:file tests/unit/progress-faults.test.ts
//
// Tests for POST /api/progress and GET /api/progress self-heal:
// 1. Repo grep establishes nobody calls POST /api/progress with weight; weight case deleted.
// 2. POST /api/progress no longer calls progress.save(); issues targeted updateOne per case.
// 3. GET /api/progress awaits self-heal UserProgress.updateOne and keeps .catch(() => {}).
// 4. POST /api/progress returns 400 for 'weight' or unknown update types.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { signToken } from '../../lib/auth'
import UserProgress from '../../models/UserProgress'

// Stub mongoose connection in unit test so dbConnect() returns immediately
// without timing out on loopback mongodb
global.mongoose = { conn: mongoose, promise: Promise.resolve(mongoose) }

const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'progress', 'route.ts')
const routeSrc = fs.readFileSync(routePath, 'utf8')

test('source guard: GET self-heal updateOne is awaited and retains .catch', () => {
  // Must have 'await UserProgress.updateOne'
  assert.ok(
    routeSrc.includes("await UserProgress.updateOne(\n            { userId: authResult.userId, 'activePrograms.programId': cp.programId }"),
    'Self-heal UserProgress.updateOne in GET must be awaited',
  )
  // Must retain .catch(() => {})
  assert.ok(
    routeSrc.includes(").catch(() => {})"),
    'Self-heal updateOne must retain .catch(() => {}) to avoid failing the response',
  )
})

test('source guard: progress.save() is completely eliminated', () => {
  assert.ok(
    !routeSrc.includes('await progress.save()') && !routeSrc.includes('.save()'),
    'route.ts must not call .save() (whole-document validation trap)',
  )
})

test('source guard: weight case is removed from POST /api/progress', () => {
  assert.ok(
    !routeSrc.includes("case 'weight':"),
    "POST /api/progress must not have case 'weight':",
  )
})

test('source guard: workout and program cases use targeted updateOne', () => {
  // Workout case targeted update
  assert.ok(
    routeSrc.includes("$push: { workoutLogs: data }") && routeSrc.includes("$inc: { totalWorkouts: 1 }"),
    'case workout must use targeted updateOne pushing to workoutLogs and incrementing totalWorkouts',
  )
  // Program case targeted update
  assert.ok(
    routeSrc.includes("$set: { currentProgram: data }"),
    'case program must use targeted updateOne setting currentProgram',
  )
})

test('POST /api/progress rejects unauthenticated requests with 401', async () => {
  const { POST } = await import('../../app/api/progress/route')
  const req = new NextRequest('http://localhost/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'workout', data: {} }),
  })
  const res = await POST(req)
  assert.equal(res.status, 401)
})

test('POST /api/progress rejects weight update type with 400', async () => {
  const origFindOne = UserProgress.findOne
  ;(UserProgress as unknown as Record<string, unknown>).findOne = () => ({ _id: 'fake_progress_id' })

  try {
    const { POST } = await import('../../app/api/progress/route')
    const token = await signToken({ userId: 'u_test_progress', email: 'test@example.com' })
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type: 'weight', data: { weight: 150 } }),
    })
    const res = await POST(req)
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.error, 'Invalid update type')
  } finally {
    UserProgress.findOne = origFindOne
  }
})

test('POST /api/progress rejects invalid update type with 400', async () => {
  const origFindOne = UserProgress.findOne
  ;(UserProgress as unknown as Record<string, unknown>).findOne = () => ({ _id: 'fake_progress_id' })

  try {
    const { POST } = await import('../../app/api/progress/route')
    const token = await signToken({ userId: 'u_test_progress', email: 'test@example.com' })
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type: 'invalid_type', data: {} }),
    })
    const res = await POST(req)
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.error, 'Invalid update type')
  } finally {
    UserProgress.findOne = origFindOne
  }
})

test('POST /api/progress issues targeted updateOne for workout', async () => {
  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne
  let updateOneCall: { filter: unknown; update: unknown } | null = null

  ;(UserProgress as unknown as Record<string, unknown>).findOne = () => ({ _id: 'progress_doc_123' })
  ;(UserProgress as unknown as Record<string, unknown>).updateOne = (filter: unknown, update: unknown) => {
    updateOneCall = { filter, update }
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 })
  }

  try {
    const { POST } = await import('../../app/api/progress/route')
    const token = await signToken({ userId: 'u_test_progress', email: 'test@example.com' })
    const workoutData = { day: 'Day 1', completed: true, date: new Date().toISOString() }
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type: 'workout', data: workoutData }),
    })
    const res = await POST(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.deepEqual(updateOneCall, {
      filter: { _id: 'progress_doc_123' },
      update: {
        $push: { workoutLogs: workoutData },
        $inc: { totalWorkouts: 1 },
      },
    })
  } finally {
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
  }
})

test('POST /api/progress issues targeted updateOne for program', async () => {
  const origFindOne = UserProgress.findOne
  const origUpdateOne = UserProgress.updateOne
  let updateOneCall: { filter: unknown; update: unknown } | null = null

  ;(UserProgress as unknown as Record<string, unknown>).findOne = () => ({ _id: 'progress_doc_456' })
  ;(UserProgress as unknown as Record<string, unknown>).updateOne = (filter: unknown, update: unknown) => {
    updateOneCall = { filter, update }
    return Promise.resolve({ acknowledged: true, modifiedCount: 1 })
  }

  try {
    const { POST } = await import('../../app/api/progress/route')
    const token = await signToken({ userId: 'u_test_progress', email: 'test@example.com' })
    const programData = { programId: 'prog_789', status: 'in-progress' }
    const req = new NextRequest('http://localhost/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type: 'program', data: programData }),
    })
    const res = await POST(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.deepEqual(updateOneCall, {
      filter: { _id: 'progress_doc_456' },
      update: {
        $set: { currentProgram: programData },
      },
    })
  } finally {
    UserProgress.findOne = origFindOne
    UserProgress.updateOne = origUpdateOne
  }
})
