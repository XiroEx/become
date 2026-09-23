// Run with: npm run test:file tests/unit/account/deletion.test.ts
//
// The parts of account deletion that need no database: the undo token, the
// arithmetic of the grace window, and the PLAN — the declarative list of what a
// deletion removes and what it merely detaches.
//
// The plan is the thing most worth pinning. A collection that is forgotten is
// invisible: the sweep reports a cheerful zero and the member's journal is
// still on disk a year later. So this asserts the collections that must be in
// it by name, asserts that every "detach" says WHY it is not a delete, and
// drives the whole routine against recording fakes so the order, the filters
// and the failure behaviour are all observable without Mongo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_RESTORE_PATH,
  DELETION_REQUEST_PATH,
  buildRestoreUrl,
  daysRemaining,
  deletionStatus,
  isDeletionSource,
  isPurgeDue,
  purgeDueAt,
} from '../../../lib/accountDeletion'
import { restoreToken, verifyRestoreToken } from '../../../lib/accountRestoreToken'
import {
  PURGE_TARGETS,
  purgeUserAccount,
  type PurgeTarget,
  type PurgeableCollection,
} from '../../../lib/accountPurge'

const SECRET = 'unit-test-secret'
const USER = '68f0000000000000000000aa'

// ─── The undo token ──────────────────────────────────────────────────────────

test('the restore token round-trips, and only for the request it was minted for', () => {
  const requestedAt = new Date('2026-09-20T10:00:00.000Z')
  const token = restoreToken(USER, requestedAt, SECRET)

  assert.match(token, /^[0-9a-f]{32}$/, 'the token must be 32 hex chars')
  assert.equal(verifyRestoreToken(USER, requestedAt, token, SECRET), true)
  // Case is not significance — a mail client may upper-case a URL.
  assert.equal(verifyRestoreToken(USER, requestedAt, token.toUpperCase(), SECRET), true)
})

test('a tampered token, user, timestamp or secret all fail closed', () => {
  const requestedAt = new Date('2026-09-20T10:00:00.000Z')
  const token = restoreToken(USER, requestedAt, SECRET)

  // Flip one nibble, keeping the length and the alphabet valid.
  const flipped = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
  assert.equal(verifyRestoreToken(USER, requestedAt, flipped, SECRET), false)
  assert.equal(verifyRestoreToken('68f0000000000000000000bb', requestedAt, token, SECRET), false)
  assert.equal(verifyRestoreToken(USER, new Date('2026-09-20T10:00:01.000Z'), token, SECRET), false)
  assert.equal(verifyRestoreToken(USER, requestedAt, token, 'another-secret'), false)
})

test('a missing, short or non-hex token is refused rather than thrown at', () => {
  const requestedAt = new Date('2026-09-20T10:00:00.000Z')
  // timingSafeEqual THROWS on a length mismatch, so the length check has to
  // come first. A 500 here would be a deletion nobody can undo.
  assert.equal(verifyRestoreToken(USER, requestedAt, '', SECRET), false)
  assert.equal(verifyRestoreToken(USER, requestedAt, 'abc', SECRET), false)
  assert.equal(verifyRestoreToken(USER, requestedAt, 'z'.repeat(32), SECRET), false)
  assert.equal(verifyRestoreToken(USER, null, 'a'.repeat(32), SECRET), false)
  assert.equal(verifyRestoreToken('', requestedAt, 'a'.repeat(32), SECRET), false)
})

test('the restore URL carries both parameters and nothing else', () => {
  const token = restoreToken(USER, new Date(), SECRET)
  const url = new URL(buildRestoreUrl('https://become.redbtn.io', USER, token))
  assert.equal(url.pathname, ACCOUNT_RESTORE_PATH)
  assert.equal(url.searchParams.get('u'), USER)
  assert.equal(url.searchParams.get('t'), token)
  assert.equal([...url.searchParams.keys()].length, 2)

  // A base with a trailing slash must not produce a doubled one.
  assert.equal(
    new URL(buildRestoreUrl('https://become.redbtn.io/', USER, token)).pathname,
    ACCOUNT_RESTORE_PATH,
  )
})

// ─── The window ──────────────────────────────────────────────────────────────

test('the grace window is seven days, and the purge date is derived from it', () => {
  assert.equal(ACCOUNT_DELETION_GRACE_DAYS, 7)
  const requestedAt = new Date('2026-09-20T10:00:00.000Z')
  assert.equal(purgeDueAt(requestedAt).toISOString(), '2026-09-27T10:00:00.000Z')
})

test('days remaining is whole days, floored at zero, and never negative', () => {
  const due = new Date('2026-09-27T10:00:00.000Z')
  assert.equal(daysRemaining(due, new Date('2026-09-20T10:00:00.000Z')), 7)
  assert.equal(daysRemaining(due, new Date('2026-09-26T22:00:00.000Z')), 1)
  assert.equal(daysRemaining(due, new Date('2026-09-27T10:00:00.000Z')), 0)
  assert.equal(daysRemaining(due, new Date('2026-10-05T10:00:00.000Z')), 0)
})

