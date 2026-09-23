// Run with: npm run test:file tests/unit/account/deletionRoutes.test.ts
//
// The two routes an App Store reviewer and a supervisory authority both care
// about, driven against the real (loopback, disposable) test database:
//
//   DELETE /api/me/account          — request deletion
//   POST   /api/me/account/restore  — undo it from the emailed link
//
// The assertions that matter are not "it returned 200". They are:
//   · the NATIVE push token is dropped at REQUEST time, in the same breath as
//     the web subscription — one collection holds both, and the card's
//     acceptance criterion is specifically about the native one;
//   · the response tells the client to sign out, because a JWT cannot be
//     revoked server-side and the device forgetting it is the whole mechanism;
//   · the undo link works with NO session, which is the only way it can work
//     for somebody the deletion just signed out;
//   · a forged or stale undo link does nothing at all.
//
// The confirmation email cannot be sent from a test — there are no SMTP
// credentials — and the route is written so that does not matter: the send is
// best-effort, so `restoreEmailSent` comes back false and the deletion still
// happens. A deletion that fails because SMTP is down would be a deletion a
// member cannot make, which is the exact failure the store guideline exists to
// prevent.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { DELETE, GET, POST as CANCEL } from '../../../app/api/me/account/route'
import { POST as RESTORE } from '../../../app/api/me/account/restore/route'
import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import PushSubscription from '../../../models/PushSubscription'
import { signToken } from '../../../lib/auth'
import { getRuntimeConfig } from '../../../lib/runtimeConfig'
import { restoreToken } from '../../../lib/accountRestoreToken'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../../../lib/accountDeletion'

const DOMAIN = 'deletion-routes.test'

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
})

after(async () => {
  const emails = new RegExp(`@${DOMAIN}$`)
  const ids = (await User.find({ email: emails }).select('_id').lean<{ _id: unknown }[]>())
    .map((u) => u._id)
  await PushSubscription.deleteMany({ userId: { $in: ids } })
  await UserProgress.deleteMany({ userId: { $in: ids } })
  await User.deleteMany({ email: emails })
  await mongoose.disconnect()
})

const freshEmail = () => `d${Date.now()}${Math.random().toString(36).slice(2, 8)}@${DOMAIN}`

/** A member with a browser subscription and BOTH native push tokens. */
async function seedMember() {
  const email = freshEmail()
  const user = await User.create({ email, password: 'not-a-real-password', name: 'Test Member' })
  const userId = String(user._id)
  const suffix = userId.slice(-6) + Math.random().toString(36).slice(2, 8)

  await UserProgress.create({ userId: user._id, notificationsEnabled: true })
  await PushSubscription.create([
    {
      userId: user._id,
      platform: 'web',
      endpoint: `https://push.test/web-${suffix}`,
      keys: { p256dh: 'p', auth: 'a' },
    },
    { userId: user._id, platform: 'ios', endpoint: `ExponentPushToken[ios-${suffix}]` },
    { userId: user._id, platform: 'android', endpoint: `ExponentPushToken[and-${suffix}]` },
  ])

  const token = await signToken({ userId, email })
  return { user, userId, email, token }
}

function authed(method: string, body?: unknown, token?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/me/account', {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function anonymous(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/me/account/restore', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
}

// ─── Requesting it ───────────────────────────────────────────────────────────

test('a signed-in member can delete their own account, and is told when it happens', async () => {
  const { userId, token } = await seedMember()

  const res = await DELETE(authed('DELETE', { source: 'ios' }, token))
  assert.equal(res.status, 200)
  const body = await res.json()

  assert.ok(body.deletion, 'the response carries no deletion')
  assert.equal(body.graceDays, ACCOUNT_DELETION_GRACE_DAYS)
  assert.equal(body.signOut, true, 'the client is not told to drop its token')

  const requested = new Date(body.deletion.requestedAt)
  const due = new Date(body.deletion.scheduledPurgeAt)
  const days = Math.round((due.getTime() - requested.getTime()) / 86_400_000)
  assert.equal(days, ACCOUNT_DELETION_GRACE_DAYS)

  const row = await User.findById(userId).select('deletion').lean<{ deletion?: { source?: string } } | null>()
  assert.ok(row, 'the user row vanished')
  assert.ok(row.deletion, 'nothing was recorded on the user')
  assert.equal(row.deletion.source, 'ios', 'the requesting platform was not recorded')
})

test('THE NATIVE PUSH TOKEN IS DROPPED AT REQUEST TIME, with the web one', async () => {
  const { userId, token } = await seedMember()
  assert.equal(await PushSubscription.countDocuments({ userId }), 3)

  const res = await DELETE(authed('DELETE', { source: 'android' }, token))
  const body = await res.json()

  assert.equal(body.pushSubscriptionsDropped, 3)
  assert.equal(
    await PushSubscription.countDocuments({ userId }),
    0,
    'a push subscription survived the request — the device would keep being notified',
  )

  // And the master switch is off, so the background resync on a device that was
  // offline at this moment cannot quietly mint a replacement.
  const progress = await UserProgress.findOne({ userId }).select('notificationsEnabled').lean<{ notificationsEnabled?: boolean } | null>()
  assert.equal(progress?.notificationsEnabled, false)
})

