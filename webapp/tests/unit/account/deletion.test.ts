// Run with: npm run test:file tests/unit/account/deletion.test.ts
//
// Account deletion, the pure half: the window, the restore MAC, and the purge
// plan. Everything here runs without MongoDB — the purge is driven against
// fake models that record what they were asked to do, which is also the only
// way to assert "a detach never becomes a delete" without deleting anything.
//
// What this file is really defending:
//
//   1. THE PURGE COVERS EVERY COLLECTION THAT NAMES A MEMBER. It walks
//      `models/` and fails when a model is neither in the plan nor explicitly
//      exempted with a reason. A collection added next month cannot quietly
//      start surviving deletion — which is the failure mode nobody notices
//      until a regulator asks.
//   2. A RESTORE LINK IS BOUND TO ONE REQUEST. Cancel the deletion, or make a
//      new one, and every link minted for the old one is dead.
//   3. THE DATES CANNOT DRIFT. The purge lands inside the window the Privacy
//      Policy promises.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  DELETE_CONFIRMATION,
  DELETION_COVERS,
  DELETION_EXCEPTIONS,
  RESTORE_WINDOW_DAYS,
  deletionStatus,
  isPurgeDue,
  normalizeSource,
  planDeletion,
  purgeSelector,
} from '../../../lib/accountDeletion'
import {
  PURGE_CASCADES,
  PURGE_EXEMPT,
  PURGE_PLAN,
  purgeAccountData,
  type PurgeableModel,
} from '../../../lib/accountPurge'
import {
  buildRestoreUrl,
  restoreToken,
  verifyRestoreToken,
  RESTORE_PATH,
} from '../../../lib/accountRestoreToken'
import { LEGAL_DELETION_DAYS } from '../../../lib/legal'

const ROOT = path.join(__dirname, '../../..')
const DAY_MS = 24 * 60 * 60 * 1000

// ─── 1. The window ───────────────────────────────────────────────────────────

test('a request schedules the purge inside the window the policy promises', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')
  const plan = planDeletion(now, 'ios')

  assert.equal(plan.requestedAt.toISOString(), now.toISOString())
  assert.equal(plan.purgeAfter.getTime() - now.getTime(), RESTORE_WINDOW_DAYS * DAY_MS)
  assert.equal(plan.requestedFrom, 'ios')

  // The whole reason both numbers exist: 7 is what happens, 30 is what was
  // promised. Reversing them would make the Privacy Policy false.
  assert.ok(
    RESTORE_WINDOW_DAYS < LEGAL_DELETION_DAYS,
    'the purge must land inside the deletion window the Privacy Policy commits to',
  )
})

test('an unknown source is recorded as unknown rather than trusted', () => {
  assert.equal(normalizeSource('android'), 'android')
  assert.equal(normalizeSource('web'), 'web')
  assert.equal(normalizeSource('{"$ne":null}'), 'unknown')
  assert.equal(normalizeSource(undefined), 'unknown')
  assert.equal(normalizeSource(42), 'unknown')
})

test('status counts down in whole days and never goes negative', () => {
  const requestedAt = new Date('2026-09-24T12:00:00.000Z')
  const plan = planDeletion(requestedAt)

  const fresh = deletionStatus(plan, requestedAt)
  assert.equal(fresh.pending, true)
  assert.equal(fresh.daysLeft, RESTORE_WINDOW_DAYS)
  assert.equal(fresh.restorableUntil, plan.purgeAfter.toISOString())

  const nearlyOver = deletionStatus(plan, new Date(plan.purgeAfter.getTime() - 1000))
  assert.equal(nearlyOver.daysLeft, 0, 'part of a day is not a day')

  const past = deletionStatus(plan, new Date(plan.purgeAfter.getTime() + 5 * DAY_MS))
  assert.equal(past.daysLeft, 0, 'a countdown must never go negative')

  const none = deletionStatus(null)
  assert.equal(none.pending, false)
  assert.equal(none.restorableUntil, null)
})

test('the purge is due only once the window has closed', () => {
  const plan = planDeletion(new Date('2026-09-24T12:00:00.000Z'))
  assert.equal(isPurgeDue(plan, new Date('2026-09-30T12:00:00.000Z')), false)
  assert.equal(isPurgeDue(plan, plan.purgeAfter), true, 'due AT the boundary')
  assert.equal(isPurgeDue(null), false)
})

test('the cron selector matches a pending, due row and nothing else', () => {
  const now = new Date('2026-10-01T00:00:00.000Z')
  const selector = purgeSelector(now) as Record<string, { $ne?: unknown; $lte?: unknown }>
  assert.deepEqual(selector['deletion.requestedAt'], { $ne: null })
  assert.deepEqual(selector['deletion.purgeAfter'], { $lte: now })
})

// ─── 2. The restore MAC ──────────────────────────────────────────────────────

const SECRET = 'unit-test-secret'
const USER = '68d3f1c2a4b5c6d7e8f90123'

