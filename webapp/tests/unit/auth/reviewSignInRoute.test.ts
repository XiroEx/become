// Run with: npm run test:file tests/unit/auth/reviewSignInRoute.test.ts
//
// THE REVIEWER DEMO SIGN-IN, END TO END, through the real route handler and
// the real (loopback, disposable) database — because the thing that matters is
// not "the decision function said no", it is "the response was a 403 and no
// session came out of it".
//
// tests/unit/auth/reviewSignIn.test.ts pins the RULES with no database. This
// file pins what the route does with them:
//
//   • a correct code for the demo account answers a real session, sets the
//     cookie, and leaves behind a seeded Plus account;
//   • THE SAME CODE AIMED AT A REAL MEMBER IS REFUSED, and that member's row
//     is untouched — the config names an address and config can be wrong, so
//     the flag on the row is the thing that decides;
//   • a wrong code is refused;
//   • the fifth wrong guess is the last one: the sixth is a 429 with a
//     Retry-After, and even the CORRECT code is refused while the window
//     stands;
//   • a successful sign-in hands the budget back;
//   • with the switch off, the correct code answers 404.
//
// The config is read through lib/runtimeConfig, which under NODE_ENV=test
// resolves nothing from the secret store and falls back to the environment —
// so these tests set REVIEW_* and reset the cache to move the switch.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose, { Types } from 'mongoose'

import { POST as REVIEW_SIGN_IN } from '../../../app/api/auth/review-sign-in/route'
import User from '../../../models/User'
import UserProgress from '../../../models/UserProgress'
import MindProgress from '../../../models/MindProgress'
import MealLog from '../../../models/MealLog'
import Schedule from '../../../models/Schedule'
import Program from '../../../models/Program'
import ReviewSignInAttempt from '../../../models/ReviewSignInAttempt'
import { verifyToken } from '../../../lib/auth'
import { __resetRuntimeConfigForTests } from '../../../lib/runtimeConfig'
import { REVIEW_MAX_ATTEMPTS } from '../../../lib/reviewSignIn'

const DOMAIN = 'review-signin-route.test'
const DEMO_EMAIL = `app-review@${DOMAIN}`
const MEMBER_EMAIL = `real-member@${DOMAIN}`
const CODE = 'become-review-2026-a1b2'
const PROGRAM_ID = 'review-route-fixture-program'

/** A fresh address per test, so one test's rate limit is not another's. */
let callerIp = '203.0.113.1'

function setConfig(opts: { enabled?: boolean; email?: string; code?: string } = {}) {
  const { enabled = true, email = DEMO_EMAIL, code = CODE } = opts
  process.env.REVIEW_SIGN_IN_ENABLED = enabled ? 'true' : 'false'
  process.env.REVIEW_DEMO_EMAIL = email
  process.env.REVIEW_DEMO_CODE = code
  // The route asks for a config no older than a minute; a test cannot wait a
  // minute, so the cache is dropped instead.
  __resetRuntimeConfigForTests()
}

function request(body: unknown, ip = callerIp) {
  return new Request('http://localhost/api/auth/review-sign-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `${ip}, 10.0.0.1`,
    },
    body: JSON.stringify(body),
  })
}

async function attempt(body: unknown, ip = callerIp) {
  const res = await REVIEW_SIGN_IN(request(body, ip))
  const json = await res.json().catch(() => ({}))
  return { res, body: json as Record<string, unknown> }
}

async function cleanup() {
  const users = await User.find({ email: new RegExp(`@${DOMAIN}$`) }, { _id: 1 }).lean()
  const ids = users.map((u) => u._id)
  await Promise.all([
    User.deleteMany({ email: new RegExp(`@${DOMAIN}$`) }),
    UserProgress.deleteMany({ userId: { $in: ids } }),
    MindProgress.deleteMany({ userId: { $in: ids } }),
    MealLog.deleteMany({ user: { $in: ids } }),
    Schedule.deleteMany({ userId: { $in: ids } }),
    ReviewSignInAttempt.deleteMany({}),
  ])
}

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
  await cleanup()
  // A catalogue program for the demo account to be part way through. Deleted
  // again in `after`, the same way the contract fixtures are.
  await Program.deleteOne({ program_id: PROGRAM_ID })
  await Program.create({
    program_id: PROGRAM_ID,
    name: 'Review Fixture Strength',
    duration_weeks: 8,
    training_days_per_week: 3,
    goal: 'Build strength',
    target_user: 'Intermediate',
    phases: [
      {
        phase: '1',
        weeks: '1-4',
        focus: 'Base',
        workouts: [
          { day: 'Day 1', title: 'Upper', exercises: [] },
          { day: 'Day 2', title: 'Lower', exercises: [] },
          { day: 'Day 3', title: 'Full', exercises: [] },
        ],
      },
    ],
  })
})

after(async () => {
  await cleanup()
  await Program.deleteOne({ program_id: PROGRAM_ID })
  delete process.env.REVIEW_SIGN_IN_ENABLED
  delete process.env.REVIEW_DEMO_EMAIL
  delete process.env.REVIEW_DEMO_CODE
  __resetRuntimeConfigForTests()
  await mongoose.disconnect()
})