test('the request is idempotent: a second tap does not move the date', async () => {
  const { token } = await seedMember()

  const first = await (await DELETE(authed('DELETE', { source: 'web' }, token))).json()
  const second = await (await DELETE(authed('DELETE', { source: 'web' }, token))).json()

  assert.equal(second.deletion.requestedAt, first.deletion.requestedAt)
  assert.equal(second.deletion.scheduledPurgeAt, first.deletion.scheduledPurgeAt)
})

test('an unknown source is recorded as web rather than refusing the deletion', async () => {
  const { userId, token } = await seedMember()
  const res = await DELETE(authed('DELETE', { source: 'palmos' }, token))
  assert.equal(res.status, 200, 'a store build must not fail a deletion over a label')
  const row = await User.findById(userId).select('deletion').lean<{ deletion?: { source?: string } } | null>()
  assert.equal(row?.deletion?.source, 'web')
})

test('deletion needs a session — no token, no deletion', async () => {
  const res = await DELETE(authed('DELETE', { source: 'web' }))
  assert.equal(res.status, 401)
})

test('GET reports the pending deletion, and reports nothing when there is none', async () => {
  const { token } = await seedMember()

  const before = await (await GET(authed('GET', undefined, token))).json()
  assert.equal(before.deletion, null)
  assert.equal(before.graceDays, ACCOUNT_DELETION_GRACE_DAYS)

  await DELETE(authed('DELETE', { source: 'web' }, token))

  const after = await (await GET(authed('GET', undefined, token))).json()
  assert.ok(after.deletion)
  assert.equal(after.deletion.daysRemaining, ACCOUNT_DELETION_GRACE_DAYS)
})

// ─── Undoing it ──────────────────────────────────────────────────────────────

async function restoreLinkFor(userId: string): Promise<string> {
  const row = await User.findById(userId).select('deletion').lean<{ deletion?: { requestedAt?: Date } } | null>()
  assert.ok(row, 'the user row vanished')
  assert.ok(row.deletion, 'no deletion is pending, so no link exists')
  assert.ok(row.deletion.requestedAt, 'the pending deletion has no timestamp to bind to')
  const { auth } = await getRuntimeConfig()
  return restoreToken(userId, new Date(row.deletion.requestedAt), auth.jwtSecret)
}

test('the undo link works with NO session at all', async () => {
  const { userId, token } = await seedMember()
  await DELETE(authed('DELETE', { source: 'ios' }, token))

  const t = await restoreLinkFor(userId)
  const res = await RESTORE(anonymous({ u: userId, t }))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).restored, true)

  const row = await User.findById(userId).select('deletion').lean<{ deletion?: unknown } | null>()
  assert.equal(row?.deletion, undefined, 'the pending deletion was not cleared')
})

test('a link minted for an earlier request stops working once it is undone', async () => {
  const { userId, token } = await seedMember()
  await DELETE(authed('DELETE', { source: 'web' }, token))
  const t = await restoreLinkFor(userId)

  assert.equal((await (await RESTORE(anonymous({ u: userId, t }))).json()).restored, true)

  // Same link, second use: there is nothing pending any more.
  const again = await RESTORE(anonymous({ u: userId, t }))
  assert.equal(again.status, 404)
  assert.equal((await again.json()).reason, 'nothing_pending')
})

test('a forged link restores nothing', async () => {
  const { userId, token } = await seedMember()
  await DELETE(authed('DELETE', { source: 'web' }, token))

  const res = await RESTORE(anonymous({ u: userId, t: 'f'.repeat(32) }))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).reason, 'invalid_link')

  const row = await User.findById(userId).select('deletion').lean<{ deletion?: unknown } | null>()
  assert.ok(row, 'the user row vanished')
  assert.ok(row.deletion, 'a forged link cancelled a real deletion')
})

test('a malformed user id is refused without touching the database', async () => {
  const res = await RESTORE(anonymous({ u: 'not-an-object-id', t: 'a'.repeat(32) }))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).reason, 'invalid_link')
})

test('a member who signs back in can cancel it from Settings', async () => {
  const { userId, token } = await seedMember()
  await DELETE(authed('DELETE', { source: 'android' }, token))

  const res = await CANCEL(authed('POST', { intent: 'cancel' }, token))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).restored, true)

  const row = await User.findById(userId).select('deletion').lean<{ deletion?: unknown } | null>()
  assert.equal(row?.deletion, undefined)
})

test('the cancel endpoint refuses anything that is not an explicit cancel', async () => {
  const { token } = await seedMember()
  const res = await CANCEL(authed('POST', { intent: 'something-else' }, token))
  assert.equal(res.status, 400)
})
