// Run with: npm run test:file tests/unit/contract/np037Mind.test.ts
//
// THE MIND + BECOMING SURFACE, CHECKED AGAINST THE SHARED SCHEMAS (NP-037).
//
// Read tests/unit/contract/_contract.ts first — it explains why the schemas are
// imported by RELATIVE path, why "it parses" is not the whole check, and what a
// domain file has to end with.
//
// WHAT THIS FILE IS FOR
//
// shared/api-client knew ONE thing about Mind: the dashboard mood scale in
// schemas/mood.ts. Every Mind screen the native app draws would have been
// untyped, and a web change to any of these responses would have broken it in
// silence. So every route below is called for real — the exported handler, a
// signed token, the loopback test database — and parsed with the schema the
// native app reads it through.
//
// ITS OWN FIXTURES, ON PURPOSE. The runner executes test FILES in parallel, so
// this file uses its own two members (`@np037.contract.test`) rather than the
// shared np015 pair: one Plus (the happy path) and one free member who is
// already past the ten free Mind sessions, which is the only way to see the 403
// gate body this ticket also types.
//
// THE DAY. `tz` is minutes WEST of UTC and the routes derive the member's local
// day from it and from nothing else. `DAY_SHIFT_TZ` below is chosen so that
// local day is DEFINITELY NOT the UTC day, so a handler that ignored `tz` (or a
// client that sent the web's `tzOffset`, which POST /api/mind/session does not
// read — NP-031) fails here instead of passing for eleven hours a day.
//
// TESTS RUN IN DECLARATION ORDER, and the order matters: the PUT stores the
// session the GET resumes, the POST clears it, and several PATCHes refuse to
// run before their PUT has created the document they act on.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import nodePath from 'node:path'
import mongoose from 'mongoose'

// The routes. Real exported handlers.
import { GET as mindProgressGET } from '../../../app/api/mind/progress/route'
import { POST as mindIntroducePOST } from '../../../app/api/mind/progress/introduce/route'
import {
  GET as mindSessionGET,
  POST as mindSessionPOST,
  PUT as mindSessionPUT,
} from '../../../app/api/mind/session/route'
import {
  GET as mindStateGET,
  POST as mindStatePOST,
} from '../../../app/api/mind/state/route'
import {
  GET as mindIdentityGET,
  PUT as mindIdentityPUT,
  PATCH as mindIdentityPATCH,
} from '../../../app/api/mind/identity/route'
import {
  GET as mindMissionGET,
  PUT as mindMissionPUT,
  PATCH as mindMissionPATCH,
} from '../../../app/api/mind/mission/route'
import {
  GET as mindVisionGET,
  POST as mindVisionPOST,
  PATCH as mindVisionPATCH,
} from '../../../app/api/mind/vision/route'
import {
  GET as mindDisciplineGET,
  POST as mindDisciplinePOST,
} from '../../../app/api/mind/discipline/route'
import {
  GET as mindNonNegotiablesGET,
  POST as mindNonNegotiablesPOST,
  PATCH as mindNonNegotiablesPATCH,
} from '../../../app/api/mind/non-negotiables/route'
import {
  GET as mindWinsGET,
  POST as mindWinsPOST,
} from '../../../app/api/mind/wins/route'
import {
  GET as mindJournalGET,
  POST as mindJournalPOST,
} from '../../../app/api/mind/journal/route'
import { POST as mindSharePOST } from '../../../app/api/mind/share/route'
import { GET as mindSummaryGET } from '../../../app/api/mind/summary/route'
import { GET as becomingJourneyGET } from '../../../app/api/becoming/journey/route'

// The contract. RELATIVE imports of shared/api-client — see _contract.ts.
import {
  MIND_ROUTES_WITHOUT_SCHEMAS,
  MIND_SESSIONS_FEATURE,
  MindAffirmResponseSchema,
  MindDisciplineActionRequestSchema,
  MindDisciplineResponseSchema,
  MindGatePayloadSchema,
  MindIdentityPatchRequestSchema,
  MindIdentityPutRequestSchema,
  MindIdentityResponseSchema,
  MindIntroduceRequestSchema,
  MindIntroduceResponseSchema,
  MindJournalCreateRequestSchema,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
  MindMissionMoveRequestSchema,
  MindMissionPutRequestSchema,
  MindMissionResponseSchema,
  MindMomentumResponseSchema,
  MindNonNegotiableCreateRequestSchema,
  MindNonNegotiableCreateResponseSchema,
  MindNonNegotiablePatchRequestSchema,
  MindNonNegotiablePatchResponseSchema,
  MindNonNegotiablesResponseSchema,
  MindProgressResponseSchema,
  MindSessionCompleteRequestSchema,
  MindSessionCompleteResponseSchema,
  MindSessionPlanSchema,
  MindSessionSaveRequestSchema,
  MindSessionSaveResponseSchema,
  MindSessionStateResponseSchema,
  MindShareRequestSchema,
  MindShareResponseSchema,
  MindStateLogRequestSchema,
  MindStateLogResponseSchema,
  MindStateResponseSchema,
  MindSummaryResponseSchema,
  MindVisionAlignRequestSchema,
  MindVisionAlignResponseSchema,
  MindVisionPostRequestSchema,
  MindVisionResponseSchema,
  MindVisionSaveResponseSchema,
  MindWinCreateRequestSchema,
  MindWinCreateResponseSchema,
  MindWinsResponseSchema,
  type MindSessionPlan,
} from '../../../../shared/api-client/src/schemas/mind'
import { BecomingJourneyResponseSchema } from '../../../../shared/api-client/src/schemas/becoming'

// The assertion + coverage gate.
import {
  Coverage,
  assertContract,
  assertEveryRouteCovered,
  getJson,
  sendJson,
  type ContractMember,
  type ContractRoute,
} from './_contract'

import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import MindProgress from '../../../models/MindProgress'
import MindSession from '../../../models/MindSession'
import MindJournal from '../../../models/MindJournal'
import MindNonNegotiable from '../../../models/MindNonNegotiable'
import StateLog from '../../../models/StateLog'
import IdentityProfile from '../../../models/IdentityProfile'
import Mission from '../../../models/Mission'
import DisciplineChallenge from '../../../models/DisciplineChallenge'
import DailyWin from '../../../models/DailyWin'
import SharedSession from '../../../models/SharedSession'
import { signToken } from '../../../lib/auth'

// ---------------------------------------------------------------------------
// The manifest: every route NP-037's schemas describe.
//
// Sources: the route list on the card, the headers of
// shared/api-client/src/schemas/{mind,becoming}.ts, and
// `grep -rl "" webapp/app/api/mind webapp/app/api/becoming`.
// ---------------------------------------------------------------------------

const NP037_ROUTES: readonly ContractRoute[] = [
  // progression
  { method: 'GET', path: '/api/mind/progress', schema: 'MindProgressResponseSchema', note: 'runs its migrations + upserts on every call' },
  { method: 'POST', path: '/api/mind/progress/introduce', schema: 'MindIntroduceResponseSchema', note: 'idempotent ($addToSet)' },
  // the session itself
  { method: 'GET', path: '/api/mind/session', schema: 'MindSessionStateResponseSchema', note: 'also the locked shape, from the free member' },
  { method: 'PUT', path: '/api/mind/session', schema: 'MindSessionSaveResponseSchema', note: 'stores the composed plan; gates the START' },
  { method: 'POST', path: '/api/mind/session', schema: 'MindSessionCompleteResponseSchema', note: 'the completion; reads the day from `tz`' },
  // the check-in
  { method: 'GET', path: '/api/mind/state', schema: 'MindStateResponseSchema' },
  { method: 'POST', path: '/api/mind/state', schema: 'MindStateLogResponseSchema' },
  // self-image
  { method: 'GET', path: '/api/mind/identity', schema: 'MindIdentityResponseSchema' },
  { method: 'PUT', path: '/api/mind/identity', schema: 'MindIdentityResponseSchema', note: 'the intake' },
  { method: 'PATCH', path: '/api/mind/identity', schema: 'MindAffirmResponseSchema + MindIdentityResponseSchema', note: 'both actions: affirm and edit' },
  // mission
  { method: 'GET', path: '/api/mind/mission', schema: 'MindMissionResponseSchema' },
  { method: 'PUT', path: '/api/mind/mission', schema: 'MindMissionResponseSchema' },
  { method: 'PATCH', path: '/api/mind/mission', schema: 'MindMomentumResponseSchema', note: 'action: move' },
  // vision (a BINARY Plus feature; GET stays open)
  { method: 'GET', path: '/api/mind/vision', schema: 'MindVisionResponseSchema' },
  { method: 'POST', path: '/api/mind/vision', schema: 'MindVisionSaveResponseSchema' },
  { method: 'PATCH', path: '/api/mind/vision', schema: 'MindVisionAlignResponseSchema', note: 'action: align' },
  // discipline
  { method: 'GET', path: '/api/mind/discipline', schema: 'MindDisciplineResponseSchema', note: 'a read that UPSERTS the day row' },
  { method: 'POST', path: '/api/mind/discipline', schema: 'MindDisciplineResponseSchema', note: 'both actions: excuse and complete' },
  { method: 'GET', path: '/api/mind/non-negotiables', schema: 'MindNonNegotiablesResponseSchema' },
  { method: 'POST', path: '/api/mind/non-negotiables', schema: 'MindNonNegotiableCreateResponseSchema' },
  { method: 'PATCH', path: '/api/mind/non-negotiables', schema: 'MindNonNegotiablePatchResponseSchema', note: 'all three actions' },
  // wins + journal
  { method: 'GET', path: '/api/mind/wins', schema: 'MindWinsResponseSchema' },
  { method: 'POST', path: '/api/mind/wins', schema: 'MindWinCreateResponseSchema' },
  { method: 'GET', path: '/api/mind/journal', schema: 'MindJournalResponseSchema' },
  { method: 'POST', path: '/api/mind/journal', schema: 'MindJournalCreateResponseSchema' },
  // sharing + the two read-only summaries
  { method: 'POST', path: '/api/mind/share', schema: 'MindShareResponseSchema', note: '201, and the url is RELATIVE' },
  { method: 'GET', path: '/api/mind/summary', schema: 'MindSummaryResponseSchema', note: "the dashboard's Mindset card" },
  { method: 'GET', path: '/api/becoming/journey', schema: 'BecomingJourneyResponseSchema' },
]