test('a purge is due at the instant the window closes, not a moment before', () => {
  const pending = { scheduledPurgeAt: new Date('2026-09-27T10:00:00.000Z') }
  assert.equal(isPurgeDue(pending, new Date('2026-09-27T09:59:59.999Z')), false)
  assert.equal(isPurgeDue(pending, new Date('2026-09-27T10:00:00.000Z')), true)
  assert.equal(isPurgeDue(pending, new Date('2026-09-28T00:00:00.000Z')), true)
})

test('the wire status is ISO strings, so it survives JSON both ways', () => {
  const requestedAt = new Date('2026-09-20T10:00:00.000Z')
  const status = deletionStatus(
    { requestedAt, scheduledPurgeAt: purgeDueAt(requestedAt), source: 'ios' },
    new Date('2026-09-22T10:00:00.000Z'),
  )
  assert.equal(status.requestedAt, '2026-09-20T10:00:00.000Z')
  assert.equal(status.scheduledPurgeAt, '2026-09-27T10:00:00.000Z')
  assert.equal(status.source, 'ios')
  assert.equal(status.daysRemaining, 5)
  assert.deepEqual(JSON.parse(JSON.stringify(status)), status)
})

test('the source label is validated, and an unknown one is simply not a source', () => {
  assert.equal(isDeletionSource('ios'), true)
  assert.equal(isDeletionSource('android'), true)
  assert.equal(isDeletionSource('web'), true)
  assert.equal(isDeletionSource('macos'), false)
  assert.equal(isDeletionSource(undefined), false)
  assert.equal(isDeletionSource(7), false)
})

test('the public request path is the one the legal copy points at', () => {
  assert.equal(DELETION_REQUEST_PATH, '/delete-account')
})

// ─── The plan ────────────────────────────────────────────────────────────────

test('every collection that holds a member\'s own record is in the plan', () => {
  const byName = new Map(PURGE_TARGETS.map((t) => [t.name, t] as const))

  // Not an exhaustive list of the schema — an exhaustive list would have to be
  // edited for every new collection and would therefore be edited carelessly.
  // These are the ones whose omission would be a broken promise to a member.
  const mustDelete = [
    'UserProgress', 'Schedule', 'Goal', 'NutritionGoal', 'DayNutrition',
    'MealLog', 'MealPlan', 'PlateScan', 'Meal', 'Recipe',
    'MindProgress', 'MindSession', 'MindJournal', 'Journal', 'Meditation',
    'StateLog', 'Sleep', 'DailyWin', 'IdentityProfile', 'Mission',
    'Message', 'Conversation', 'Share', 'SharedSession',
    'PushSubscription', 'Feedback', 'TutorialProgress', 'AiRun',
  ]
  for (const name of mustDelete) {
    const target = byName.get(name)
    assert.ok(target, `${name} is not in the purge plan at all`)
    assert.equal(target.action, 'delete', `${name} must be deleted, not detached`)
  }
})

test('the shared catalogue is detached, not deleted, and says why', () => {
  const byName = new Map(PURGE_TARGETS.map((t) => [t.name, t] as const))
  for (const name of ['Food', 'Exercise', 'ExerciseVideo', 'Program']) {
    const target = byName.get(name)
    assert.ok(target, `${name} is missing from the purge plan`)
    assert.equal(
      target.action,
      'detach',
      `${name} is referenced by other members' data and must not be deleted`,
    )
  }
  // Every detach is a judgement call, so every detach has to justify itself.
  for (const target of PURGE_TARGETS) {
    if (target.action !== 'detach') continue
    assert.ok(
      target.because && target.because.length > 10,
      `${target.name}: a detach with no stated reason is a deletion somebody forgot`,
    )
  }
})

test('the plan has no duplicate entries and every id type is declared', () => {
  const seen = new Set<string>()
  for (const target of PURGE_TARGETS) {
    const key = `${target.name}.${target.field}`
    assert.equal(seen.has(key), false, `${key} appears twice in the plan`)
    seen.add(key)
    assert.ok(
      target.idType === 'objectId' || target.idType === 'string',
      `${target.name}: idType must be declared — the wrong type matches nothing`,
    )
  }
})

// ─── The routine, against recording fakes ────────────────────────────────────

interface Call {
  name: string
  kind: 'deleteMany' | 'updateMany'
  filter: Record<string, unknown>
  update?: Record<string, unknown>
}

function fake(
  name: string,
  calls: Call[],
  opts: { deleted?: number; modified?: number; throws?: boolean } = {},
): PurgeableCollection {
  return {
    deleteMany(filter) {
      if (opts.throws) return Promise.reject(new Error(`${name} exploded`))
      calls.push({ name, kind: 'deleteMany', filter })
      return Promise.resolve({ deletedCount: opts.deleted ?? 1 })
    },
    updateMany(filter, update) {
      if (opts.throws) return Promise.reject(new Error(`${name} exploded`))
      calls.push({ name, kind: 'updateMany', filter, update })
      return Promise.resolve({ modifiedCount: opts.modified ?? 1 })
    },
  }
}

