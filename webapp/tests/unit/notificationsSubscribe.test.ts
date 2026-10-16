// Run with: npm run test:file tests/unit/notificationsSubscribe.test.ts

const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
g.mongoose = { conn: { readyState: 1 }, promise: null }
;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
process.env.JWT_SECRET ||= 'become-unit-test-secret'
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/become-test'

import { test, mock, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import UserProgress from '../../models/UserProgress'
import PushSubscription from '../../models/PushSubscription'
import { signToken } from '../../lib/auth'
import {
  NOTIFICATION_PREF_KEYS,
  DEFAULT_NOTIFICATION_PREFS,
  computeFreshEnablePrefUpdates,
  mergeWithNotificationDefaults,
} from '../../lib/push/notificationDefaults'

let subscribePost: (req: NextRequest) => Promise<Response>
let preferencesGet: (req: NextRequest) => Promise<Response>

before(async () => {
  const subMod = await import('../../app/api/notifications/subscribe/route')
  subscribePost = subMod.POST
  const prefMod = await import('../../app/api/notifications/preferences/route')
  preferencesGet = prefMod.GET
})

async function authedRequest(url: string, method: string, body?: unknown, userId?: string) {
  const uid = userId || new mongoose.Types.ObjectId().toString()
  const token = await signToken({ userId: uid, email: 'member@example.com' })
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return {
    req: new NextRequest(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    userId: uid,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (id: 9d6d2b58) Server default and client default agree
// ─────────────────────────────────────────────────────────────────────────────

test('(id: 9d6d2b58) Server defaults define all 10 keys: 9 nudges ON, dailyGlance OFF', () => {
  assert.equal(NOTIFICATION_PREF_KEYS.length, 10)
  assert.equal(DEFAULT_NOTIFICATION_PREFS.dailyGlance, false, 'dailyGlance must default OFF (opt-in)')

  const defaultOnKeys = NOTIFICATION_PREF_KEYS.filter((k) => k !== 'dailyGlance')
  assert.equal(defaultOnKeys.length, 9)
  for (const key of defaultOnKeys) {
    assert.equal(DEFAULT_NOTIFICATION_PREFS[key], true, `${key} must default ON`)
  }
})

test('(id: 9d6d2b58) mergeWithNotificationDefaults provides all defaults when existing prefs are empty or null', () => {
  const emptyMerged = mergeWithNotificationDefaults({})
  assert.deepEqual(emptyMerged, DEFAULT_NOTIFICATION_PREFS)

  const nullMerged = mergeWithNotificationDefaults(null)
  assert.deepEqual(nullMerged, DEFAULT_NOTIFICATION_PREFS)

  const undefMerged = mergeWithNotificationDefaults(undefined)
  assert.deepEqual(undefMerged, DEFAULT_NOTIFICATION_PREFS)
})

// ─────────────────────────────────────────────────────────────────────────────
// (id: 9d6d2b57) Fresh enable shows per-type prefs on by default (except dailyGlance)
// ─────────────────────────────────────────────────────────────────────────────

test('(id: 9d6d2b57) computeFreshEnablePrefUpdates sets all 9 nudges true and dailyGlance false for empty prefs', () => {
  const updates = computeFreshEnablePrefUpdates({})
  assert.equal(updates['notificationPrefs.dailyGlance'], false)
  assert.equal(updates['notificationPrefs.streakAtRisk'], true)
  assert.equal(updates['notificationPrefs.workoutReminder'], true)
  assert.equal(updates['notificationPrefs.mealReminder'], true)
  assert.equal(updates['notificationPrefs.reEngagement'], true)
  assert.equal(updates['notificationPrefs.chatMessage'], true)
  assert.equal(updates['notificationPrefs.mindReminder'], true)
  assert.equal(updates['notificationPrefs.goalNudge'], true)
  assert.equal(updates['notificationPrefs.superStreakAtRisk'], true)
  assert.equal(updates['notificationPrefs.checkInReminder'], true)
  assert.equal(Object.keys(updates).length, 10)
})

test('(id: 9d6d2b57) POST /api/notifications/subscribe initializes per-type defaults on fresh enable (reenable: true)', async () => {
  const rawToken = 'ab'.repeat(32)
  const { req, userId } = await authedRequest(
    'http://localhost/api/notifications/subscribe',
    'POST',
    { endpoint: rawToken, platform: 'ios', reenable: true },
  )

  let capturedProgressFilter: unknown = null
  let capturedProgressUpdate: unknown = null
  let capturedProgressOptions: unknown = null

  const findOneMock = mock.method(UserProgress, 'findOne', () => ({
    select: () => ({
      lean: async () => null, // Fresh user: no progress doc yet
    }),
  }))

  const updateOneMock = mock.method(UserProgress, 'updateOne', async (filter: unknown, update: unknown, opts: unknown) => {
    capturedProgressFilter = filter
    capturedProgressUpdate = update
    capturedProgressOptions = opts
    return { acknowledged: true }
  })

  const findOneAndUpdateSubMock = mock.method(PushSubscription, 'findOneAndUpdate', async () => ({ acknowledged: true }))

  try {
    const res = await subscribePost(req)
    assert.equal(res.status, 200)

    // Verify UserProgress update
    assert.deepEqual(capturedProgressFilter, { userId })
    assert.equal((capturedProgressOptions as { upsert?: boolean })?.upsert, true)

    const updateSet = (capturedProgressUpdate as { $set: Record<string, unknown> }).$set
    assert.equal(updateSet.notificationsEnabled, true)
    assert.equal(updateSet['notificationPrefs.dailyGlance'], false)
    assert.equal(updateSet['notificationPrefs.workoutReminder'], true)
    assert.equal(updateSet['notificationPrefs.streakAtRisk'], true)
    assert.equal(updateSet['notificationPrefs.mealReminder'], true)
    assert.equal(updateSet['notificationPrefs.reEngagement'], true)
    assert.equal(updateSet['notificationPrefs.chatMessage'], true)
    assert.equal(updateSet['notificationPrefs.mindReminder'], true)
    assert.equal(updateSet['notificationPrefs.goalNudge'], true)
    assert.equal(updateSet['notificationPrefs.superStreakAtRisk'], true)
    assert.equal(updateSet['notificationPrefs.checkInReminder'], true)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
    findOneAndUpdateSubMock.mock.restore()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// (id: 9d6d2b59) Existing explicit off choices are not overwritten
// ─────────────────────────────────────────────────────────────────────────────

test('(id: 9d6d2b59) computeFreshEnablePrefUpdates does NOT overwrite existing explicit false choices', () => {
  const existing = {
    workoutReminder: false,
    mealReminder: false,
    dailyGlance: true, // User previously opted in to dailyGlance
  }

  const updates = computeFreshEnablePrefUpdates(existing)

  // Explicit false choices must NOT be included in updates (not overwritten with true)
  assert.equal('notificationPrefs.workoutReminder' in updates, false)
  assert.equal('notificationPrefs.mealReminder' in updates, false)

  // Explicit true choice for dailyGlance must NOT be overwritten with false
  assert.equal('notificationPrefs.dailyGlance' in updates, false)

  // Missing keys must receive their defaults
  assert.equal(updates['notificationPrefs.streakAtRisk'], true)
  assert.equal(updates['notificationPrefs.reEngagement'], true)
  assert.equal(updates['notificationPrefs.chatMessage'], true)
  assert.equal(updates['notificationPrefs.mindReminder'], true)
  assert.equal(updates['notificationPrefs.goalNudge'], true)
  assert.equal(updates['notificationPrefs.superStreakAtRisk'], true)
  assert.equal(updates['notificationPrefs.checkInReminder'], true)
})

test('(id: 9d6d2b59) POST /api/notifications/subscribe preserves existing explicit false choices on reenable', async () => {
  const rawToken = 'cd'.repeat(32)
  const { req, userId } = await authedRequest(
    'http://localhost/api/notifications/subscribe',
    'POST',
    { endpoint: rawToken, platform: 'ios', reenable: true },
  )

  let capturedProgressUpdate: unknown = null

  // User already had workoutReminder explicitly turned off, and dailyGlance turned on
  const findOneMock = mock.method(UserProgress, 'findOne', () => ({
    select: () => ({
      lean: async () => ({
        notificationsEnabled: false,
        notificationPrefs: {
          workoutReminder: false,
          dailyGlance: true,
        },
      }),
    }),
  }))

  const updateOneMock = mock.method(UserProgress, 'updateOne', async (_filter: unknown, update: unknown) => {
    capturedProgressUpdate = update
    return { acknowledged: true }
  })

  const findOneAndUpdateSubMock = mock.method(PushSubscription, 'findOneAndUpdate', async () => ({ acknowledged: true }))

  try {
    const res = await subscribePost(req)
    assert.equal(res.status, 200)

    const updateSet = (capturedProgressUpdate as { $set: Record<string, unknown> }).$set
    assert.equal(updateSet.notificationsEnabled, true)

    // workoutReminder was explicitly false: must NOT be set to true
    assert.equal('notificationPrefs.workoutReminder' in updateSet, false)

    // dailyGlance was explicitly true: must NOT be set to false
    assert.equal('notificationPrefs.dailyGlance' in updateSet, false)

    // Missing keys are set to default ON
    assert.equal(updateSet['notificationPrefs.streakAtRisk'], true)
    assert.equal(updateSet['notificationPrefs.mealReminder'], true)
    assert.equal(updateSet['notificationPrefs.reEngagement'], true)
  } finally {
    findOneMock.mock.restore()
    updateOneMock.mock.restore()
    findOneAndUpdateSubMock.mock.restore()
  }
})

test('(id: 9d6d2b59) mergeWithNotificationDefaults preserves explicit false and explicit true', () => {
  const existing = {
    workoutReminder: false,
    dailyGlance: true,
  }
  const merged = mergeWithNotificationDefaults(existing)
  assert.equal(merged.workoutReminder, false, 'explicit false must be preserved')
  assert.equal(merged.dailyGlance, true, 'explicit true must be preserved')
  assert.equal(merged.streakAtRisk, true, 'missing key defaults ON')
  assert.equal(merged.checkInReminder, true, 'missing key defaults ON')
})
