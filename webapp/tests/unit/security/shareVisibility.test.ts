// Run with: npm run test:file tests/unit/security/shareVisibility.test.ts
//
// ANY MEMBER COULD PUBLISH ANY OTHER MEMBER'S CUSTOM PROGRAM.
//
// GET /api/programs/[programId] hides a custom program from everyone but its
// owner and the members it was shared with (Program.sharedWith). POST
// /api/share did not: it loaded the program by `program_id`, with no visibility
// check at all, and wrote a PUBLIC, permanent, unauthenticated snapshot of it
// to /share/[shareId].
//
// The id is the whole secret, and it is not one. `custom-<user
// suffix>-<slug>-<base36 timestamp>` (app/api/programs/custom/route.ts) is hard
// to guess, but it sits in the URL of every program page, in a coach's
// screenshots, and in the browser history of every member the program was ever
// shared with — who keeps it after the share is revoked. One POST turned any of
// those into a public page nobody can take down.
//
// So the rule is one rule now (lib/programVisibility.ts): a member can share
// only what they can open. These tests drive the real route handler against the
// real (loopback, disposable) test database for all four cases the fix has to
// get right — the owner, a member it was shared with, another member, and a
// catalogue program — because "who gets a 404" is a question about what the
// route actually does.

import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { POST } from '../../../app/api/share/route'
import ProgramModel from '../../../models/Program'
import Share from '../../../models/Share'
import { signToken } from '../../../lib/auth'
import { canMemberOpenProgram } from '../../../lib/programVisibility'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// Three members and two programs, all namespaced so the suite can clean up
// after itself without touching anything else in the test database.
const OWNER = '65f0000000000000000000a1'
const SHARED_MEMBER = '65f0000000000000000000a2'
const OTHER_MEMBER = '65f0000000000000000000a3'

const CUSTOM_ID = 'custom-0000a1-share-visibility-test-zzz1'
const CATALOG_ID = 'share-visibility-test-catalog-zzz1'
const PROGRAM_IDS = [CUSTOM_ID, CATALOG_ID]

const phases = [
  {
    phase: 'Phase 1',
    weeks: '1-4',
    focus: 'Base',
    workouts: [
      {
        day: 'Day 1',
        title: 'Upper Body',
        exercises: [{ exerciseSlug: 'bench-press', name: 'Bench Press', sets: 3, reps: '8' }],
      },
    ],
  },
]

const tokens: Record<string, string> = {}

async function cleanPrograms() {
  await ProgramModel.deleteMany({ program_id: { $in: PROGRAM_IDS } })
}

async function cleanShares() {
  await Share.deleteMany({ ownerId: { $in: [OWNER, SHARED_MEMBER, OTHER_MEMBER] } })
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')

  await cleanPrograms()
  await cleanShares()

  // The owner's private custom program, shared with exactly one member.
  await ProgramModel.create({
    program_id: CUSTOM_ID,
    name: 'A Private Custom Program',
    duration_weeks: 4,
    training_days_per_week: 3,
    goal: 'Strength',
    target_user: 'Intermediate',
    isCustom: true,
    createdBy: OWNER,
    sharedWith: [SHARED_MEMBER],
    phases,
  })

  // A catalogue program: the shared library, browsable and shareable by anyone.
  await ProgramModel.create({
    program_id: CATALOG_ID,
    name: 'A Catalogue Program',
    duration_weeks: 8,
    training_days_per_week: 4,
    goal: 'Hypertrophy',
    target_user: 'Beginner',
    isCustom: false,
    phases,
  })

  for (const [label, userId] of [
    ['owner', OWNER],
    ['shared', SHARED_MEMBER],
    ['other', OTHER_MEMBER],
  ] as const) {
    tokens[label] = `Bearer ${await signToken({ userId, email: `${label}@example.com` })}`
  }
})

after(async () => {
  await cleanPrograms()
  await cleanShares()
  await mongoose.disconnect()
})

afterEach(async () => {
  await cleanShares()
})

function shareRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/share', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ─── THE BUG: another member could publish a program they cannot open ───────

test('THE BUG: another member sharing a custom program by id gets 404, and nothing is published', async () => {
  const res = await POST(shareRequest({ kind: 'program', programId: CUSTOM_ID }, tokens.other))
  assert.equal(res.status, 404)
  const json = await res.json()
  assert.match(String(json.error), /Program not found/)
  // The 404 must be the same answer GET /api/programs/[programId] gives — it
  // may not confirm that the id exists.
  assert.equal(json.shareId, undefined)
  assert.equal(await Share.countDocuments({ sourceProgramId: CUSTOM_ID }), 0)
})

test("another member cannot share a single WORKOUT out of someone else's custom program either", async () => {
  const res = await POST(
    shareRequest({ kind: 'workout', programId: CUSTOM_ID, day: 'Day 1' }, tokens.other),
  )
  assert.equal(res.status, 404)
  assert.equal(await Share.countDocuments({ sourceProgramId: CUSTOM_ID }), 0)
})

test('a revoked member is another member: dropping them from sharedWith stops the share', async () => {
  await ProgramModel.updateOne({ program_id: CUSTOM_ID }, { $set: { sharedWith: [] } })
  try {
    const res = await POST(shareRequest({ kind: 'program', programId: CUSTOM_ID }, tokens.shared))
    assert.equal(res.status, 404)
  } finally {
    await ProgramModel.updateOne({ program_id: CUSTOM_ID }, { $set: { sharedWith: [SHARED_MEMBER] } })
  }
})