beforeEach(async () => {
  await ReviewSignInAttempt.deleteMany({})
  callerIp = `203.0.113.${Math.floor(Math.random() * 250) + 2}`
  setConfig()
})

// ─── The demo account gets in ────────────────────────────────────────────────

test('the review code signs the demo account in, and seeds it on Plus', async () => {
  const { res, body } = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(res.status, 200, JSON.stringify(body))

  // A real session, not a stub.
  const token = String(body.token)
  const claims = await verifyToken(token)
  assert.equal(claims.email, DEMO_EMAIL)
  assert.ok(claims.userId)
  assert.equal(claims.scope, undefined, 'a review session must be an ordinary session')

  // And the cookie the web app relies on (middleware gates /dashboard on it).
  const cookie = res.headers.get('set-cookie') ?? ''
  assert.match(cookie, /auth_token=/)
  assert.match(cookie, /HttpOnly/)

  const user = await User.findOne({ email: DEMO_EMAIL })
    .lean<({ _id: Types.ObjectId } & Record<string, unknown>) | null>()
  assert.ok(user, 'the demo account was not created')
  assert.equal(user!.isReviewAccount, true, 'the row is missing the flag the door checks')
  assert.equal(user!.tier, 'plus', 'a reviewer cannot see a Plus surface without Plus')
  assert.equal(user!.onboardingCompleted, true)
  assert.equal(user!.role, 'user')

  // Believable data: meals, a streak, Mind progress, a program in progress.
  const uid = user!._id
  const [meals, progress, mind, schedules] = await Promise.all([
    MealLog.countDocuments({ user: uid }),
    UserProgress.findOne({ userId: uid }).lean<Record<string, unknown> | null>(),
    MindProgress.findOne({ userId: uid }).lean<Record<string, unknown> | null>(),
    Schedule.find({ userId: uid }).lean<Record<string, unknown>[]>(),
  ])
  assert.ok(meals > 20, `only ${meals} meal logs were seeded`)
  assert.ok(progress, 'no UserProgress was seeded')
  assert.ok((progress!.workoutLogs as unknown[]).length > 0, 'no logged workouts')
  assert.ok((progress!.weightHistory as unknown[]).length > 0, 'no weigh-ins')
  assert.ok((progress!.streakDays as number) > 0, 'no streak')
  assert.ok(mind, 'no Mind progress was seeded')
  assert.equal(mind!.chapter, 2)
  const active = progress!.activePrograms as { programId: string; status: string }[]
  assert.equal(active.length, 1, 'the demo account is not part way through a program')
  assert.equal(active[0].status, 'in-progress')
  assert.equal(schedules.length, 1, 'the program in progress has no schedule')
  assert.equal(schedules[0].programId, active[0].programId)
})

test('signing in twice is idempotent — one account, no duplicate data', async () => {
  const first = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(first.res.status, 200)
  const mealsAfterFirst = await MealLog.countDocuments({})
  const second = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(second.res.status, 200)

  assert.equal(await User.countDocuments({ email: DEMO_EMAIL }), 1)
  assert.equal(
    await MealLog.countDocuments({}),
    mealsAfterFirst,
    'the second sign-in duplicated the seeded meals',
  )
})

