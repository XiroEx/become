// Run with: npm run test:file tests/unit/adminSubmittedExerciseEdit.test.ts
//
// ─── "Exercise not found" ON EVERY ADMIN SAVE OF A MEMBER'S EXERCISE ─────────
//
// Jon, on a screenshot: "When I try to save the changes I made from a submitted
// work out from a member it said 'exercise not found'."
//
// A member submits one of their own custom exercises to the shared library and
// an admin approves it. Approval sets `isUniversal: true` and leaves
// `isCustom: true` — it is still the member's row. But the admin write routes
// in app/api/exercises/[slug]/route.ts matched `{ slug, isCustom: { $ne: true } }`
// and answered 404 for anything else, while PATCH /api/exercises/custom/[slug]
// only admits the member who created it. So an approved submission had NO route
// anyone could save it through: the admin opened it (GET exempts universal
// exercises) and every save came back "Exercise not found".
//
// The fix widens the admin scope by exactly one case — an APPROVED submission —
// and this file drives the real handlers against the real (loopback,
// disposable) test database to pin both halves of that:
//
//   • an admin can save, and remove, a member's approved submission;
//   • a member's PRIVATE custom exercise is still nobody's but theirs, the
//     ownership of a submission survives an admin save, and a non-admin is
//     still refused — the cross-user write leak this guard was added for stays
//     closed.
//
// ITS OWN FIXTURES: the runner executes test FILES in parallel against ONE
// database, so everything here is prefixed `adm-sub-` / `@adminsubmitted.test`
// and nothing counts a row it did not create.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { PUT as adminPUT, DELETE as adminDELETE } from '../../app/api/exercises/[slug]/route'
import { PATCH as ownerPATCH } from '../../app/api/exercises/custom/[slug]/route'
import { DELETE as ownerDELETE } from '../../app/api/exercises/custom/route'
import Exercise from '../../models/Exercise'
import User from '../../models/User'
import { signToken } from '../../lib/auth'
import {
  adminWritableExerciseFilter,
  isAdminWritableExercise,
  isSharedSubmission,
} from '../../lib/exerciseVisibility'

const ADMIN_ID = '6ab7e50000000000000ad000'
const MEMBER_ID = '6ab7e50000000000000ad001'
const OTHER_MEMBER_ID = '6ab7e50000000000000ad002'

const SUBMITTED_SLUG = 'adm-sub-approved-sled-drag'
const PRIVATE_SLUG = 'adm-sub-private-sled-drag'
const CATALOG_SLUG = 'adm-sub-catalog-sled-drag'
const FIXTURE_SLUGS = [SUBMITTED_SLUG, PRIVATE_SLUG, CATALOG_SLUG]

const EMAILS = [
  'admin@adminsubmitted.test',
  'member@adminsubmitted.test',
  'other@adminsubmitted.test',
]

let adminAuth: string
let memberAuth: string
let otherAuth: string

/** The shape the Exercise model insists on: slug, name, category, bodyRegion. */
function exerciseFixture(extra: Record<string, unknown>) {
  return {
    name: 'Sled Drag',
    category: 'strength' as const,
    bodyRegion: 'lower_body' as const,
    primaryMuscles: ['quads' as const],
    trackingType: 'reps_weight' as const,
    ...extra,
  }
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')

  await User.deleteMany({ email: { $in: EMAILS } })
  await User.create({
    _id: new mongoose.Types.ObjectId(ADMIN_ID),
    email: EMAILS[0],
    password: 'unit-test-unused',
    name: 'Admin',
    role: 'admin',
  })
  await User.create({
    _id: new mongoose.Types.ObjectId(MEMBER_ID),
    email: EMAILS[1],
    password: 'unit-test-unused',
    name: 'Member',
  })
  await User.create({
    _id: new mongoose.Types.ObjectId(OTHER_MEMBER_ID),
    email: EMAILS[2],
    password: 'unit-test-unused',
    name: 'Other Member',
  })

  adminAuth = `Bearer ${await signToken({ userId: ADMIN_ID, email: EMAILS[0], role: 'admin' })}`
  memberAuth = `Bearer ${await signToken({ userId: MEMBER_ID, email: EMAILS[1] })}`
  otherAuth = `Bearer ${await signToken({ userId: OTHER_MEMBER_ID, email: EMAILS[2] })}`
})

after(async () => {
  await Exercise.deleteMany({ slug: { $in: FIXTURE_SLUGS } })
  await User.deleteMany({ email: { $in: EMAILS } })
  await mongoose.disconnect()
})