// ─── What must keep working ────────────────────────────────────────────────

test('the OWNER still shares their own custom program', async () => {
  const res = await POST(shareRequest({ kind: 'program', programId: CUSTOM_ID }, tokens.owner))
  assert.equal(res.status, 201)
  const json = await res.json()
  assert.match(String(json.shareId), /^[\w-]{10,}$/)
  assert.equal(json.url, `/share/${json.shareId}`)
  const doc = await Share.findOne({ shareId: json.shareId }).lean()
  assert.equal(doc?.sourceProgramId, CUSTOM_ID)
  assert.equal(doc?.title, 'A Private Custom Program')
})

test('a member the program was SHARED WITH still shares it', async () => {
  const res = await POST(shareRequest({ kind: 'program', programId: CUSTOM_ID }, tokens.shared))
  assert.equal(res.status, 201)
  const json = await res.json()
  const doc = await Share.findOne({ shareId: json.shareId }).lean()
  assert.equal(doc?.sourceProgramId, CUSTOM_ID)
  assert.equal(doc?.ownerId?.toString(), SHARED_MEMBER)
})

test('the owner still shares a single workout out of their own program', async () => {
  const res = await POST(
    shareRequest({ kind: 'workout', programId: CUSTOM_ID, day: 'Day 1' }, tokens.owner),
  )
  assert.equal(res.status, 201)
  const json = await res.json()
  const doc = await Share.findOne({ shareId: json.shareId }).lean()
  assert.equal(doc?.kind, 'workout')
  assert.equal(doc?.title, 'Upper Body')
})

test('a CATALOGUE program is shareable by any member, including one who has nothing to do with it', async () => {
  for (const who of ['owner', 'shared', 'other'] as const) {
    const res = await POST(shareRequest({ kind: 'program', programId: CATALOG_ID }, tokens[who]))
    assert.equal(res.status, 201, `${who} should be able to share a catalogue program`)
    const json = await res.json()
    const doc = await Share.findOne({ shareId: json.shareId }).lean()
    assert.equal(doc?.sourceProgramId, CATALOG_ID)
  }
})

test('a one-off session share is untouched by the program rule', async () => {
  const res = await POST(
    shareRequest(
      { kind: 'session', session: { title: 'Quick Session', exercises: [{ name: 'Push Up', sets: 3 }] } },
      tokens.other,
    ),
  )
  assert.equal(res.status, 201)
})

test('an unknown programId is still a 404, and an unauthenticated caller a 401', async () => {
  const missing = await POST(
    shareRequest({ kind: 'program', programId: 'custom-nobody-nothing-zzz' }, tokens.other),
  )
  assert.equal(missing.status, 404)

  const anon = await POST(shareRequest({ kind: 'program', programId: CATALOG_ID }))
  assert.equal(anon.status, 401)
})

// ─── The rule itself, pure ─────────────────────────────────────────────────

test('canMemberOpenProgram: catalogue yes, owner yes, shared-with yes, anyone else no', () => {
  const custom = { isCustom: true, createdBy: OWNER, sharedWith: [SHARED_MEMBER] }
  assert.equal(canMemberOpenProgram(custom, OWNER), true)
  assert.equal(canMemberOpenProgram(custom, SHARED_MEMBER), true)
  assert.equal(canMemberOpenProgram(custom, OTHER_MEMBER), false)
  assert.equal(canMemberOpenProgram(custom, null), false)

  assert.equal(canMemberOpenProgram({ isCustom: false }, OTHER_MEMBER), true)
  assert.equal(canMemberOpenProgram({}, OTHER_MEMBER), true) // legacy rows: no isCustom field
})

test('canMemberOpenProgram: ObjectId fields compare by value, not identity', () => {
  const ownerId = new mongoose.Types.ObjectId(OWNER)
  const sharedId = new mongoose.Types.ObjectId(SHARED_MEMBER)
  const program = { isCustom: true, createdBy: ownerId, sharedWith: [sharedId] }
  assert.equal(canMemberOpenProgram(program, OWNER), true)
  assert.equal(canMemberOpenProgram(program, SHARED_MEMBER), true)
  assert.equal(canMemberOpenProgram(program, OTHER_MEMBER), false)
})

test('canMemberOpenProgram: an ownerless custom program belongs to nobody', () => {
  assert.equal(canMemberOpenProgram({ isCustom: true }, OTHER_MEMBER), false)
  assert.equal(canMemberOpenProgram({ isCustom: true, createdBy: null, sharedWith: null }, OWNER), false)
})

// ─── The net that keeps this fixed ─────────────────────────────────────────

test('both program read paths go through canMemberOpenProgram, so they cannot drift', () => {
  for (const rel of ['app/api/share/route.ts', 'app/api/programs/[programId]/route.ts']) {
    assert.match(
      read(rel),
      /canMemberOpenProgram\(/,
      `${rel} must ask lib/programVisibility.ts whether the caller can open the program`,
    )
  }
})

test('the share route checks visibility BEFORE it hydrates or snapshots anything', () => {
  const src = read('app/api/share/route.ts')
  const guard = src.indexOf('canMemberOpenProgram(')
  const hydrate = src.indexOf('hydrateProgram(')
  assert.ok(guard > -1, 'the share route must call canMemberOpenProgram')
  assert.ok(hydrate > -1, 'the share route still hydrates the program it snapshots')
  assert.ok(guard < hydrate, 'the 404 must come before the snapshot is built')
})