// Deliberately NOT here — and the last test in this file fails if a schema for
// one of them ever appears: /api/mind/content/daily, /api/mind/progress/xp,
// /api/mind/progress/levelup, /api/journal, /api/meditation, /api/sleep. None
// has a live web caller, so nothing would be holding the web to their shape.

const coverage = new Coverage()

/** Which PATCH/POST actions were actually sent. The manifest cannot see these. */
const actionsExercised = new Set<string>()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLUS_MEMBER: ContractMember = {
  id: '6ab0370000000000000f7ee0',
  email: 'plus@np037.contract.test',
  label: 'plus',
  auth: '',
}

/** Already past the ten free Mind sessions — the only way to see the gate. */
const FREE_MEMBER: ContractMember = {
  id: '6ab0370000000000000f7ee1',
  email: 'free@np037.contract.test',
  label: 'free',
  auth: '',
}

const MEMBERS = [PLUS_MEMBER, FREE_MEMBER]

/** FREE_LIMITS['mind-sessions'].limit. Spelled out so a change fails here. */
const MIND_FREE_SESSIONS = 10

const DAY_MS = 86_400_000

/**
 * A `tz` (minutes WEST of UTC) whose local day is GUARANTEED to differ from the
 * UTC day, whatever time this suite runs at.
 *
 * West of UTC before noon, east of it after: either way the local clock is
 * pushed past a midnight. The extra hour of margin means an hour ticking over
 * mid-test cannot turn the two days back into one and make the assertion
 * vacuous.
 */
function dayShiftTz(now: Date = new Date()): number {
  const hour = now.getUTCHours()
  return hour < 12 ? (hour + 2) * 60 : -((25 - hour) * 60)
}

const DAY_SHIFT_TZ = dayShiftTz()

/** `localDateKey(null, tz)` in webapp/lib/dayWindow.ts, as the client sees it. */
function localKey(tz: number, at: number = Date.now()): string {
  return new Date(at - tz * 60_000).toISOString().slice(0, 10)
}