beforeEach(async () => {
  await Exercise.deleteMany({ slug: { $in: FIXTURE_SLUGS } })

  // The member's exercise, submitted and APPROVED: still theirs, now shared.
  await Exercise.create(
    exerciseFixture({
      slug: SUBMITTED_SLUG,
      isCustom: true,
      createdBy: MEMBER_ID,
      isUniversal: true,
      reviewStatus: 'approved',
      submittedAt: new Date('2026-08-20T10:00:00Z'),
    }),
  )

  // The member's exercise they never submitted: private, and staying that way.
  await Exercise.create(
    exerciseFixture({
      slug: PRIVATE_SLUG,
      name: 'Private Sled Drag',
      isCustom: true,
      createdBy: MEMBER_ID,
    }),
  )

  // An ordinary catalog exercise, for the behaviour that must not change.
  await Exercise.create(exerciseFixture({ slug: CATALOG_SLUG, name: 'Catalog Sled Drag' }))
})

function put(slug: string, body: unknown, authHeader: string): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  const request = new NextRequest(`http://localhost/api/exercises/${slug}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  return adminPUT(request, { params: Promise.resolve({ slug }) })
}

function del(slug: string, authHeader: string): Promise<Response> {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  const request = new NextRequest(`http://localhost/api/exercises/${slug}`, {
    method: 'DELETE',
    headers,
  })
  return adminDELETE(request, { params: Promise.resolve({ slug }) })
}

function row(slug: string) {
  return Exercise.findOne({ slug }).lean<Record<string, unknown> | null>()
}

// ─── The bug: an admin saving a member's approved submission ────────────────

test('an admin can save an edit to a member\'s submitted exercise', async () => {
  const res = await put(
    SUBMITTED_SLUG,
    { name: 'Heavy Sled Drag', cues: ['chest up'], defaultSets: 4 },
    adminAuth,
  )

  assert.equal(res.status, 200, 'this is the 404 "Exercise not found" Jon saw on every save')
  const body = (await res.json()) as { exercise?: { name?: string }; error?: string }
  assert.equal(body.error, undefined)
  assert.equal(body.exercise?.name, 'Heavy Sled Drag')

  const saved = await row(SUBMITTED_SLUG)
  assert.equal(saved?.name, 'Heavy Sled Drag', 'the edit actually landed on the row')
  assert.deepEqual(saved?.cues, ['chest up'])
  assert.equal(saved?.defaultSets, 4)
})

test('the admin save leaves the exercise belonging to the member who made it', async () => {
  const res = await put(SUBMITTED_SLUG, { name: 'Heavy Sled Drag' }, adminAuth)
  assert.equal(res.status, 200)

  const saved = await row(SUBMITTED_SLUG)
  assert.equal(saved?.createdBy, MEMBER_ID, 'ownership is never reassigned by an admin save')
  assert.equal(saved?.isCustom, true, 'it is still the member\'s custom exercise')
  assert.equal(saved?.isUniversal, true, 'and it is still in the shared library')
  assert.equal(saved?.reviewStatus, 'approved')
})

test('an admin cannot take ownership even by putting it in the body', async () => {
  // The route writes an allow-list, not the body, so the privileged fields are
  // simply not writable here — not stripped by a deny-list that the next new
  // field would be missing from.
  const res = await put(
    SUBMITTED_SLUG,
    {
      name: 'Heavy Sled Drag',
      createdBy: ADMIN_ID,
      isCustom: false,
      isUniversal: false,
      reviewStatus: 'rejected',
    },
    adminAuth,
  )
  assert.equal(res.status, 200)

  const saved = await row(SUBMITTED_SLUG)
  assert.equal(saved?.createdBy, MEMBER_ID)
  assert.equal(saved?.isCustom, true)
  assert.equal(saved?.isUniversal, true)
  assert.equal(saved?.reviewStatus, 'approved')
})

test('after the admin save the member can still edit their own exercise', async () => {
  assert.equal((await put(SUBMITTED_SLUG, { name: 'Heavy Sled Drag' }, adminAuth)).status, 200)

  const headers = new Headers({ 'Content-Type': 'application/json', Authorization: memberAuth })
  const request = new NextRequest(`http://localhost/api/exercises/custom/${SUBMITTED_SLUG}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: 'My Sled Drag',
      trackingType: 'reps_weight',
      muscleGroup: 'legs',
      category: 'strength',
    }),
  })
  const res = await ownerPATCH(request, { params: Promise.resolve({ slug: SUBMITTED_SLUG }) })
  assert.equal(res.status, 200, 'the owner\'s own edit route still admits them')

  const saved = await row(SUBMITTED_SLUG)
  assert.equal(saved?.name, 'My Sled Drag')
  assert.equal(saved?.createdBy, MEMBER_ID)
  // Their edit is unreviewed content, so it drops out of the shared library
  // again — the pre-existing rule, unchanged by any of this.
  assert.equal(saved?.isUniversal, false)
})

test('after the admin save the member can still delete their own exercise', async () => {
  assert.equal((await put(SUBMITTED_SLUG, { name: 'Heavy Sled Drag' }, adminAuth)).status, 200)

  const request = new NextRequest(
    `http://localhost/api/exercises/custom?slug=${encodeURIComponent(SUBMITTED_SLUG)}`,
    { method: 'DELETE', headers: new Headers({ Authorization: memberAuth }) },
  )
  const res = await ownerDELETE(request)
  assert.equal(res.status, 200)
  assert.equal(await row(SUBMITTED_SLUG), null, 'it was theirs to delete all along')
})