test('a restore token round-trips, and only for its own request', () => {
  const requestedAt = new Date('2026-09-24T12:00:00.000Z')
  const token = restoreToken(USER, requestedAt, SECRET)

  assert.match(token, /^[0-9a-f]{32}$/, 'the token must be 32 hex chars')
  assert.equal(verifyRestoreToken(USER, requestedAt, token, SECRET), true)

  // Bound to the TIMESTAMP: a second request (a new requestedAt) kills the
  // link minted for the first, which is what makes it expire without a TTL.
  const laterRequest = new Date(requestedAt.getTime() + 1000)
  assert.equal(verifyRestoreToken(USER, laterRequest, token, SECRET), false)

  // Bound to the USER: the id in the URL cannot be swapped for someone else's.
  assert.equal(verifyRestoreToken('68d3f1c2a4b5c6d7e8f90999', requestedAt, token, SECRET), false)

  // Bound to the SECRET.
  assert.equal(verifyRestoreToken(USER, requestedAt, token, 'another-secret'), false)

  // And a cancelled deletion has no timestamp at all.
  assert.equal(verifyRestoreToken(USER, null, token, SECRET), false)
})

test('a malformed token is refused without throwing', () => {
  const requestedAt = new Date('2026-09-24T12:00:00.000Z')
  for (const bad of ['', 'nope', 'zz'.repeat(16), '0'.repeat(31), '0'.repeat(33)]) {
    assert.equal(verifyRestoreToken(USER, requestedAt, bad, SECRET), false, `accepted ${bad}`)
  }
  assert.equal(verifyRestoreToken(USER, 'not-a-date', restoreToken(USER, new Date(), SECRET), SECRET), false)
})

test('the restore URL points at the PAGE, never at the API route', () => {
  const url = buildRestoreUrl('https://become.redbtn.io', USER, restoreToken(USER, new Date(), SECRET))
  const parsed = new URL(url)
  assert.equal(parsed.pathname, RESTORE_PATH)
  assert.equal(parsed.pathname, '/account/restore')
  assert.ok(!parsed.pathname.startsWith('/api'), 'a mail scanner GETs every link in an email')
  assert.equal(parsed.searchParams.get('u'), USER)
  assert.match(parsed.searchParams.get('t') ?? '', /^[0-9a-f]{32}$/)
})

// ─── 3. The purge plan ───────────────────────────────────────────────────────

/** A model that records what it was asked to do and never touches a database. */
function fakeModel(counts: { deleted?: number; modified?: number; ids?: unknown[] } = {}) {
  const calls: { op: string; filter: unknown; update?: unknown }[] = []
  const model: PurgeableModel & { calls: typeof calls } = {
    calls,
    async deleteMany(filter) {
      calls.push({ op: 'deleteMany', filter })
      return { deletedCount: counts.deleted ?? 0 }
    },
    async updateMany(filter, update) {
      calls.push({ op: 'updateMany', filter, update })
      return { modifiedCount: counts.modified ?? 0 }
    },
    async distinct(field, filter) {
      calls.push({ op: `distinct:${field}`, filter })
      return counts.ids ?? []
    },
  }
  return model
}

function fakeRegistry(counts?: { deleted?: number; modified?: number; ids?: unknown[] }) {
  const models: Record<string, ReturnType<typeof fakeModel>> = {}
  for (const step of PURGE_PLAN) models[step.model] ??= fakeModel(counts)
  for (const cascade of PURGE_CASCADES) {
    models[cascade.parent] ??= fakeModel(counts)
    models[cascade.child] ??= fakeModel(counts)
  }
  models.User ??= fakeModel(counts)
  return models
}

test('every model that names a member is either purged or exempted with a reason', () => {
  const modelFiles = fs
    .readdirSync(path.join(ROOT, 'models'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))

  const planned = new Set<string>([
    ...PURGE_PLAN.map((s) => s.model),
    ...PURGE_CASCADES.map((c) => c.child),
  ])

  const unaccounted = modelFiles.filter((m) => !planned.has(m) && !(m in PURGE_EXEMPT))
  assert.deepEqual(
    unaccounted,
    [],
    'these models are neither purged nor exempted — add them to PURGE_PLAN or to PURGE_EXEMPT with the reason they survive deletion',
  )

  // And the exemptions cannot be a dumping ground: each one carries a sentence.
  for (const [model, reason] of Object.entries(PURGE_EXEMPT)) {
    assert.ok(reason.length > 20, `PURGE_EXEMPT.${model} needs a real reason, not "${reason}"`)
    assert.ok(modelFiles.includes(model), `PURGE_EXEMPT names ${model}, which is not a model`)
  }
})

test('the purge can resolve every model the plan names', () => {
  // The registry is a hand-written map, so a step naming a model nobody
  // imported would silently skip — reported, but skipped. (It lives in lib/
  // rather than in the route because a Next.js route.ts may only export
  // handlers and the recognised route options.)
  const src = fs.readFileSync(path.join(ROOT, 'lib/accountPurgeModels.ts'), 'utf8')
  const registry = src.slice(src.indexOf('PURGE_MODELS'))
  for (const name of new Set([
    ...PURGE_PLAN.map((s) => s.model),
    ...PURGE_CASCADES.flatMap((c) => [c.parent, c.child]),
    'User',
  ])) {
    assert.ok(
      new RegExp(`\\b${name}:\\s`).test(registry),
      `${name} is in the purge plan but not in PURGE_MODELS — its step would be skipped`,
    )
  }
})