/** The 00:00Z day MARKER a day key is stored under. */
function marker(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`)
}

const TODAY_KEY = localKey(DAY_SHIFT_TZ)
const UTC_TODAY_KEY = new Date().toISOString().slice(0, 10)

/** A plan with every field MindSessionPlanSchema declares actually populated. */
const PLAN: MindSessionPlan = {
  intro: { title: 'Settle, then aim', subtitle: 'Three minutes. One point.' },
  moves: [
    {
      id: 'open-breath',
      kind: 'breath',
      title: 'Bring it down a notch',
      subtitle: 'Long exhales do the work',
      protocolId: 'sigh',
      xp: 5,
      // The adaptive swap: a member who comes in locked-in gets this instead.
      altPositive: {
        id: 'open-amplify',
        kind: 'identity',
        title: 'Spend it on purpose',
        statement: 'I am the person who does the work anyway.',
        source: 'IDENTITY_POOL',
        xp: 5,
      },
    },
    {
      id: 'pick-one',
      kind: 'choice',
      title: 'What gets today?',
      prompt: 'Name the one thing.',
      options: [
        { label: 'The hard thing', response: 'Good. Everything else can wait.' },
        { label: 'The overdue thing' },
      ],
      xp: 5,
    },
    {
      id: 'compose-line',
      kind: 'compose',
      title: 'Finish the line',
      compose: {
        template: 'I am {0} enough to {1} today.',
        blanks: [['steady', 'awake'], ['start', 'finish']],
      },
      xp: 5,
    },
  ],
  rewardXp: 20,
  doneText: 'That is the rep. Go spend it.',
  blueprintId: 'open-one-point/commit',
  openingId: 'stressed',
  cta: { system: 'discipline', reason: 'You named the hard thing — go hold the line on it.' },
}

const SESSION_SEED = 20370914

async function cleanFixtures(): Promise<void> {
  const ids = MEMBERS.map((m) => new mongoose.Types.ObjectId(m.id))
  const stringIds = MEMBERS.map((m) => m.id)
  await User.deleteMany({ $or: [{ _id: { $in: ids } }, { email: { $in: MEMBERS.map((m) => m.email) } }] })
  await Promise.all([
    UserProgress.deleteMany({ userId: { $in: ids } }),
    MindProgress.deleteMany({ userId: { $in: ids } }),
    MindSession.deleteMany({ userId: { $in: ids } }),
    MindJournal.deleteMany({ userId: { $in: ids } }),
    MindNonNegotiable.deleteMany({ userId: { $in: ids } }),
    StateLog.deleteMany({ userId: { $in: ids } }),
    IdentityProfile.deleteMany({ userId: { $in: ids } }),
    Mission.deleteMany({ userId: { $in: ids } }),
    DisciplineChallenge.deleteMany({ userId: { $in: ids } }),
    DailyWin.deleteMany({ userId: { $in: ids } }),
    SharedSession.deleteMany({ owner: { $in: ids } }),
    UserProgress.deleteMany({ userId: { $in: stringIds } }),
  ])
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  // Without this every `allowed` is true and the 403 this ticket types never
  // appears. A test process is its own process; this affects nothing else.
  process.env.ENTITLEMENTS_ENFORCED = '1'

  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanFixtures()

  await User.create({
    _id: new mongoose.Types.ObjectId(PLUS_MEMBER.id),
    email: PLUS_MEMBER.email,
    // Legacy column, `required` on the model; magic-link members never use it.
    password: 'contract-test-unused',
    name: 'Contract Mind Plus',
    tier: 'plus',
    onboardingCompleted: true,
  })
  await User.create({
    _id: new mongoose.Types.ObjectId(FREE_MEMBER.id),
    email: FREE_MEMBER.email,
    password: 'contract-test-unused',
    name: 'Contract Mind Free',
    tier: 'free',
    onboardingCompleted: true,
  })

  for (const member of MEMBERS) {
    member.auth = `Bearer ${await signToken({ userId: member.id, email: member.email })}`
  }

  // The free member has spent the allowance. `completedMainSessions` is the ONE
  // number the paywall may read (never `mainSessionCount`, which carries the
  // intake head start) — see lib/allowances.ts#MILESTONE_COUNTS.
  await MindProgress.create({
    userId: new mongoose.Types.ObjectId(FREE_MEMBER.id),
    completedMainSessions: MIND_FREE_SESSIONS,
    mainSessionCount: MIND_FREE_SESSIONS,
  })

  // The Plus member's history, so the reads below are not all empty arrays:
  //   • two weigh-ins and today's mood, stored as 00:00Z day MARKERS for the
  //     member's LOCAL day — which is what both /api/mind/summary and
  //     lib/becoming/journey read them back as;
  //   • a win six weeks old, so The Becoming has a real first week, an empty
  //     run in the middle that COLLAPSES into one `gap` card, and a live week.
  await UserProgress.create({
    userId: new mongoose.Types.ObjectId(PLUS_MEMBER.id),
    weightHistory: [
      { date: marker(localKey(DAY_SHIFT_TZ, Date.now() - DAY_MS)), weight: 181.2, unit: 'lbs' },
      { date: marker(TODAY_KEY), weight: 180.4, unit: 'lbs' },
    ],
    moodHistory: [{ date: marker(TODAY_KEY), mood: 4 }],
  })
  await DailyWin.create({
    userId: new mongoose.Types.ObjectId(PLUS_MEMBER.id),
    date: marker(localKey(DAY_SHIFT_TZ, Date.now() - 42 * DAY_MS)),
    win: 'Started.',
  })
})

after(async () => {
  await cleanFixtures()
  await mongoose.disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// Self-image — PUT the intake, read it back, then both PATCH actions
// ═══════════════════════════════════════════════════════════════════════════

test('PUT /api/mind/identity matches MindIdentityResponseSchema', async () => {
  const body = {
    currentSelf: 'I start things and drop them.',
    futureSelf: 'I am the person who finishes.',
    primaryObstacle: 'discipline' as const,
    startingPoint: 'stuck' as const,
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindIdentityPutRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindIdentityPUT,
    'PUT',
    '/api/mind/identity',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('PUT', '/api/mind/identity')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'PUT /api/mind/identity',
    schema: MindIdentityResponseSchema,
    body: answer,
    expectKeys: [
      'profile._id',
      'profile.currentSelf',
      'profile.futureSelf',
      'profile.primaryObstacle',
      'profile.startingPoint',
      'profile.onboardingCompleted',
    ],
  })
  const parsed = MindIdentityResponseSchema.parse(answer)
  assert.equal(parsed.profile?.futureSelf, body.futureSelf)
  assert.equal(parsed.profile?.onboardingCompleted, true)
})

test('GET /api/mind/identity matches MindIdentityResponseSchema with evolution + guidance', async () => {
  const { status, body } = await getJson(mindIdentityGET, '/api/mind/identity', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/mind/identity')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/identity',
    schema: MindIdentityResponseSchema,
    body,
    expectKeys: [
      'profile.currentSelf',
      'profile.futureSelf',
      'profile.evolutionScore',
      'evolution.score',
      'evolution.challengesCompleted',
      'evolution.statesLogged',
      'evolution.hasMission',
      'evolution.startingLabel',
      'guidance.section',
      'guidance.reason',
      'guidance.startWith',
      'affirm.streak',
      'affirm.longest',
      'affirm.affirmedToday',
    ],
  })
  const parsed = MindIdentityResponseSchema.parse(body)
  // The obstacle picks the section, and 'stuck' picks the label.
  assert.equal(parsed.guidance?.section, 'discipline')
  assert.equal(parsed.evolution?.startingLabel, 'Breaking through')
  assert.equal(parsed.affirm?.affirmedToday, false)

  // A member with no profile is answered `{ profile: null }` and NOTHING else,
  // which is the reason every other key on this schema is optional.
  const fresh = await getJson(mindIdentityGET, '/api/mind/identity', FREE_MEMBER)
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body))
  assertContract({
    label: 'GET /api/mind/identity (no profile)',
    schema: MindIdentityResponseSchema,
    body: fresh.body,
    expectKeys: ['profile'],
  })
  assert.equal(MindIdentityResponseSchema.parse(fresh.body).profile, null)
})

test('PATCH /api/mind/identity affirm + edit match their schemas', async () => {
  const affirm = { action: 'affirm' as const, tz: DAY_SHIFT_TZ }
  assert.equal(MindIdentityPatchRequestSchema.safeParse(affirm).success, true)

  const affirmed = await sendJson(mindIdentityPATCH, 'PATCH', '/api/mind/identity', PLUS_MEMBER, affirm)
  coverage.mark('PATCH', '/api/mind/identity')
  actionsExercised.add('identity:affirm')

  assert.equal(affirmed.status, 200, JSON.stringify(affirmed.body))
  assertContract({
    label: 'PATCH /api/mind/identity (affirm)',
    schema: MindAffirmResponseSchema,
    body: affirmed.body,
    expectKeys: ['affirm.streak', 'affirm.longest', 'affirm.affirmedToday'],
  })
  const streak = MindAffirmResponseSchema.parse(affirmed.body)
  assert.equal(streak.affirm.streak, 1, 'the first affirmation starts the streak at 1')
  assert.equal(streak.affirm.affirmedToday, true)

  // Idempotent per LOCAL day: a second affirm does not advance it.
  const again = await sendJson(mindIdentityPATCH, 'PATCH', '/api/mind/identity', PLUS_MEMBER, affirm)
  assert.equal(MindAffirmResponseSchema.parse(again.body).affirm.streak, 1)

  // `edit` answers with the SAME `profile` key carrying a two-field projection,
  // which is why MindIdentityProfileSchema requires only the two statements.
  const edit = {
    action: 'edit' as const,
    currentSelf: 'I finish most of what I start.',
    futureSelf: 'I am the person who finishes.',
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindIdentityPatchRequestSchema.safeParse(edit).success, true)
  const edited = await sendJson(mindIdentityPATCH, 'PATCH', '/api/mind/identity', PLUS_MEMBER, edit)
  actionsExercised.add('identity:edit')

  assert.equal(edited.status, 200, JSON.stringify(edited.body))
  assertContract({
    label: 'PATCH /api/mind/identity (edit)',
    schema: MindIdentityResponseSchema,
    body: edited.body,
    expectKeys: ['profile.currentSelf', 'profile.futureSelf'],
  })
  assert.equal(
    MindIdentityResponseSchema.parse(edited.body).profile?.currentSelf,
    edit.currentSelf,
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// Mission — the why, and the momentum streak
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/mind/mission answers `{ mission: null, momentum }` before anything is set', async () => {
  const { status, body } = await getJson(mindMissionGET, '/api/mind/mission', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/mind/mission')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/mission (unset)',
    schema: MindMissionResponseSchema,
    body,
    expectKeys: ['mission', 'momentum.streak', 'momentum.longest', 'momentum.movedToday'],
  })
  const parsed = MindMissionResponseSchema.parse(body)
  assert.equal(parsed.mission, null)
  assert.equal(parsed.momentum?.movedToday, false)
})

test('PUT then PATCH /api/mind/mission match their schemas and build the momentum streak', async () => {
  const body = {
    purpose: 'Be someone my kids copy on purpose.',
    whyItMatters: 'They are watching whether I mean it.',
    dailyAction: 'One hard thing before noon.',
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindMissionPutRequestSchema.safeParse(body).success, true)

  const put = await sendJson(mindMissionPUT, 'PUT', '/api/mind/mission', PLUS_MEMBER, body)
  coverage.mark('PUT', '/api/mind/mission')
  assert.equal(put.status, 200, JSON.stringify(put.body))
  assertContract({
    label: 'PUT /api/mind/mission',
    schema: MindMissionResponseSchema,
    body: put.body,
    expectKeys: [
      'mission._id',
      'mission.purpose',
      'mission.whyItMatters',
      'mission.dailyAction',
      'mission.momentumStreak',
      'mission.longestMomentumStreak',
      'mission.lastMovedKey',
    ],
  })
  assert.equal(MindMissionResponseSchema.parse(put.body).mission?.purpose, body.purpose)

  const move = { action: 'move' as const, tz: DAY_SHIFT_TZ }
  assert.equal(MindMissionMoveRequestSchema.safeParse(move).success, true)
  const patched = await sendJson(mindMissionPATCH, 'PATCH', '/api/mind/mission', PLUS_MEMBER, move)
  coverage.mark('PATCH', '/api/mind/mission')
  actionsExercised.add('mission:move')

  assert.equal(patched.status, 200, JSON.stringify(patched.body))
  assertContract({
    label: 'PATCH /api/mind/mission (move)',
    schema: MindMomentumResponseSchema,
    body: patched.body,
    expectKeys: ['momentum.streak', 'momentum.longest', 'momentum.movedToday'],
  })
  const momentum = MindMomentumResponseSchema.parse(patched.body).momentum
  assert.equal(momentum.streak, 1)
  assert.equal(momentum.movedToday, true)

  // The day is the member's LOCAL day, from `tz` and nothing else.
  const stored = await Mission.findOne({ userId: PLUS_MEMBER.id }).lean<{ lastMovedKey?: string } | null>()
  assert.equal(stored?.lastMovedKey, TODAY_KEY)
  assert.notEqual(TODAY_KEY, UTC_TODAY_KEY, 'the fixture tz must move the day, or this proves nothing')
})

// ═══════════════════════════════════════════════════════════════════════════
// Vision — a BINARY Plus feature. POST/PATCH gate; GET stays open.
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/mind/vision matches MindVisionSaveResponseSchema and completes the vision', async () => {
  const body = {
    habits: 'Up at five, phone in another room.',
    mind: 'Calm under load.',
    body: 'Strong enough to carry anything I own.',
    relationships: 'Present, not just around.',
    environment: 'A room that makes the work obvious.',
    identityStatement: 'I am the person who finishes.',
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindVisionPostRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindVisionPOST,
    'POST',
    '/api/mind/vision',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('POST', '/api/mind/vision')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'POST /api/mind/vision',
    schema: MindVisionSaveResponseSchema,
    body: answer,
    expectKeys: [
      'vision.habits',
      'vision.mind',
      'vision.body',
      'vision.relationships',
      'vision.environment',
      'vision.identityStatement',
      'vision.completedAt',
      'vision.updatedAt',
      'xpGained',
      'xp',
    ],
  })
  const parsed = MindVisionSaveResponseSchema.parse(answer)
  assert.equal(parsed.vision?.identityStatement, body.identityStatement)
  assert.equal(parsed.xpGained, 75, 'a first, complete vision is worth 75')
  // `alignmentHistory` is NOT on this answer: the route writes the vision with
  // dotted `$set` paths, so the subdocument's own default never runs and the
  // key is simply absent until the first align. That is why the schema gives it
  // `.default([])` — a client must read an empty trail, not `undefined`.
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      (answer as { vision: Record<string, unknown> }).vision,
      'alignmentHistory',
    ),
    false,
  )
  assert.deepEqual(parsed.vision?.alignmentHistory, [])
})

test('PATCH /api/mind/vision align, then GET, match their schemas', async () => {
  const align = { action: 'align' as const, score: 4, tz: DAY_SHIFT_TZ }
  assert.equal(MindVisionAlignRequestSchema.safeParse(align).success, true)

  const patched = await sendJson(mindVisionPATCH, 'PATCH', '/api/mind/vision', PLUS_MEMBER, align)
  coverage.mark('PATCH', '/api/mind/vision')
  actionsExercised.add('vision:align')

  assert.equal(patched.status, 200, JSON.stringify(patched.body))
  assertContract({
    label: 'PATCH /api/mind/vision (align)',
    schema: MindVisionAlignResponseSchema,
    body: patched.body,
    expectKeys: ['alignment.avg7', 'alignment.entries7', 'alignment.todayScore', 'alignment.checkedToday'],
  })
  const alignment = MindVisionAlignResponseSchema.parse(patched.body).alignment
  assert.equal(alignment.todayScore, 4)
  assert.equal(alignment.checkedToday, true)
  assert.equal(alignment.entries7, 1)

  const read = await getJson(mindVisionGET, '/api/mind/vision', PLUS_MEMBER, { tz: String(DAY_SHIFT_TZ) })
  coverage.mark('GET', '/api/mind/vision')
  assert.equal(read.status, 200, JSON.stringify(read.body))
  assertContract({
    label: 'GET /api/mind/vision',
    schema: MindVisionResponseSchema,
    body: read.body,
    expectKeys: [
      'vision.identityStatement',
      'vision.alignmentHistory.0.date',
      'vision.alignmentHistory.0.score',
      'alignment.avg7',
      'alignment.checkedToday',
    ],
  })
  const got = MindVisionResponseSchema.parse(read.body)
  // The alignment trail is keyed by the member's LOCAL day.
  assert.equal(got.vision?.alignmentHistory[0]?.date, TODAY_KEY)

  // GET is OPEN to a free member on purpose — the teaser wants the real shape.
  const free = await getJson(mindVisionGET, '/api/mind/vision', FREE_MEMBER, { tz: String(DAY_SHIFT_TZ) })
  assert.equal(free.status, 200, JSON.stringify(free.body))
  assertContract({
    label: 'GET /api/mind/vision (free, unset)',
    schema: MindVisionResponseSchema,
    body: free.body,
    expectKeys: ['vision', 'alignment.avg7'],
  })
  assert.equal(MindVisionResponseSchema.parse(free.body).vision, null)
})

test('POST /api/mind/vision answers a free member with the gate body, naming vision and plus', async () => {
  const { status, body } = await sendJson(mindVisionPOST, 'POST', '/api/mind/vision', FREE_MEMBER, {
    identityStatement: 'Let me in.',
    tz: DAY_SHIFT_TZ,
  })

  assert.equal(status, 403, JSON.stringify(body))
  assertContract({
    label: 'POST /api/mind/vision (free)',
    schema: MindGatePayloadSchema,
    body,
    expectKeys: ['error', 'feature', 'requiresTier'],
  })
  const gate = MindGatePayloadSchema.parse(body)
  assert.equal(gate.feature, 'vision')
  assert.equal(gate.requiresTier, 'plus')
})

// ═══════════════════════════════════════════════════════════════════════════
// The check-in
// ═══════════════════════════════════════════════════════════════════════════

test('POST then GET /api/mind/state match their schemas and carry the FEELING, not just the state', async () => {
  const body = {
    state: 'stressed' as const,
    feeling: 'Overwhelmed',
    note: 'Too many open loops.',
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindStateLogRequestSchema.safeParse(body).success, true)

  const posted = await sendJson(mindStatePOST, 'POST', '/api/mind/state', PLUS_MEMBER, body)
  coverage.mark('POST', '/api/mind/state')

  assert.equal(posted.status, 200, JSON.stringify(posted.body))
  assertContract({
    label: 'POST /api/mind/state',
    schema: MindStateLogResponseSchema,
    body: posted.body,
    expectKeys: [
      'log._id',
      'log.state',
      'log.feeling',
      'log.note',
      'log.timestamp',
      'recommendation.message',
    ],
  })
  const logged = MindStateLogResponseSchema.parse(posted.body)
  assert.equal(logged.log.feeling, 'Overwhelmed')
  // Twenty feelings collapse onto four states, and the reply answers the WORD.
  assert.match(logged.recommendation.message, /Too much at once/)

  const read = await getJson(mindStateGET, '/api/mind/state', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
    limit: '5',
  })
  coverage.mark('GET', '/api/mind/state')

  assert.equal(read.status, 200, JSON.stringify(read.body))
  assertContract({
    label: 'GET /api/mind/state',
    schema: MindStateResponseSchema,
    body: read.body,
    expectKeys: [
      'logs.0.state',
      'logs.0.feeling',
      'logs.0.timestamp',
      // The dashboard's 1–5 mood, seeded for today — the bridge the session
      // opener reads so a member is not asked twice how they feel.
      'todayMood.value',
      'todayMood.label',
      'todayMood.at',
    ],
  })
  const state = MindStateResponseSchema.parse(read.body)
  assert.equal(state.logs.length, 1)
  assert.equal(state.todayMood?.value, 4)
  assert.equal(state.todayMood?.label, 'Pretty good')
})

// ═══════════════════════════════════════════════════════════════════════════
// The session: store it, resume it, finish it — and the 403 on both writes
// ═══════════════════════════════════════════════════════════════════════════

test('PUT /api/mind/session stores the composed plan and stamps the day from `tz`', async () => {
  const body = { seed: SESSION_SEED, plan: PLAN, tz: DAY_SHIFT_TZ }
  assert.equal(MindSessionSaveRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindSessionPUT,
    'PUT',
    '/api/mind/session',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('PUT', '/api/mind/session')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'PUT /api/mind/session',
    schema: MindSessionSaveResponseSchema,
    body: answer,
    expectKeys: ['ok', 'dateKey'],
  })
  const parsed = MindSessionSaveResponseSchema.parse(answer)
  assert.equal(parsed.ok, true)
  // Rule 1: the day comes from `tz`. If it came from the server clock this
  // would be UTC_TODAY_KEY, and the very next GET would call it `new_day`.
  assert.equal(parsed.dateKey, TODAY_KEY)
  assert.notEqual(parsed.dateKey, UTC_TODAY_KEY)
})

test('GET /api/mind/session matches MindSessionStateResponseSchema and hands the SAME session back', async () => {
  const { status, body } = await getJson(mindSessionGET, '/api/mind/session', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/mind/session')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/session (plus)',
    schema: MindSessionStateResponseSchema,
    body,
    expectKeys: [
      'dateKey',
      'completedToday',
      'streak',
      'lastBreathAt',
      'recentKinds',
      'mainSessionAvailable',
      'lastMainSessionAt',
      'nextMainSessionAt',
      'resume',
      'resume.seed',
      // The MindSessionPlan shape, through the resume envelope: this is the
      // whole session the native player would draw.
      'resume.plan.intro.title',
      'resume.plan.intro.subtitle',
      'resume.plan.moves.0.id',
      'resume.plan.moves.0.kind',
      'resume.plan.moves.0.title',
      'resume.plan.moves.0.xp',
      'resume.plan.moves.0.altPositive.kind',
      'resume.plan.moves.1.options.0.label',
      'resume.plan.moves.2.compose.template',
      'resume.plan.rewardXp',
      'resume.plan.openingId',
      'resume.plan.cta.system',
      'resume.plan.cta.reason',
      'resumeDropped',
      'locked',
      'lockReason',
      'requiresTier',
      'sessionsUsed',
      'sessionsLimit',
    ],
  })
  const parsed = MindSessionStateResponseSchema.parse(body)
  assert.equal(parsed.dateKey, TODAY_KEY)
  assert.equal(parsed.completedToday, false)
  assert.equal(parsed.resume?.seed, SESSION_SEED)
  assert.deepEqual(parsed.resume?.plan.moves.map((m) => m.kind), ['breath', 'choice', 'compose'])
  assert.equal(parsed.resumeDropped, null)
  // Rule 5: the two locks are orthogonal, and a Plus member has neither.
  assert.equal(parsed.locked, false)
  assert.equal(parsed.mainSessionAvailable, true)
  assert.equal(parsed.sessionsUsed, 0)
  assert.equal(parsed.sessionsLimit, null, 'uncapped is null, not a limit of zero')
})

test('GET /api/mind/session reports the PLAN WALL to a spent free member', async () => {
  const { status, body } = await getJson(mindSessionGET, '/api/mind/session', FREE_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/session (free, locked)',
    schema: MindSessionStateResponseSchema,
    body,
    expectKeys: ['locked', 'lockReason', 'requiresTier', 'sessionsUsed', 'sessionsLimit'],
  })
  const parsed = MindSessionStateResponseSchema.parse(body)
  assert.equal(parsed.locked, true)
  assert.equal(parsed.lockReason, 'tier')
  assert.equal(parsed.requiresTier, 'plus')
  assert.equal(parsed.sessionsUsed, MIND_FREE_SESSIONS)
  assert.equal(parsed.sessionsLimit, MIND_FREE_SESSIONS)
  // The cooldown is the OTHER thing, and it is untouched by the wall.
  assert.equal(parsed.mainSessionAvailable, true)
})

test('POST /api/mind/session matches MindSessionCompleteResponseSchema and counts one main session', async () => {
  const body = {
    moves: PLAN.moves.map((m) => ({ kind: m.kind })),
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindSessionCompleteRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindSessionPOST,
    'POST',
    '/api/mind/session',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('POST', '/api/mind/session')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'POST /api/mind/session',
    schema: MindSessionCompleteResponseSchema,
    body: answer,
    expectKeys: [
      'completions',
      'counted',
      'trainingMode',
      'xpAwarded',
      'levelXp',
      'level',
      'previousLevel',
      'leveledUp',
      'levelProgress.level',
      'levelProgress.intoLevel',
      'levelProgress.span',
      'levelProgress.pct',
      'levelProgress.xpToNext',
      'chapter',
      'previousChapter',
      'chapterAdvanced',
      'newlyUnlocked',
      'unlockedSystems',
      'currentChapter.id',
      'currentChapter.name',
      'currentChapter.theme',
      'currentChapter.description',
      'currentChapter.systems',
      'mainSessionCount',
      'sessionsIntoChapter.done',
      'sessionsIntoChapter.needed',
      'sessionsIntoChapter.toNext',
      'nextMainSessionAt',
      'xpBank',
      'streak',
      'featureUnlocks',
    ],
  })
  const parsed = MindSessionCompleteResponseSchema.parse(answer)
  assert.equal(parsed.counted, true)
  assert.equal(parsed.trainingMode, false)
  assert.equal(parsed.xpAwarded, 20)
  assert.equal(parsed.completions, 1)
  assert.equal(parsed.mainSessionCount, 1)
  assert.equal(parsed.sessionsIntoChapter.done, 1)
  assert.equal(parsed.chapter, 1)
  assert.equal(parsed.streak, 1)
  // Rule 1 again, on the write that matters most: the completion is stamped
  // with the LOCAL day, which is what the streak is counted in.
  const stored = await MindSession.findOne({ userId: PLUS_MEMBER.id }).lean<{ dateKey: string } | null>()
  assert.equal(stored?.dateKey, TODAY_KEY)
  assert.notEqual(stored?.dateKey, UTC_TODAY_KEY)

  // Finishing it clears the stored copy — otherwise the next Begin would hand
  // the completed session straight back.
  const after = await getJson(mindSessionGET, '/api/mind/session', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  const reread = MindSessionStateResponseSchema.parse(after.body)
  assert.equal(reread.resume, null)
  assert.equal(reread.completedToday, true)
  assert.equal(reread.mainSessionAvailable, false, 'the 20h cooldown is running now')
  assert.ok(typeof reread.nextMainSessionAt === 'number')
})

test('PUT and POST /api/mind/session answer a spent free member with the gate body, naming mind-sessions and plus', async () => {
  // The PUT is the FIRST write of a composed session, so the wall is here as
  // well as at the payoff: gating only the completion walks a locked member
  // through a whole session for nothing.
  const put = await sendJson(mindSessionPUT, 'PUT', '/api/mind/session', FREE_MEMBER, {
    seed: SESSION_SEED,
    plan: PLAN,
    tz: DAY_SHIFT_TZ,
  })
  assert.equal(put.status, 403, JSON.stringify(put.body))
  assertContract({
    label: 'PUT /api/mind/session (free, spent)',
    schema: MindGatePayloadSchema,
    body: put.body,
    expectKeys: ['error', 'feature', 'requiresTier', 'limit', 'remaining', 'resetsAt', 'window'],
  })
  const putGate = MindGatePayloadSchema.parse(put.body)
  assert.equal(putGate.feature, MIND_SESSIONS_FEATURE)
  assert.equal(putGate.feature, 'mind-sessions')
  assert.equal(putGate.requiresTier, 'plus')
  assert.equal(putGate.limit, MIND_FREE_SESSIONS)
  assert.equal(putGate.remaining, 0)
  assert.ok(putGate.error.length > 0, 'the server owns the wording and it is never empty')

  const post = await sendJson(mindSessionPOST, 'POST', '/api/mind/session', FREE_MEMBER, {
    moves: [{ kind: 'breath' }],
    tz: DAY_SHIFT_TZ,
  })
  assert.equal(post.status, 403, JSON.stringify(post.body))
  assertContract({
    label: 'POST /api/mind/session (free, spent)',
    schema: MindGatePayloadSchema,
    body: post.body,
    expectKeys: ['error', 'feature', 'requiresTier', 'limit', 'remaining', 'resetsAt', 'window'],
  })
  const postGate = MindGatePayloadSchema.parse(post.body)
  assert.equal(postGate.feature, 'mind-sessions')
  assert.equal(postGate.requiresTier, 'plus')

  // Both refusals are the SAME body — one branch renders the upsell.
  assert.deepEqual(post.body, put.body)

  // And a refusal writes nothing: no session row, no counted completion.
  assert.equal(await MindSession.countDocuments({ userId: FREE_MEMBER.id }), 0)
})

// ═══════════════════════════════════════════════════════════════════════════
// Progression
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/mind/progress/introduce matches MindIntroduceResponseSchema', async () => {
  const body = { system: 'state-shift', tz: DAY_SHIFT_TZ }
  assert.equal(MindIntroduceRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindIntroducePOST,
    'POST',
    '/api/mind/progress/introduce',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('POST', '/api/mind/progress/introduce')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'POST /api/mind/progress/introduce',
    schema: MindIntroduceResponseSchema,
    body: answer,
    expectKeys: ['introduced', 'introducedSystems'],
  })
  const parsed = MindIntroduceResponseSchema.parse(answer)
  assert.equal(parsed.introduced, true)
  assert.deepEqual(parsed.introducedSystems, ['state-shift'])

  // Idempotent — $addToSet, so a second call is not a second entry.
  const again = await sendJson(mindIntroducePOST, 'POST', '/api/mind/progress/introduce', PLUS_MEMBER, body)
  assert.deepEqual(MindIntroduceResponseSchema.parse(again.body).introducedSystems, ['state-shift'])
})

test('GET /api/mind/progress matches MindProgressResponseSchema', async () => {
  // A chapter unlock in the history, so the array is not empty here and The
  // Becoming below has a real "Chapter 2 opened" day. Entry 0 is the PLACEMENT
  // and is skipped by the journey on purpose.
  await MindProgress.updateOne(
    { userId: PLUS_MEMBER.id },
    {
      $set: {
        chapterHistory: [
          { chapter: 1, unlockedAt: new Date(Date.now() - 42 * DAY_MS) },
          { chapter: 2, unlockedAt: new Date(Date.now() - DAY_MS) },
        ],
      },
    },
  )

  const { status, body } = await getJson(mindProgressGET, '/api/mind/progress', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/mind/progress')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/progress',
    schema: MindProgressResponseSchema,
    body,
    expectKeys: [
      'chapter',
      'xp',
      'xpBank',
      'xpProgress.needed',
      'xpProgress.current',
      'xpProgress.pct',
      'readyToLevelUp',
      'canSelfDeclare',
      'selfDeclaredChapters',
      'unlockedSystems',
      'currentChapter.id',
      'currentChapter.name',
      'currentChapter.systems',
      'nextChapter.id',
      'vision.identityStatement',
      'vision.alignmentHistory.0.date',
      'lastBreathAt',
      'chapterHistory.0.chapter',
      'chapterHistory.0.unlockedAt',
      'currentMilestone',
      'nextMilestone',
      'levelXp',
      'level',
      'levelProgress.level',
      'levelProgress.pct',
      'mainSessionCount',
      'sessionsIntoChapter.done',
      'introducedSystems',
      'mainSessionAvailable',
      'lastMainSessionAt',
      'nextMainSessionAt',
    ],
  })
  const parsed = MindProgressResponseSchema.parse(body)
  // The session above banked 20 XP and one main session.
  assert.equal(parsed.mainSessionCount, 1)
  assert.equal(parsed.levelXp, 20)
  assert.equal(parsed.xpBank, 20)
  assert.equal(parsed.sessionsIntoChapter.done, 1)
  assert.deepEqual(parsed.introducedSystems, ['state-shift'])
  assert.equal(parsed.currentChapter.id, parsed.chapter)
  // Below chapter 5, so the milestone pair is null rather than absent.
  assert.equal(parsed.currentMilestone, null)
  assert.equal(parsed.nextMilestone, null)
  // Rule 5: the cooldown is running, so this is a number, not null.
  assert.equal(parsed.mainSessionAvailable, false)
  assert.ok(typeof parsed.nextMainSessionAt === 'number')
})

// ═══════════════════════════════════════════════════════════════════════════
// Discipline
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/mind/discipline matches MindDisciplineResponseSchema and upserts the day', async () => {
  const { status, body } = await getJson(mindDisciplineGET, '/api/mind/discipline', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/mind/discipline')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/discipline',
    schema: MindDisciplineResponseSchema,
    body,
    expectKeys: ['challenge._id', 'challenge.date', 'challenge.challenge', 'challenge.completed'],
  })
  const parsed = MindDisciplineResponseSchema.parse(body)
  assert.equal(parsed.challenge?.completed, false)
  // The row is stored under the 00:00Z MARKER for the member's LOCAL day.
  assert.equal(parsed.challenge?.date, `${TODAY_KEY}T00:00:00.000Z`)
})

test('POST /api/mind/discipline excuse then complete match MindDisciplineResponseSchema', async () => {
  const excuse = { action: 'excuse' as const, excuse: 'Too tired after a long day.', tz: DAY_SHIFT_TZ }
  assert.equal(MindDisciplineActionRequestSchema.safeParse(excuse).success, true)

  const excused = await sendJson(mindDisciplinePOST, 'POST', '/api/mind/discipline', PLUS_MEMBER, excuse)
  coverage.mark('POST', '/api/mind/discipline')
  actionsExercised.add('discipline:excuse')

  assert.equal(excused.status, 200, JSON.stringify(excused.body))
  assertContract({
    label: 'POST /api/mind/discipline (excuse)',
    schema: MindDisciplineResponseSchema,
    body: excused.body,
    expectKeys: ['challenge.excuse', 'challenge.excuseResponse', 'excuseResponse'],
  })
  const answered = MindDisciplineResponseSchema.parse(excused.body)
  assert.equal(answered.challenge?.excuse, excuse.excuse)
  // The server owns the comeback, and it says it in both places.
  assert.equal(answered.challenge?.excuseResponse, answered.excuseResponse)

  const complete = { action: 'complete' as const, tz: DAY_SHIFT_TZ }
  assert.equal(MindDisciplineActionRequestSchema.safeParse(complete).success, true)
  const completed = await sendJson(mindDisciplinePOST, 'POST', '/api/mind/discipline', PLUS_MEMBER, complete)
  actionsExercised.add('discipline:complete')

  assert.equal(completed.status, 200, JSON.stringify(completed.body))
  assertContract({
    label: 'POST /api/mind/discipline (complete)',
    schema: MindDisciplineResponseSchema,
    body: completed.body,
    expectKeys: ['challenge.completed', 'challenge.completedAt'],
  })
  const done = MindDisciplineResponseSchema.parse(completed.body)
  assert.equal(done.challenge?.completed, true)
  assert.ok(done.challenge?.completedAt)
  // `excuseResponse` is only on the excuse answer — a completion carries none.
  assert.equal(done.excuseResponse, undefined)
})

// ═══════════════════════════════════════════════════════════════════════════
// Non-negotiables — all three PATCH actions
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/mind/non-negotiables matches MindNonNegotiableCreateResponseSchema', async () => {
  const body = { text: 'Phone out of the bedroom.', tz: DAY_SHIFT_TZ }
  assert.equal(MindNonNegotiableCreateRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindNonNegotiablesPOST,
    'POST',
    '/api/mind/non-negotiables',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('POST', '/api/mind/non-negotiables')

  assert.equal(status, 200, JSON.stringify(answer))
  assertContract({
    label: 'POST /api/mind/non-negotiables',
    schema: MindNonNegotiableCreateResponseSchema,
    body: answer,
    expectKeys: ['id', 'text'],
  })
  const created = MindNonNegotiableCreateResponseSchema.parse(answer)
  assert.equal(created.text, body.text)
  // `id`, not `_id`: the route projects rather than handing the document back.
  assert.ok(mongoose.Types.ObjectId.isValid(created.id))
})

test('PATCH /api/mind/non-negotiables check, edit and deactivate all match MindNonNegotiablePatchResponseSchema', async () => {
  const kept = await MindNonNegotiable.findOne({ userId: PLUS_MEMBER.id }).lean<{ _id: unknown } | null>()
  assert.ok(kept, 'the POST above creates the row this acts on')
  const keptId = String(kept._id)

  const doomed = await sendJson(mindNonNegotiablesPOST, 'POST', '/api/mind/non-negotiables', PLUS_MEMBER, {
    text: 'A standard I will drop.',
    tz: DAY_SHIFT_TZ,
  })
  const doomedId = MindNonNegotiableCreateResponseSchema.parse(doomed.body).id

  const check = { id: keptId, action: 'check' as const, tz: DAY_SHIFT_TZ }
  assert.equal(MindNonNegotiablePatchRequestSchema.safeParse(check).success, true)
  const checked = await sendJson(mindNonNegotiablesPATCH, 'PATCH', '/api/mind/non-negotiables', PLUS_MEMBER, check)
  coverage.mark('PATCH', '/api/mind/non-negotiables')
  actionsExercised.add('non-negotiables:check')

  assert.equal(checked.status, 200, JSON.stringify(checked.body))
  assertContract({
    label: 'PATCH /api/mind/non-negotiables (check)',
    schema: MindNonNegotiablePatchResponseSchema,
    body: checked.body,
    expectKeys: ['currentStreak', 'longestStreak', 'checkedToday'],
  })
  const streak = MindNonNegotiablePatchResponseSchema.parse(checked.body)
  assert.equal(streak.currentStreak, 1)
  assert.equal(streak.checkedToday, true)

  const edit = { id: keptId, action: 'edit' as const, text: 'Phone charges in the kitchen.', tz: DAY_SHIFT_TZ }
  assert.equal(MindNonNegotiablePatchRequestSchema.safeParse(edit).success, true)
  const edited = await sendJson(mindNonNegotiablesPATCH, 'PATCH', '/api/mind/non-negotiables', PLUS_MEMBER, edit)
  actionsExercised.add('non-negotiables:edit')
  assert.equal(edited.status, 200, JSON.stringify(edited.body))
  assertContract({
    label: 'PATCH /api/mind/non-negotiables (edit)',
    schema: MindNonNegotiablePatchResponseSchema,
    body: edited.body,
    expectKeys: ['ok'],
  })

  const off = { id: doomedId, action: 'deactivate' as const, tz: DAY_SHIFT_TZ }
  assert.equal(MindNonNegotiablePatchRequestSchema.safeParse(off).success, true)
  const deactivated = await sendJson(mindNonNegotiablesPATCH, 'PATCH', '/api/mind/non-negotiables', PLUS_MEMBER, off)
  actionsExercised.add('non-negotiables:deactivate')
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body))
  assertContract({
    label: 'PATCH /api/mind/non-negotiables (deactivate)',
    schema: MindNonNegotiablePatchResponseSchema,
    body: deactivated.body,
    expectKeys: ['ok'],
  })
})

test('GET /api/mind/non-negotiables matches MindNonNegotiablesResponseSchema and hides the deactivated one', async () => {
  const { status, body } = await getJson(
    mindNonNegotiablesGET,
    '/api/mind/non-negotiables',
    PLUS_MEMBER,
    { tz: String(DAY_SHIFT_TZ) },
  )
  coverage.mark('GET', '/api/mind/non-negotiables')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/non-negotiables',
    schema: MindNonNegotiablesResponseSchema,
    body,
    expectKeys: [
      'items.0.id',
      'items.0.text',
      'items.0.currentStreak',
      'items.0.longestStreak',
      'items.0.checkedToday',
    ],
  })
  const parsed = MindNonNegotiablesResponseSchema.parse(body)
  assert.equal(parsed.items.length, 1, 'only ACTIVE standards come back')
  assert.equal(parsed.items[0]?.text, 'Phone charges in the kitchen.')
  assert.equal(parsed.items[0]?.checkedToday, true)
  assert.equal(parsed.items[0]?.currentStreak, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// Wins + journal
// ═══════════════════════════════════════════════════════════════════════════

test('POST then GET /api/mind/wins match their schemas', async () => {
  const body = { win: 'Did the hard thing before noon.', tz: DAY_SHIFT_TZ }
  assert.equal(MindWinCreateRequestSchema.safeParse(body).success, true)

  const posted = await sendJson(mindWinsPOST, 'POST', '/api/mind/wins', PLUS_MEMBER, body)
  coverage.mark('POST', '/api/mind/wins')

  assert.equal(posted.status, 200, JSON.stringify(posted.body))
  assertContract({
    label: 'POST /api/mind/wins',
    schema: MindWinCreateResponseSchema,
    body: posted.body,
    expectKeys: ['win._id', 'win.date', 'win.win'],
  })
  const created = MindWinCreateResponseSchema.parse(posted.body)
  // The 00:00Z marker for the member's LOCAL day, so an 11pm win does not
  // spill into "tomorrow UTC".
  assert.equal(created.win.date, `${TODAY_KEY}T00:00:00.000Z`)

  const read = await getJson(mindWinsGET, '/api/mind/wins', PLUS_MEMBER, { limit: '5' })
  coverage.mark('GET', '/api/mind/wins')

  assert.equal(read.status, 200, JSON.stringify(read.body))
  assertContract({
    label: 'GET /api/mind/wins',
    schema: MindWinsResponseSchema,
    body: read.body,
    expectKeys: ['wins.0._id', 'wins.0.date', 'wins.0.win', 'wins.0.createdAt'],
  })
  const wins = MindWinsResponseSchema.parse(read.body)
  // Newest first, and the six-week-old fixture win is still there behind it.
  assert.equal(wins.wins[0]?.win, body.win)
  assert.equal(wins.wins.length, 2)
})

test('POST then GET /api/mind/journal match their schemas', async () => {
  const body = {
    system: 'session',
    kind: 'protocol',
    title: 'Settle, then aim',
    lines: [{ prompt: 'What gets today?', answer: 'The hard thing.' }],
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindJournalCreateRequestSchema.safeParse(body).success, true)

  const posted = await sendJson(mindJournalPOST, 'POST', '/api/mind/journal', PLUS_MEMBER, body)
  coverage.mark('POST', '/api/mind/journal')

  assert.equal(posted.status, 200, JSON.stringify(posted.body))
  assertContract({
    label: 'POST /api/mind/journal',
    schema: MindJournalCreateResponseSchema,
    body: posted.body,
    expectKeys: ['saved', 'id'],
  })
  assert.equal(MindJournalCreateResponseSchema.parse(posted.body).saved, true)

  const read = await getJson(mindJournalGET, '/api/mind/journal', PLUS_MEMBER, {
    system: 'session',
    limit: '10',
  })
  coverage.mark('GET', '/api/mind/journal')

  assert.equal(read.status, 200, JSON.stringify(read.body))
  assertContract({
    label: 'GET /api/mind/journal',
    schema: MindJournalResponseSchema,
    body: read.body,
    expectKeys: [
      'entries.0._id',
      'entries.0.system',
      'entries.0.kind',
      'entries.0.title',
      'entries.0.lines.0.prompt',
      'entries.0.lines.0.answer',
      'entries.0.createdAt',
      'counts',
    ],
  })
  const parsed = MindJournalResponseSchema.parse(read.body)
  assert.equal(parsed.entries.length, 1)
  assert.deepEqual(parsed.counts, { protocol: 1 })
})

// ═══════════════════════════════════════════════════════════════════════════
// Sharing
// ═══════════════════════════════════════════════════════════════════════════

test('POST /api/mind/share matches MindShareResponseSchema and answers a RELATIVE url', async () => {
  const body = {
    kind: 'session' as const,
    title: 'Settle, then aim',
    description: 'The one I ran this morning.',
    sessions: [{ title: 'Morning', plan: PLAN }],
    tz: DAY_SHIFT_TZ,
  }
  assert.equal(MindShareRequestSchema.safeParse(body).success, true)

  const { status, body: answer } = await sendJson(
    mindSharePOST,
    'POST',
    '/api/mind/share',
    PLUS_MEMBER,
    body,
  )
  coverage.mark('POST', '/api/mind/share')

  assert.equal(status, 201, JSON.stringify(answer))
  assertContract({
    label: 'POST /api/mind/share',
    schema: MindShareResponseSchema,
    body: answer,
    expectKeys: ['token', 'url'],
  })
  const parsed = MindShareResponseSchema.parse(answer)
  assert.ok(parsed.token.length > 0)
  assert.equal(parsed.url, `/share/mind/${parsed.token}`)
  // A relative path, not an absolute URL: native has to map it to a route.
  assert.ok(parsed.url.startsWith('/'))

  // A single `{ plan }` is the other accepted shape, and the request schema
  // takes both — the route normalises them.
  assert.equal(MindShareRequestSchema.safeParse({ plan: PLAN, tz: DAY_SHIFT_TZ }).success, true)
})

// ═══════════════════════════════════════════════════════════════════════════
// The two read-only summaries
// ═══════════════════════════════════════════════════════════════════════════

test('GET /api/mind/summary matches MindSummaryResponseSchema', async () => {
  const { status, body } = await getJson(mindSummaryGET, '/api/mind/summary', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/mind/summary')

  assert.equal(status, 200, JSON.stringify(body))
  assertContract({
    label: 'GET /api/mind/summary',
    schema: MindSummaryResponseSchema,
    body,
    expectKeys: [
      'todayKey',
      'level',
      'levelPct',
      'chapter',
      'chapterName',
      'sessionsIntoChapter',
      'sessionsPerChapter',
      'sessionDoneToday',
      'mainSessionAvailable',
      'sessionsLast7Days',
      'moodCheckinsLast7Days',
      'todayMood',
      'lastState.state',
      'lastState.feeling',
      'lastState.at',
    ],
  })
  const parsed = MindSummaryResponseSchema.parse(body)
  assert.equal(parsed.todayKey, TODAY_KEY)
  assert.equal(parsed.sessionDoneToday, true)
  assert.equal(parsed.sessionsLast7Days, 1)
  assert.equal(parsed.sessionsPerChapter, 10)
  assert.equal(parsed.sessionsIntoChapter, 1)
  assert.equal(parsed.moodCheckinsLast7Days, 1)
  assert.equal(parsed.todayMood, 4)
  assert.equal(parsed.lastState?.state, 'stressed')
  assert.equal(parsed.lastState?.feeling, 'Overwhelmed')

  // The cheap read must AGREE with the expensive one — the dashboard card and
  // the Mind hub are the same two numbers, derived twice.
  const progress = await getJson(mindProgressGET, '/api/mind/progress', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  const full = MindProgressResponseSchema.parse(progress.body)
  assert.equal(parsed.level, full.level)
  assert.equal(parsed.chapter, full.chapter)
  assert.equal(parsed.sessionsIntoChapter, full.sessionsIntoChapter.done)
  assert.equal(parsed.mainSessionAvailable, full.mainSessionAvailable)
})

test('GET /api/becoming/journey matches BecomingJourneyResponseSchema', async () => {
  const { status, body } = await getJson(becomingJourneyGET, '/api/becoming/journey', PLUS_MEMBER, {
    tz: String(DAY_SHIFT_TZ),
  })
  coverage.mark('GET', '/api/becoming/journey')

  assert.equal(status, 200, JSON.stringify(body))
  const parsed = BecomingJourneyResponseSchema.parse(body)
  const live = parsed.weeks[parsed.weeks.length - 1]
  assert.ok(live, 'there is always a live week')

  assertContract({
    label: 'GET /api/becoming/journey',
    schema: BecomingJourneyResponseSchema,
    body,
    expectKeys: [
      'todayKey',
      'identity',
      'firstActivity',
      'unit',
      'target.weight',
      'target.direction',
      'target.pace',
      'target.eta',
      'weeklyTarget',
      'weeks',
      'becomingScore',
      'chapter',
      'weights.0.day',
      'weights.0.value',
      // The live week, which is the card the member lands on.
      `weeks.${parsed.weeks.length - 1}.index`,
      `weeks.${parsed.weeks.length - 1}.weekKey`,
      `weeks.${parsed.weeks.length - 1}.label`,
      `weeks.${parsed.weeks.length - 1}.isCurrent`,
      `weeks.${parsed.weeks.length - 1}.isFirst`,
      `weeks.${parsed.weeks.length - 1}.daysElapsed`,
      `weeks.${parsed.weeks.length - 1}.score`,
      `weeks.${parsed.weeks.length - 1}.step`,
      `weeks.${parsed.weeks.length - 1}.altitude`,
      `weeks.${parsed.weeks.length - 1}.subject`,
      `weeks.${parsed.weeks.length - 1}.days.0.key`,
      `weeks.${parsed.weeks.length - 1}.days.0.workout`,
      `weeks.${parsed.weeks.length - 1}.days.0.workoutCount`,
      `weeks.${parsed.weeks.length - 1}.days.0.food`,
      `weeks.${parsed.weeks.length - 1}.days.0.mind`,
      `weeks.${parsed.weeks.length - 1}.days.0.mindSession`,
      `weeks.${parsed.weeks.length - 1}.days.0.future`,
      `weeks.${parsed.weeks.length - 1}.uses.training`,
      `weeks.${parsed.weeks.length - 1}.uses.fuel`,
      `weeks.${parsed.weeks.length - 1}.uses.mind`,
      `weeks.${parsed.weeks.length - 1}.uses.mindMode`,
      `weeks.${parsed.weeks.length - 1}.mind.sessions`,
      `weeks.${parsed.weeks.length - 1}.mind.moodDays`,
      `weeks.${parsed.weeks.length - 1}.mind.dominant`,
      `weeks.${parsed.weeks.length - 1}.mind.wins`,
      `weeks.${parsed.weeks.length - 1}.mind.chapterUnlocked`,
      `weeks.${parsed.weeks.length - 1}.nutrition.logDays`,
      `weeks.${parsed.weeks.length - 1}.nutrition.proteinDays`,
      `weeks.${parsed.weeks.length - 1}.nutrition.avgCalories`,
      `weeks.${parsed.weeks.length - 1}.nutrition.weightStart`,
      `weeks.${parsed.weeks.length - 1}.nutrition.weightEnd`,
      `weeks.${parsed.weeks.length - 1}.nutrition.delta`,
      `weeks.${parsed.weeks.length - 1}.training.workouts`,
      `weeks.${parsed.weeks.length - 1}.training.target`,
      `weeks.${parsed.weeks.length - 1}.training.hit`,
      `weeks.${parsed.weeks.length - 1}.training.prs`,
      `weeks.${parsed.weeks.length - 1}.training.prCount`,
      `weeks.${parsed.weeks.length - 1}.headline`,
      `weeks.${parsed.weeks.length - 1}.sub`,
      `weeks.${parsed.weeks.length - 1}.said`,
      `weeks.${parsed.weeks.length - 1}.tags`,
    ],
  })

  // Rule 1: every date on this payload is a LOCAL day key, from `tz`.
  assert.equal(parsed.todayKey, TODAY_KEY)
  assert.notEqual(parsed.todayKey, UTC_TODAY_KEY)
  assert.equal(parsed.unit, 'lbs')
  assert.equal(parsed.identity, 'I am the person who finishes.')
  assert.equal(parsed.becomingScore, 20, 'MindProgress.xpBank, banked by the session above')
  assert.match(parsed.firstActivity ?? '', /^\d{4}-\d{2}-\d{2}$/)

  // Rule 2: oldest first, and today is on the LAST week.
  assert.ok(parsed.weeks.length >= 2)
  assert.equal(live.isCurrent, true)
  assert.deepEqual(
    [...parsed.weeks].map((w) => w.weekKey).sort(),
    parsed.weeks.map((w) => w.weekKey),
  )
  assert.deepEqual(parsed.weeks.map((w) => w.index), parsed.weeks.map((_, i) => i))
  assert.ok(live.days.some((d) => d.key === TODAY_KEY))
  assert.equal(live.mind.sessions, 1, 'the completion above is this week')
  assert.equal(live.mind.chapterUnlocked, 2, 'the seeded chapter-2 unlock is this week')
  assert.ok(live.mind.wins.includes('Did the hard thing before noon.'))

  // Rule 2, the part a client must not guess at: a run of empty weeks collapses
  // into ONE card carrying `gap`, so the indexes are not contiguous weeks.
  const gapped = parsed.weeks.find((w) => w.gap)
  assert.ok(gapped?.gap, 'the six-week-old fixture win leaves an empty run to collapse')
  assert.ok(gapped.gap.weeks >= 3)
  assert.match(gapped.gap.fromKey, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(gapped.gap.toKey, /^\d{4}-\d{2}-\d{2}$/)

  // The weigh-ins, by local day key and in the member's own unit.
  assert.equal(parsed.weights.length, 2)
  assert.equal(parsed.weights[1]?.day, TODAY_KEY)
  assert.equal(parsed.weights[1]?.value, 180.4)

  // `next` carries the WHOLE suggestion, severity included — the live card
  // ranks the two pillars against each other and cannot do that from copy.
  if (parsed.next) {
    assertContract({
      label: 'GET /api/becoming/journey (next)',
      schema: BecomingJourneyResponseSchema,
      body,
      expectKeys: [
        'next.nutrition.key',
        'next.nutrition.title',
        'next.nutrition.sub',
        'next.nutrition.severity',
        'next.nutrition.url',
        'next.training.key',
        'next.training.severity',
        'next.training.url',
      ],
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// The coverage gates. Keep these last.
// ═══════════════════════════════════════════════════════════════════════════

test('every route NP-037 covers was actually called with its schema', () => {
  assertEveryRouteCovered(NP037_ROUTES, coverage)
  // The manifest is not allowed to shrink quietly.
  assert.equal(NP037_ROUTES.length, 28)
  assert.equal(coverage.list().length, 28)
})

test('every action behind a shared route was actually sent', () => {
  // One manifest entry covers PATCH /api/mind/identity, PATCH
  // /api/mind/non-negotiables and POST /api/mind/discipline, so without this a
  // single action would pass for coverage of all of them.
  const required = [
    'identity:affirm',
    'identity:edit',
    'mission:move',
    'vision:align',
    'discipline:excuse',
    'discipline:complete',
    'non-negotiables:check',
    'non-negotiables:edit',
    'non-negotiables:deactivate',
  ]
  assert.deepEqual(
    required.filter((action) => !actionsExercised.has(action)),
    [],
    'these actions have a request schema that no test sends',
  )
})

test('the legacy journal, meditation, sleep and daily-content routes have NO schema', () => {
  // A schema for a route nothing calls is worse than no schema: it reads as a
  // supported surface, native builds a screen on it, and nobody is holding the
  // web to it because the web does not use it either.
  const src = nodePath.join(__dirname, '..', '..', '..', '..', 'shared', 'api-client', 'src')
  assert.ok(fs.existsSync(src), 'shared/api-client/src has moved — update this test with it')

  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) files.push(full)
    }
  }
  walk(src)
  assert.ok(files.length > 5)

  const exported = new Map<string, string>()
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(
      /^export\s+(?:const|function|type|interface|class)\s+([A-Za-z0-9_]+)/gm,
    )) {
      exported.set(match[1]!, nodePath.relative(src, file))
    }
  }
  // The names that would exist if somebody typed one of these surfaces.
  const forbidden = /^(Meditation|Sleep|DailyContent|MindDailyContent|MindContentDaily|MindXp(?:Award|Grant)|MindLevelUp|JournalEntry|JournalResponse)/
  const offenders = [...exported].filter(([name]) => forbidden.test(name))
  assert.deepEqual(
    offenders,
    [],
    'a schema appeared for a route with no live web caller — see the tail of shared/api-client/src/schemas/mind.ts',
  )

  // `Journal` is only ever spelled with the Mind prefix here: /api/mind/journal
  // is in scope, the legacy /api/journal is not.
  for (const [name] of exported) {
    if (name.includes('Journal')) {
      assert.ok(name.startsWith('Mind'), `${name} must be MindJournal* — /api/journal has no schema`)
    }
  }

  // And the paths themselves appear NOWHERE but the documented exclusion list.
  assert.deepEqual(
    [...MIND_ROUTES_WITHOUT_SCHEMAS].sort(),
    [
      '/api/journal',
      '/api/meditation',
      '/api/mind/content/daily',
      '/api/mind/progress/levelup',
      '/api/mind/progress/xp',
      '/api/sleep',
    ],
  )
  for (const route of MIND_ROUTES_WITHOUT_SCHEMAS) {
    const carriers = files.filter((file) => fs.readFileSync(file, 'utf8').includes(route))
    assert.deepEqual(
      carriers.map((file) => nodePath.relative(src, file)),
      ['schemas/mind.ts'],
      `${route} is referenced outside the exclusion list in schemas/mind.ts`,
    )
  }

  // The plan shape the card names is exported and reachable.
  assert.ok(MindSessionPlanSchema.safeParse(PLAN).success)
})