test('a delete target is filtered by the right field and the right id TYPE', async () => {
  const calls: Call[] = []
  const targets: PurgeTarget[] = [
    { name: 'UserProgress', field: 'userId', idType: 'objectId', action: 'delete', collection: fake('UserProgress', calls, { deleted: 1 }) },
    { name: 'MealLog', field: 'user', idType: 'objectId', action: 'delete', collection: fake('MealLog', calls, { deleted: 3 }) },
    { name: 'AiRun', field: 'userId', idType: 'string', action: 'delete', collection: fake('AiRun', calls, { deleted: 2 }) },
  ]
  const report = await purgeUserAccount(USER, { targets, deleteUser: false })

  assert.equal(report.deleted, 6)
  assert.equal(report.failures.length, 0)

  const progress = calls.find((c) => c.name === 'UserProgress')!
  assert.ok(progress.filter.userId instanceof mongoose.Types.ObjectId)
  assert.equal(String(progress.filter.userId), USER)

  const mealLog = calls.find((c) => c.name === 'MealLog')!
  assert.ok('user' in mealLog.filter, 'MealLog is keyed by `user`, not `userId`')

  // A hex STRING here, not an ObjectId: AiRun stores it as a string, and an
  // ObjectId filter would match nothing and report a cheerful zero.
  const aiRun = calls.find((c) => c.name === 'AiRun')!
  assert.equal(aiRun.filter.userId, USER)
  assert.equal(typeof aiRun.filter.userId, 'string')
})

test('a detach clears the owner field instead of removing the row', async () => {
  const calls: Call[] = []
  const targets: PurgeTarget[] = [
    {
      name: 'Food', field: 'createdBy', idType: 'objectId', action: 'detach',
      collection: fake('Food', calls, { modified: 4 }),
      because: 'other members reference these',
    },
  ]
  const report = await purgeUserAccount(USER, { targets, deleteUser: false })

  assert.equal(report.detached, 4)
  assert.equal(report.deleted, 0)
  const call = calls[0]!
  assert.equal(call.kind, 'updateMany')
  assert.deepEqual(call.update, { $set: { createdBy: null } })
})

test('sign-in links are cleared by EMAIL, because MagicLink has no userId', async () => {
  const calls: Call[] = []
  const report = await purgeUserAccount(USER, {
    targets: [],
    deleteUser: false,
    email: 'Someone@Example.COM',
    magicLinkCollection: fake('MagicLink', calls, { deleted: 2 }),
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]!.filter, { email: 'someone@example.com' })
  assert.equal(report.deleted, 2)
})

test('the account row is deleted LAST, and only when nothing else failed', async () => {
  const calls: Call[] = []
  const users = fake('User', calls, { deleted: 1 })
  const targets: PurgeTarget[] = [
    { name: 'UserProgress', field: 'userId', idType: 'objectId', action: 'delete', collection: fake('UserProgress', calls) },
  ]
  const report = await purgeUserAccount(USER, { targets, userCollection: users })

  assert.equal(report.userDeleted, true)
  assert.equal(calls.at(-1)!.name, 'User', 'the account row must go last')
})

test('one collection throwing does not stop the rest, and SPARES the account row', async () => {
  // This is the behaviour that makes a partial purge retryable: leave the
  // account marked, and the next sweep picks it up again. Deleting the user
  // row after a failure would strand the leftover data with no key to find it.
  const calls: Call[] = []
  const users = fake('User', calls, { deleted: 1 })
  const targets: PurgeTarget[] = [
    { name: 'Journal', field: 'userId', idType: 'objectId', action: 'delete', collection: fake('Journal', calls, { throws: true }) },
    { name: 'Sleep', field: 'userId', idType: 'objectId', action: 'delete', collection: fake('Sleep', calls, { deleted: 5 }) },
  ]
  const report = await purgeUserAccount(USER, { targets, userCollection: users })

  assert.deepEqual(report.failures, ['Journal'])
  assert.equal(report.deleted, 5, 'the collection after the failure still ran')
  assert.equal(report.userDeleted, false, 'the account row must survive a partial purge')
  assert.equal(calls.some((c) => c.name === 'User'), false)

  const journal = report.outcomes.find((o) => o.name === 'Journal')!
  assert.match(String(journal.error), /exploded/)
})

test('push subscriptions are in the plan even though the request already dropped them', async () => {
  // Belt and braces: a device that was offline when the deletion was requested
  // can register a token days later. The purge has to catch that.
  const target = PURGE_TARGETS.find((t) => t.name === 'PushSubscription')
  assert.ok(target, 'the purge plan does not clear push subscriptions')
  assert.equal(target.action, 'delete')
  assert.equal(target.field, 'userId')
})