test('the plan deletes the member’s own rows and only detaches shared ones', async () => {
  const models = fakeRegistry({ deleted: 1, modified: 1, ids: ['meal-1'] })
  const report = await purgeAccountData({ models, userId: USER, email: 'x@example.com' })

  assert.equal(report.errors, 0)
  assert.equal(report.userDeleted, true, 'the User row must go')

  // The shared catalogue is DETACHED, never deleted: other members' logs point
  // at those rows, and deleting them breaks someone else's history.
  const food = models.Food.calls
  assert.ok(food.length > 0)
  assert.ok(
    food.every((c) => c.op === 'updateMany'),
    'the food catalogue must be detached, never deleted',
  )
  assert.ok(
    food.every((c) => JSON.stringify(c.update).includes('$unset')),
    'a detach is an $unset of the member field',
  )

  // Their own logs are deleted outright.
  assert.ok(models.MealLog.calls.some((c) => c.op === 'deleteMany'))
  assert.ok(models.UserProgress.calls.some((c) => c.op === 'deleteMany'))

  // Push registrations go with everything else — web endpoints and the native
  // Expo tokens live in the same collection.
  assert.ok(models.PushSubscription.calls.some((c) => c.op === 'deleteMany'))

  // Sign-in links are keyed by ADDRESS, so the plan has to use the email.
  const magic = models.MagicLink.calls.find((c) => c.op === 'deleteMany')
  assert.deepEqual(magic?.filter, { email: 'x@example.com' })
})

test('the User row is deleted LAST, and never while a step is failing', async () => {
  const models = fakeRegistry({ deleted: 1, modified: 1 })
  const order: string[] = []
  for (const [name, model] of Object.entries(models)) {
    const realDelete = model.deleteMany.bind(model)
    model.deleteMany = async (filter) => {
      order.push(name)
      return realDelete(filter)
    }
  }
  await purgeAccountData({ models, userId: USER, email: 'x@example.com' })
  assert.equal(order.at(-1), 'User', 'the account row must be the last thing to go')

  // One broken collection leaves the account in place, so the next run retries
  // it. A half-purged member who no longer matches the selector is a member
  // whose data quietly survives deletion.
  const broken = fakeRegistry({ deleted: 1, modified: 1 })
  broken.MealLog.deleteMany = async () => {
    throw new Error('collection unavailable')
  }
  const userDeletes: unknown[] = []
  broken.User.deleteMany = async (filter) => {
    userDeletes.push(filter)
    return { deletedCount: 1 }
  }
  const report = await purgeAccountData({ models: broken, userId: USER, email: 'x@example.com' })
  assert.equal(report.errors, 1)
  assert.equal(report.userDeleted, false)
  assert.deepEqual(userDeletes, [], 'the User row must survive a failed run')
})

test('a missing email skips the sign-in-link step instead of deleting everybody’s', async () => {
  const models = fakeRegistry({ deleted: 1 })
  const report = await purgeAccountData({ models, userId: USER, email: null })
  assert.deepEqual(models.MagicLink.calls, [], 'no email, no MagicLink filter')
  assert.ok(report.steps.some((s) => s.model === 'MagicLink' && s.skipped === 'no_email'))
})

test('meal photos go with the meal they belong to', async () => {
  const models = fakeRegistry({ deleted: 2, modified: 1, ids: ['meal-1', 'meal-2'] })
  await purgeAccountData({ models, userId: USER, email: 'x@example.com' })

  const lookup = models.Meal.calls.find((c) => c.op === 'distinct:_id')
  assert.ok(lookup, 'the cascade has to find the meals before they are deleted')
  const imageDelete = models.MealImage.calls.find((c) => c.op === 'deleteMany')
  assert.deepEqual(imageDelete?.filter, { mealId: { $in: ['meal-1', 'meal-2'] } })

  // A published meal keeps its picture: the row is staying, and a shared card
  // with a missing image is a broken row for everyone else.
  const cascade = PURGE_CASCADES.find((c) => c.child === 'MealImage')
  assert.deepEqual(cascade?.parentFilter, { isPublic: { $ne: true } })
})

// ─── 4. The copy matches what the purge does ─────────────────────────────────

test('the member-facing summary names the push tokens and the catalogue carve-out', () => {
  const covers = DELETION_COVERS.join(' ').toLowerCase()
  assert.match(covers, /push notification/, 'members are told their push registrations go')

  const exceptions = DELETION_EXCEPTIONS.join(' ').toLowerCase()
  assert.match(exceptions, /catalogue/, 'the detach carve-out has to be stated, because it happens')
  assert.match(exceptions, /backup/, 'backups age out; say so')
  assert.match(exceptions, /billing/, 'billing records are kept; say so')
})

test('the confirmation phrase is a constant, so no surface can invent its own', () => {
  assert.equal(DELETE_CONFIRMATION, 'DELETE')
  assert.notEqual(DELETE_CONFIRMATION, '')
})