// ─── Removing a submission from the shared library ──────────────────────────

test('an admin can remove a submitted exercise from the shared library', async () => {
  const res = await del(SUBMITTED_SLUG, adminAuth)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { unpublished?: boolean; message?: string }
  assert.equal(body.unpublished, true)

  const saved = await row(SUBMITTED_SLUG)
  assert.ok(saved, 'the member\'s row is unpublished, never destroyed')
  assert.equal(saved?.isUniversal, false, 'it is out of the shared library')
  assert.equal(saved?.reviewStatus, 'rejected', 'recorded as the review decision it is')
  assert.equal(saved?.createdBy, MEMBER_ID, 'and it is still theirs')
  assert.equal(saved?.reviewedBy, ADMIN_ID)
})

test('removing a catalog exercise is still a delete', async () => {
  const res = await del(CATALOG_SLUG, adminAuth)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { message: 'Exercise deleted' })
  assert.equal(await row(CATALOG_SLUG), null)
})

// ─── What must still be refused ─────────────────────────────────────────────

test('a member who is not an admin cannot edit someone else\'s exercise', async () => {
  for (const [who, auth] of [['the other member', otherAuth], ['the owner', memberAuth]] as const) {
    const res = await put(SUBMITTED_SLUG, { name: 'Hijacked' }, auth)
    assert.equal(res.status, 403, `${who} must not reach the admin write route`)
    assert.equal((await row(SUBMITTED_SLUG))?.name, 'Sled Drag')
  }

  const anonymous = await put(SUBMITTED_SLUG, { name: 'Hijacked' }, '')
  assert.equal(anonymous.status, 401)
  assert.equal((await row(SUBMITTED_SLUG))?.name, 'Sled Drag')
})

test('a non-admin cannot delete someone else\'s exercise through the admin route', async () => {
  const res = await del(SUBMITTED_SLUG, otherAuth)
  assert.equal(res.status, 403)
  assert.equal((await row(SUBMITTED_SLUG))?.isUniversal, true)
})

test('a member\'s PRIVATE custom exercise is not writable by an admin', async () => {
  // The guard that closed the cross-user write leak: an exercise that was never
  // submitted is owner-managed, and the admin endpoint is not a way in.
  const saved = await put(PRIVATE_SLUG, { name: 'Admin Rename' }, adminAuth)
  assert.equal(saved.status, 403)
  assert.match((await saved.json()).error, /private exercise/i, 'and it says why, not "not found"')
  assert.equal((await row(PRIVATE_SLUG))?.name, 'Private Sled Drag')

  const removed = await del(PRIVATE_SLUG, adminAuth)
  assert.equal(removed.status, 403)
  assert.ok(await row(PRIVATE_SLUG), 'still there')
})

test('a slug that does not exist is still a 404 "Exercise not found"', async () => {
  const res = await put('adm-sub-no-such-exercise', { name: 'x' }, adminAuth)
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'Exercise not found' })

  const removed = await del('adm-sub-no-such-exercise', adminAuth)
  assert.equal(removed.status, 404)
})

// ─── The scope itself, as a function ────────────────────────────────────────

test('isSharedSubmission is true only for an approved custom exercise', () => {
  assert.equal(isSharedSubmission({ isCustom: true, isUniversal: true }), true)
  assert.equal(isSharedSubmission({ isCustom: true, reviewStatus: 'approved' }), true)
  assert.equal(isSharedSubmission({ isCustom: true, reviewStatus: 'pending' }), false)
  assert.equal(isSharedSubmission({ isCustom: true, reviewStatus: 'rejected' }), false)
  assert.equal(isSharedSubmission({ isCustom: true }), false)
  assert.equal(isSharedSubmission({ isCustom: false }), false)
  assert.equal(isSharedSubmission(null), false)
})

test('isAdminWritableExercise admits catalog rows and shared submissions only', () => {
  assert.equal(isAdminWritableExercise({}), true, 'a legacy row with no isCustom field')
  assert.equal(isAdminWritableExercise({ isCustom: false }), true)
  assert.equal(isAdminWritableExercise({ isCustom: true, isUniversal: true }), true)
  assert.equal(isAdminWritableExercise({ isCustom: true, isUniversal: false }), false)
  assert.equal(isAdminWritableExercise({ isCustom: true, reviewStatus: 'pending' }), false)
})

test('the Mongo filter and the predicate agree about every fixture', async () => {
  for (const slug of FIXTURE_SLUGS) {
    const doc = await row(slug)
    const matched = await Exercise.exists(adminWritableExerciseFilter(slug))
    assert.equal(
      !!matched,
      isAdminWritableExercise(doc as { isCustom?: boolean; isUniversal?: boolean }),
      `${slug}: the query and the predicate must not disagree`,
    )
  }
})