test('a reviewer who deletes the demo account does not brick it for the next one', async () => {
  // Apple checks account deletion BY HAND, so a reviewer WILL press it. That
  // leaves the row soft-deleted; without the cancel below, the next review
  // sign-in would land on the restore screen with no way past it.
  const first = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(first.res.status, 200)
  const demo = await User.findOne({ email: DEMO_EMAIL }, { _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>()
  const uid = demo!._id
  await User.updateOne(
    { _id: uid },
    {
      $set: {
        deletion: {
          requestedAt: new Date(),
          purgeAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          requestedFrom: 'ios',
        },
      },
    },
  )

  const again = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(again.res.status, 200)
  const after = await User.findById(uid).lean<Record<string, unknown> | null>()
  assert.equal(after!.deletion, undefined, 'the demo account is still pending deletion')
})

// ─── It is for one account only ──────────────────────────────────────────────

test('the code cannot open a real member\'s account, even when config names it', async () => {
  const member = await User.create({
    name: 'Real Member',
    email: MEMBER_EMAIL,
    password: 'magic-link-auth-no-password',
    tier: 'free',
  })
  const before = await User.findById(member._id).lean<Record<string, unknown> | null>()

  // The misconfiguration this guards: review.email pointed at a member.
  setConfig({ email: MEMBER_EMAIL })
  const { res, body } = await attempt({ email: MEMBER_EMAIL, code: CODE })

  assert.equal(res.status, 403, 'a real member was signed in by the review code')
  assert.equal(body.token, undefined, 'a session was minted for a real member')
  assert.equal(res.headers.get('set-cookie'), null)

  const after = await User.findById(member._id).lean<Record<string, unknown> | null>()
  assert.equal(after!.tier, 'free', "the member's tier was rewritten")
  assert.equal(after!.isReviewAccount, undefined, 'the member was flagged as a demo account')
  assert.equal(after!.name, before!.name)
  assert.equal(await MealLog.countDocuments({ user: member._id }), 0, 'seeded over a member')
})

test('the code is refused for every address that is not the demo account', async () => {
  for (const email of [`someone-else@${DOMAIN}`, `APP-REVIEW@${DOMAIN}.evil.test`]) {
    const { res, body } = await attempt({ email, code: CODE })
    assert.equal(res.status, 403, `${email} got in`)
    assert.equal(body.error, 'invalid_review_code')
    assert.equal(body.token, undefined)
    assert.equal(await User.countDocuments({ email }), 0, 'an account was created for it')
  }
})

// ─── The wrong code ──────────────────────────────────────────────────────────

test('a wrong code is refused, with the same answer as a wrong account', async () => {
  const wrongCode = await attempt({ email: DEMO_EMAIL, code: 'not-the-review-code' })
  const wrongAccount = await attempt({ email: `nobody@${DOMAIN}`, code: CODE })

  assert.equal(wrongCode.res.status, 403)
  assert.equal(wrongCode.body.token, undefined)
  assert.equal(wrongCode.res.status, wrongAccount.res.status)
  assert.deepEqual(wrongCode.body, wrongAccount.body, 'the refusals can be told apart')
})

test('an empty body is a 400 and costs nothing', async () => {
  const { res } = await attempt({})
  assert.equal(res.status, 400)
  assert.equal(await ReviewSignInAttempt.countDocuments({}), 0, 'a malformed body spent a try')
})

// ─── The rate limit ──────────────────────────────────────────────────────────

test('guessing is rate limited, and the limit outranks the correct code', async () => {
  for (let i = 0; i < REVIEW_MAX_ATTEMPTS; i++) {
    const { res } = await attempt({ email: DEMO_EMAIL, code: `wrong-guess-${i}` })
    assert.equal(res.status, 403, `guess ${i + 1} was not refused`)
  }

  const blocked = await attempt({ email: DEMO_EMAIL, code: 'wrong-guess-again' })
  assert.equal(blocked.res.status, 429, 'the budget is not enforced')
  assert.equal(blocked.body.error, 'rate_limited')
  const retryAfter = Number(blocked.res.headers.get('retry-after'))
  assert.ok(retryAfter >= 1, 'no Retry-After on the refusal')

  // Even the right code, from the same caller, while the window stands.
  const correct = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(correct.res.status, 429, 'the limit let the right code through')
  assert.equal(correct.body.token, undefined)
})

test('the limit follows the address as well as the email', async () => {
  for (let i = 0; i < REVIEW_MAX_ATTEMPTS; i++) {
    // A different address every time — only the email key is shared.
    const { res } = await attempt({ email: DEMO_EMAIL, code: `spray-${i}` }, `198.51.100.${i + 1}`)
    assert.equal(res.status, 403)
  }
  const blocked = await attempt({ email: DEMO_EMAIL, code: 'spray-last' }, '198.51.100.99')
  assert.equal(blocked.res.status, 429, 'rotating addresses walked past the email limit')

  // And the other way round: one address, many addresses tried.
  await ReviewSignInAttempt.deleteMany({})
  for (let i = 0; i < REVIEW_MAX_ATTEMPTS; i++) {
    const { res } = await attempt({ email: `guess-${i}@${DOMAIN}`, code: CODE }, '198.51.100.200')
    assert.equal(res.status, 403)
  }
  const blockedByIp = await attempt(
    { email: `guess-last@${DOMAIN}`, code: CODE },
    '198.51.100.200',
  )
  assert.equal(blockedByIp.res.status, 429, 'one address could try unlimited addresses')
})

test('a successful sign-in hands the budget back', async () => {
  for (let i = 0; i < REVIEW_MAX_ATTEMPTS - 1; i++) {
    await attempt({ email: DEMO_EMAIL, code: `fumble-${i}` })
  }
  const granted = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(granted.res.status, 200)
  assert.equal(
    await ReviewSignInAttempt.countDocuments({}),
    0,
    'a reviewer who fumbled the code once is locked out of their second device',
  )
})

// ─── The switch ──────────────────────────────────────────────────────────────

test('the correct code is refused when the door is switched off', async () => {
  setConfig({ enabled: false })
  const { res, body } = await attempt({ email: DEMO_EMAIL, code: CODE })
  assert.equal(res.status, 404)
  assert.equal(body.token, undefined)
  assert.equal(res.headers.get('set-cookie'), null)
})

test('an unconfigured door is a shut door', async () => {
  for (const config of [{ code: '' }, { email: '' }, { code: 'short' }]) {
    setConfig(config)
    const { res } = await attempt({ email: DEMO_EMAIL, code: CODE })
    assert.equal(res.status, 404, `${JSON.stringify(config)} left the door open`)
  }
})
