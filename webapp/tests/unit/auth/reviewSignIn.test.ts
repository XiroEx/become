// Run with: npm run test:file tests/unit/auth/reviewSignIn.test.ts
//
// THE REVIEWER DEMO SIGN-IN — the one door into a passwordless app that is not
// a magic link, and therefore the one that has to be nailed down.
//
// Apple and Google hand the build to a person who must sign in and who cannot
// read the inbox a magic link lands in (Review Guideline 2.1). So one
// designated demo account can be opened with a fixed code from the runtime
// config, typed on the normal sign-in screen. Four things are asserted here,
// because each of them is a way this feature turns into an incident:
//
//   1. THE CODE IS FOR ONE ACCOUNT. A real code aimed at any other address is
//      refused — and refused IDENTICALLY to a wrong code, so the door is not
//      also an oracle for "which address is the demo account?".
//   2. A WRONG CODE IS REFUSED, and guessing is rate limited: the limit is
//      checked BEFORE either comparison, so a locked-out caller learns nothing.
//   3. IT CAN BE SWITCHED OFF FROM CONFIG. Off is the DEFAULT; a config with a
//      missing or too-short code counts as off; and the route reads the config
//      with a max age, so a flip needs no deploy and no restart.
//   4. IT IS REACHABLE ON ALL THREE SURFACES — the web form and both store
//      builds POST the same path. That is a fact about two codebases, so the
//      Expo source is read as text here, the way
//      tests/unit/account/storeReadiness.test.tsx reads it.
//
// No database and no network: the rules are a pure module on purpose.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  REVIEW_ATTEMPT_WINDOW_MS,
  REVIEW_CODE_MIN_LENGTH,
  REVIEW_CONFIG_MAX_AGE_MS,
  REVIEW_DISABLED_MESSAGE,
  REVIEW_INVALID_MESSAGE,
  REVIEW_MAX_ATTEMPTS,
  REVIEW_SIGN_IN_PATH,
  clientAddressFromHeaders,
  constantTimeEquals,
  decideReviewSignIn,
  normalizeReviewEmail,
  resolveReviewAccount,
  type ReviewAccountConfig,
} from '../../../lib/reviewSignIn'
import {
  REVIEW_ACCOUNT_NAME,
  SEED_ACTIVITY_DAYS,
  SEED_STREAK_DAYS,
  REVIEW_TIMEZONE,
  reviewActivityDays,
  reviewMealLogs,
  reviewMoodHistory,
  reviewUserFields,
  reviewWeightHistory,
  reviewWorkoutLogs,
  reviewSchedule,
  reviewTrainingDayKeys,
  reviewNutritionGoal,
  reviewIdentityProfile,
  localInstant,
  dayMarker,
} from '../../../lib/reviewSeed'
import {
  dayStreak,
  workoutOrRestDays,
  dayRange,
  intersectDays,
  shiftDay,
  lostWeeks,
  withoutLostWeeks,
} from '../../../lib/streaks/pillars'
import { localDateKey } from '../../../lib/dayWindow'

const ROOT = path.join(__dirname, '..', '..', '..')
const REPO = path.join(ROOT, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')

const DEMO_EMAIL = 'app-review@become.redbtn.io'
const DEMO_CODE = 'become-review-2026-a1b2'

const ON: ReviewAccountConfig = {
  enabled: true,
  email: DEMO_EMAIL,
  code: DEMO_CODE,
}

// ─── 1. One account, and only one ────────────────────────────────────────────

test('the demo account signs in with the review code', () => {
  const decision = decideReviewSignIn({ config: ON, email: DEMO_EMAIL, code: DEMO_CODE })
  assert.equal(decision.ok, true)
  assert.equal(decision.ok && decision.email, DEMO_EMAIL)
})

test('the same code is refused for every other account', () => {
  for (const email of [
    'jon@example.com',
    'someone.else@become.redbtn.io',
    'APP-REVIEW@BECOME.REDBTN.IO.attacker.net',
    'app-review@become.redbtn.io.attacker.net',
    ' app-review@become.redbtn.io ,jon@example.com',
  ]) {
    const decision = decideReviewSignIn({ config: ON, email, code: DEMO_CODE })
    assert.equal(decision.ok, false, `${email} was signed in with the review code`)
    assert.equal(!decision.ok && decision.reason, 'wrong_account')
    assert.equal(!decision.ok && decision.status, 403)
  }
})

test('the address is matched the way it is stored — trimmed and lowercased', () => {
  const decision = decideReviewSignIn({
    config: ON,
    email: '  App-Review@Become.RedBtn.IO ',
    code: DEMO_CODE,
  })
  assert.equal(decision.ok, true)
  assert.equal(normalizeReviewEmail('  MiXeD@Case.COM '), 'mixed@case.com')
})

test('a wrong account and a wrong code are indistinguishable from outside', () => {
  const wrongAccount = decideReviewSignIn({ config: ON, email: 'jon@example.com', code: DEMO_CODE })
  const wrongCode = decideReviewSignIn({ config: ON, email: DEMO_EMAIL, code: 'nope-nope-nope' })
  assert.equal(!wrongAccount.ok && wrongAccount.status, !wrongCode.ok && wrongCode.status)
  assert.equal(!wrongAccount.ok && wrongAccount.message, !wrongCode.ok && wrongCode.message)
  assert.equal(!wrongCode.ok && wrongCode.message, REVIEW_INVALID_MESSAGE)
  // And the sentence must not name the demo account.
  assert.doesNotMatch(REVIEW_INVALID_MESSAGE, /app-review|become\.redbtn\.io/i)
})

// ─── 2. The wrong code, and guessing it ──────────────────────────────────────

test('a wrong code is refused for the demo account itself', () => {
  for (const code of [
    'wrong-code-entirely',
    DEMO_CODE.slice(0, -1),
    `${DEMO_CODE} `.repeat(2),
    DEMO_CODE.toUpperCase(),
  ]) {
    const decision = decideReviewSignIn({ config: ON, email: DEMO_EMAIL, code })
    assert.equal(decision.ok, false, `"${code}" was accepted`)
    assert.equal(!decision.ok && decision.reason, 'wrong_code')
  }
})

test('a missing email or code is a 400, not a comparison', () => {
  for (const body of [
    { email: DEMO_EMAIL, code: '' },
    { email: '', code: DEMO_CODE },
    { email: DEMO_EMAIL, code: undefined },
    { email: null, code: null },
  ]) {
    const decision = decideReviewSignIn({ config: ON, ...body })
    assert.equal(decision.ok, false)
    assert.equal(!decision.ok && decision.reason, 'malformed')
    assert.equal(!decision.ok && decision.status, 400)
  }
})

test('the code is rate limited, and the limit outranks both comparisons', () => {
  // Under the limit: the right code still works.
  const allowed = decideReviewSignIn({
    config: ON,
    email: DEMO_EMAIL,
    code: DEMO_CODE,
    priorAttempts: REVIEW_MAX_ATTEMPTS - 1,
  })
  assert.equal(allowed.ok, true)

  // At the limit: even the RIGHT code is refused, which is what makes the
  // limit a limit and not a hint.
  const blocked = decideReviewSignIn({
    config: ON,
    email: DEMO_EMAIL,
    code: DEMO_CODE,
    priorAttempts: REVIEW_MAX_ATTEMPTS,
    retryAfterMs: 90_000,
  })
  assert.equal(blocked.ok, false)
  assert.equal(!blocked.ok && blocked.reason, 'rate_limited')
  assert.equal(!blocked.ok && blocked.status, 429)
  assert.equal(!blocked.ok && blocked.retryAfterSeconds, 90)

  // And a wrong account at the limit reports the limit, not the account: the
  // refusal must not tell a locked-out caller which half was wrong.
  const wrongAtLimit = decideReviewSignIn({
    config: ON,
    email: 'jon@example.com',
    code: DEMO_CODE,
    priorAttempts: REVIEW_MAX_ATTEMPTS + 4,
  })
  assert.equal(!wrongAtLimit.ok && wrongAtLimit.reason, 'rate_limited')
})

test('Retry-After is always at least a second, never zero or negative', () => {
  const decision = decideReviewSignIn({
    config: ON,
    email: DEMO_EMAIL,
    code: DEMO_CODE,
    priorAttempts: REVIEW_MAX_ATTEMPTS,
    retryAfterMs: -5,
  })
  assert.equal(!decision.ok && decision.retryAfterSeconds! >= 1, true)
})

test('the window and the budget are small enough to matter', () => {
  assert.ok(REVIEW_MAX_ATTEMPTS <= 10, 'the attempt budget has grown past a rate limit')
  assert.ok(REVIEW_ATTEMPT_WINDOW_MS >= 60_000, 'the window is too short to slow anything down')
})

test('the code comparison does not stop at the first difference', () => {
  assert.equal(constantTimeEquals('abcdef', 'abcdef'), true)
  assert.equal(constantTimeEquals('abcdef', 'abcdeg'), false)
  assert.equal(constantTimeEquals('abcdef', 'abcde'), false, 'a prefix must not match')
  assert.equal(constantTimeEquals('abcde', 'abcdef'), false, 'a prefix must not match')
  assert.equal(constantTimeEquals('', ''), true)
  assert.equal(constantTimeEquals('a', ''), false)
  assert.equal(constantTimeEquals('', 'a'), false)
  // The implementation must not be a plain === in disguise: it has to walk the
  // whole candidate. Nothing here can time it, so the source is checked.
  const src = read('lib/reviewSignIn.ts')
  const body = /export function constantTimeEquals[\s\S]*?\n}/.exec(src)?.[0] ?? ''
  assert.match(body, /for \(/, 'constantTimeEquals no longer compares character by character')
  assert.doesNotMatch(body, /return a === b/, 'constantTimeEquals is a === again')
})

// ─── 3. Off by default, and switchable off ───────────────────────────────────

test('the door is shut when nothing is configured', () => {
  for (const config of [undefined, null, {}, { email: DEMO_EMAIL, code: DEMO_CODE }] as const) {
    const decision = decideReviewSignIn({ config, email: DEMO_EMAIL, code: DEMO_CODE })
    assert.equal(decision.ok, false, 'the review door opened with no config')
    assert.equal(!decision.ok && decision.reason, 'disabled')
    assert.equal(!decision.ok && decision.status, 404)
    assert.equal(!decision.ok && decision.message, REVIEW_DISABLED_MESSAGE)
  }
})

test('enabled has to be exactly true — a truthy string is not a switch', () => {
  for (const enabled of ['true', 1, {}, 'yes'] as unknown[]) {
    const decision = decideReviewSignIn({
      config: { enabled, email: DEMO_EMAIL, code: DEMO_CODE } as ReviewAccountConfig,
      email: DEMO_EMAIL,
      code: DEMO_CODE,
    })
    assert.equal(!decision.ok && decision.reason, 'disabled')
  }
})

test('turning it off closes the door for the demo account too', () => {
  const decision = decideReviewSignIn({
    config: { ...ON, enabled: false },
    email: DEMO_EMAIL,
    code: DEMO_CODE,
  })
  assert.equal(decision.ok, false)
  assert.equal(!decision.ok && decision.reason, 'disabled')
})

test('a half-configured door is a shut door', () => {
  assert.equal(resolveReviewAccount({ enabled: true, code: DEMO_CODE }), null, 'no email')
  assert.equal(resolveReviewAccount({ enabled: true, email: DEMO_EMAIL }), null, 'no code')
  assert.equal(
    resolveReviewAccount({ enabled: true, email: 'not-an-email', code: DEMO_CODE }),
    null,
    'an address that is not one',
  )
  assert.deepEqual(resolveReviewAccount(ON), { email: DEMO_EMAIL, code: DEMO_CODE })
})

test('a code too short to be a credential counts as no code at all', () => {
  const short = 'a'.repeat(REVIEW_CODE_MIN_LENGTH - 1)
  assert.equal(resolveReviewAccount({ enabled: true, email: DEMO_EMAIL, code: short }), null)
  const decision = decideReviewSignIn({
    config: { enabled: true, email: DEMO_EMAIL, code: short },
    email: DEMO_EMAIL,
    code: short,
  })
  assert.equal(!decision.ok && decision.reason, 'disabled')
  assert.ok(REVIEW_CODE_MIN_LENGTH >= 12, 'a review code must not be guessable by hand')
})

test('the config is read with a max age, so the switch needs no deploy', () => {
  assert.ok(
    REVIEW_CONFIG_MAX_AGE_MS > 0 && REVIEW_CONFIG_MAX_AGE_MS <= 5 * 60 * 1000,
    'a review kill-switch that takes more than a few minutes is not a kill-switch',
  )

  // lib/runtimeConfig.ts caches for the life of the process by default. The
  // review section is the one thing that must not: without maxAgeMs a flip
  // would need a restart, which on RedRun means a deploy.
  const runtime = read('lib/runtimeConfig.ts')
  assert.match(runtime, /maxAgeMs/, 'getRuntimeConfig no longer supports a max age')
  assert.match(runtime, /review:\s*\{/, 'the runtime config has no review section')
  assert.match(
    runtime,
    /enabled: booleanValue\(review\.enabled[\s\S]*?\) === true/,
    'review.enabled is no longer required to be exactly true',
  )

  const account = read('lib/reviewAccount.ts')
  assert.match(
    account,
    /getRuntimeConfig\(\{ maxAgeMs: REVIEW_CONFIG_MAX_AGE_MS \}\)/,
    'the review config is read from the forever-cached copy',
  )
})

// ─── 4. Reachable on all three surfaces ──────────────────────────────────────

test('the route exists at the path every surface posts to', () => {
  assert.equal(REVIEW_SIGN_IN_PATH, '/api/auth/review-sign-in')
  const route = read(path.join('app', 'api', 'auth', 'review-sign-in', 'route.ts'))
  assert.match(route, /export async function POST/, 'the review route has no POST')
  assert.match(route, /decideReviewSignIn/, 'the route does not use the shared decision')
  assert.match(route, /recordReviewAttempt/, 'the route does not spend the attempt budget')
  assert.match(route, /ensureReviewAccount/, 'the route does not check the row it is opening')
  assert.match(route, /seedReviewAccount/, 'the route does not seed the demo account')
  assert.match(route, /authCookie\(token\)/, 'the route does not set the session cookie')
})

test('the web sign-in screen posts the review code', () => {
  const form = read(path.join('components', 'AuthForm.tsx'))
  assert.match(form, /REVIEW_SIGN_IN_PATH/, 'the web form does not know the review path')
  assert.match(form, /data-testid="review-code-input"/, 'there is no code box on the web form')
  assert.match(form, /data-testid="review-code-submit"/, 'there is no way to submit it')
  // On the sign-in screen only: a review code cannot create an account.
  assert.match(form, /mode === 'login' && \(/, 'the review box is not gated to sign-in mode')
})

test('the native sign-in screen posts the same path in both store builds', () => {
  // ONE Expo codebase is both store builds, so this file is the iOS and the
  // Android surface at once — see expo/app/(auth)/login.tsx.
  const login = readRepo(path.join('expo', 'app', '(auth)', 'login.tsx'))
  const nativePath = /REVIEW_SIGN_IN_PATH\s*=\s*"([^"]+)"/.exec(login)?.[1]
  assert.equal(
    nativePath,
    REVIEW_SIGN_IN_PATH,
    'the native app posts a different path from the one the server serves — every '
      + 'store-build review sign-in would 404 and nothing in either codebase would say so',
  )
  assert.match(login, /ReviewSignInResponseSchema/, 'the native call parses no schema')
  assert.match(login, /login-review-code-submit/, 'the native screen has no submit control')
  assert.match(login, /handleAuthed\(resp\.token\)/, 'the native screen does not store the session')

  // And the shared client declares the shapes the native call is typed by.
  const schema = readRepo(path.join('shared', 'api-client', 'src', 'schemas', 'auth.ts'))
  assert.match(schema, /ReviewSignInRequestSchema/)
  assert.match(schema, /ReviewSignInResponseSchema/)
})

// ─── 5. The seeded account ───────────────────────────────────────────────────

test('the demo account is on Plus, onboarded, and flagged as the demo account', () => {
  const fields = reviewUserFields(new Date('2026-09-30T12:00:00.000Z'))
  assert.equal(fields.tier, 'plus', 'every gated surface has to be reviewable')
  assert.equal(fields.isReviewAccount, true, 'the row must carry the flag the route checks')
  assert.equal(fields.onboardingCompleted, true, 'a reviewer must not land in onboarding')
  assert.equal(fields.role, 'user', 'a demo account is not staff')
  assert.equal(fields.name, REVIEW_ACCOUNT_NAME)
  assert.equal(fields.emailPreferences?.engagement, false, 'the demo account must not be mailed')
  assert.ok(fields.consent?.termsVersion, 'no consent record: the in-app gate would block review')
  assert.equal(fields.aiConsent?.granted, true, 'the AI surfaces would be unreviewable')
  assert.equal(fields.subscription, undefined, 'a fake Stripe subscription is not believable data')
})

test('the seeded activity is believable, and none of it is in the future', () => {
  const now = new Date('2026-09-30T12:00:00.000Z')
  const userId = { toString: () => 'u' } as never

  const meals = reviewMealLogs(userId, now)
  assert.ok(meals.length >= SEED_ACTIVITY_DAYS * 2, 'too few meals to look like a food log')
  for (const meal of meals) {
    const loggedAt = meal.loggedAt as Date
    assert.ok(loggedAt <= now, 'a meal was logged in the future')
    const totals = meal.totalNutrition as { calories: number; protein: number }
    assert.ok(totals.calories > 0 && totals.protein > 0, 'a meal with no macros in it')
  }

  const moods = reviewMoodHistory(now)
  assert.equal(moods.length, reviewActivityDays(now), 'the mood history has a hole in it')
  // Consecutive days ending today — a streak is a fact about consecutive days.
  const dayKeys = moods.map((m) => m.date.toISOString().slice(0, 10))
  assert.equal(new Set(dayKeys).size, moods.length, 'two moods on one day')
  assert.equal(dayKeys[dayKeys.length - 1], '2026-09-30', 'the streak does not reach today')

  const weights = reviewWeightHistory(now)
  assert.ok(weights.length >= 5, 'too few weigh-ins to draw a chart from')
  for (const entry of weights) {
    assert.ok(entry.date <= now, 'a weigh-in dated in the future')
    assert.equal(entry.unit, 'lbs')
    assert.ok(entry.weight > 100 && entry.weight < 400, 'an implausible body weight')
  }
})

test('the seed refuses to write to anything but the flagged demo row', () => {
  const seed = read('lib/reviewSeed.ts')
  assert.match(
    seed,
    /user\.isReviewAccount !== true/,
    'the seed no longer checks the flag before writing — a mis-set review.email would '
      + 'overwrite a real member\'s program, meals and Mind progress',
  )
  // Every destructive write is filtered by the demo userId.
  for (const call of [
    /MealLog\.deleteMany\(\{ user: uid \}\)/,
    /Schedule\.deleteMany\(\{ userId: uid \}\)/,
    /NutritionGoal\.deleteMany\(\{ userId: uid \}\)/,
    /IdentityProfile\.deleteMany\(\{ userId: uid \}\)/,
  ]) {
    assert.match(seed, call, 'a delete in the seed is not scoped to the demo account')
  }

  const account = read('lib/reviewAccount.ts')
  assert.match(
    account,
    /existing\.isReviewAccount !== true/,
    'ensureReviewAccount no longer refuses an address that belongs to a member',
  )
})

// ─── 5b. Demo Account Consistency Invariants (NP-339) ────────────────────────

test('all review workout dates land strictly on Mon/Wed/Fri with zero weekend workouts', () => {
  const dates = [
    new Date('2026-09-30T12:00:00.000Z'), // Wednesday
    new Date('2026-10-06T12:00:00.000Z'), // Tuesday
    new Date('2026-10-08T12:00:00.000Z'), // Thursday
    new Date('2026-10-10T12:00:00.000Z'), // Saturday
    new Date('2026-10-11T12:00:00.000Z'), // Sunday
  ]

  const mockProgram = {
    programId: 'prog-1',
    programName: 'Foundation Strength',
    dayLabels: [
      { day: 'Day 1', title: 'Full Body A' },
      { day: 'Day 2', title: 'Full Body B' },
      { day: 'Day 3', title: 'Full Body C' },
    ],
    totalWorkouts: 13,
  }
  const userId = { toString: () => 'u1' } as never

  for (const now of dates) {
    const { past, future } = reviewTrainingDayKeys(now)
    assert.equal(past.length, 9, 'must have exactly 9 past training days')
    assert.equal(future.length, 4, 'must have exactly 4 future training days')

    const allKeys = [...past, ...future]
    for (const key of allKeys) {
      const [y, m, d] = key.split('-').map(Number)
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
      assert.ok(
        dow === 1 || dow === 3 || dow === 5,
        `workout date ${key} landed on weekday ${dow} (expected 1=Mon, 3=Wed, 5=Fri)`,
      )
      assert.notEqual(dow, 0, `workout date ${key} landed on Sunday`)
      assert.notEqual(dow, 6, `workout date ${key} landed on Saturday`)
    }

    const schedule = reviewSchedule(userId, mockProgram, now)
    assert.equal(schedule.scheduledWorkouts.length, 13)
    const logs = reviewWorkoutLogs(mockProgram, now)
    assert.equal(logs.length, 9)
  }
})

test('program workout total is 13, matching 13 schedule sessions (9 completed, 4 scheduled)', () => {
  const now = new Date('2026-10-08T12:00:00.000Z')
  const userId = { toString: () => 'u1' } as never
  const mockProgram = {
    programId: 'prog-1',
    programName: 'Foundation Strength',
    dayLabels: [
      { day: 'Day 1', title: 'Full Body A' },
      { day: 'Day 2', title: 'Full Body B' },
      { day: 'Day 3', title: 'Full Body C' },
    ],
    totalWorkouts: 13,
  }

  const schedule = reviewSchedule(userId, mockProgram, now)
  const scheduledWorkouts = schedule.scheduledWorkouts as Array<{ status: string }>
  assert.equal(scheduledWorkouts.length, 13, 'schedule must have exactly 13 total sessions')

  const completed = scheduledWorkouts.filter((w) => w.status === 'completed')
  const upcoming = scheduledWorkouts.filter((w) => w.status === 'scheduled')
  assert.equal(completed.length, 9, 'schedule must have 9 completed sessions')
  assert.equal(upcoming.length, 4, 'schedule must have 4 upcoming scheduled sessions')

  const seed = read('lib/reviewSeed.ts')
  assert.match(
    seed,
    /totalWorkouts:\s*13/,
    'UserProgress.activePrograms must store totalWorkouts as 13',
  )
  assert.match(
    seed,
    /completedWorkouts:\s*9/,
    'UserProgress.activePrograms must store completedWorkouts as 9',
  )
})

test('local meal times are ~8:00 breakfast, ~12:30 lunch, ~19:00 dinner in America/New_York', () => {
  const now = new Date('2026-10-08T23:59:59.000Z')
  const userId = { toString: () => 'u1' } as never
  const meals = reviewMealLogs(userId, now)

  const breakfastMeals = meals.filter((m) => (m.tags as string[]).includes('breakfast'))
  const lunchMeals = meals.filter((m) => (m.tags as string[]).includes('lunch'))
  const dinnerMeals = meals.filter((m) => (m.tags as string[]).includes('dinner'))

  assert.ok(breakfastMeals.length > 0)
  assert.ok(lunchMeals.length > 0)
  assert.ok(dinnerMeals.length > 0)

  for (const b of breakfastMeals) {
    const dt = b.loggedAt as Date
    const nyTime = dt.toLocaleTimeString('en-US', {
      timeZone: REVIEW_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    assert.equal(nyTime, '08:00', `breakfast logged at ${nyTime} in NY, expected 08:00`)
  }

  for (const l of lunchMeals) {
    const dt = l.loggedAt as Date
    const nyTime = dt.toLocaleTimeString('en-US', {
      timeZone: REVIEW_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    assert.equal(nyTime, '12:30', `lunch logged at ${nyTime} in NY, expected 12:30`)
  }

  for (const d of dinnerMeals) {
    const dt = d.loggedAt as Date
    const nyTime = dt.toLocaleTimeString('en-US', {
      timeZone: REVIEW_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    assert.equal(nyTime, '19:00', `dinner logged at ${nyTime} in NY, expected 19:00`)
  }
})

test('no makeup workouts: completed workouts are completed on scheduled date and match logs chronologically', () => {
  const now = new Date('2026-10-08T12:00:00.000Z')
  const userId = { toString: () => 'u1' } as never
  const mockProgram = {
    programId: 'prog-1',
    programName: 'Foundation Strength',
    dayLabels: [
      { day: 'Day 1', title: 'Full Body A' },
      { day: 'Day 2', title: 'Full Body B' },
      { day: 'Day 3', title: 'Full Body C' },
    ],
    totalWorkouts: 13,
  }

  const schedule = reviewSchedule(userId, mockProgram, now)
  const logs = reviewWorkoutLogs(mockProgram, now)
  const completedSlots = (schedule.scheduledWorkouts as Array<{
    date: Date
    dayLabel: string
    workoutTitle: string
    status: string
    completedAt?: Date
  }>).filter((s) => s.status === 'completed')

  assert.equal(completedSlots.length, logs.length)

  // Verify chronological dayLabels match between schedule and logs
  for (let i = 0; i < completedSlots.length; i++) {
    const slot = completedSlots[i]
    const log = logs[i] as { date: Date; day: string }

    assert.equal(slot.dayLabel, log.day, `dayLabel mismatch at index ${i}`)

    // Calendar isMakeupWorkout logic:
    // Only a makeup if completed AFTER the scheduled date.
    const slotDateStr = slot.date.toISOString().split('T')[0]
    const [sy, sm, sd] = slotDateStr.split('-').map(Number)
    const scheduledLocal = new Date(sy, sm - 1, sd)

    const c = new Date(slot.completedAt!)
    const completedLocal = new Date(c.getFullYear(), c.getMonth(), c.getDate())

    // Completed on or before scheduled date -> isMakeup is FALSE
    const isMakeup = completedLocal.getTime() > scheduledLocal.getTime()
    assert.equal(isMakeup, false, `slot ${slotDateStr} was marked as makeup workout`)
  }
})

test('nutrition goal matches gain-muscle / gain profile with surplus calories and high protein', () => {
  const now = new Date('2026-10-08T12:00:00.000Z')
  const userId = { toString: () => 'u1' } as never
  const goal = reviewNutritionGoal(userId, now)

  assert.equal(goal.goalType, 'gain')
  assert.equal(goal.activityLevel, 'moderate')
  assert.equal(goal.macroPreset, 'recommended')
  assert.ok(goal.calories > 2500, `calories ${goal.calories} should be a surplus (>2500)`)
  assert.equal(goal.calories, 2871, 'expected 2871 kcal surplus')
  assert.ok(goal.protein > 170, `protein ${goal.protein}g should be high (>170g)`)
  assert.equal(goal.protein, 179, 'expected 179g protein')
  assert.equal(goal.carbs, 345)
  assert.equal(goal.fats, 86)
})

test('identity profile is seeded with a believable future self and no placeholder text', () => {
  const now = new Date('2026-10-08T12:00:00.000Z')
  const userId = { toString: () => 'u1' } as never
  const identity = reviewIdentityProfile(userId, now)

  assert.ok(identity.futureSelf.length > 20, 'futureSelf is too short')
  assert.ok(identity.currentSelf.length > 20, 'currentSelf is too short')
  assert.equal(identity.primaryObstacle, 'discipline')
  assert.equal(identity.startingPoint, 'building')
  assert.equal(identity.onboardingCompleted, true)
  assert.equal(identity.affirmStreak, 12)
  assert.equal(identity.longestAffirmStreak, 12)
  assert.match(identity.lastAffirmedKey, /^\d{4}-\d{2}-\d{2}$/)

  // Assert absence of test fixture placeholders
  assert.ok(!identity.futureSelf.toLowerCase().includes('teal boy'), 'contains "teal boy"')
  assert.ok(!identity.currentSelf.toLowerCase().includes('teal boy'), 'contains "teal boy"')
})

test('super streak and day streak both equal 12 across weekdays and rest days', () => {
  const dates = [
    new Date('2026-10-06T12:00:00.000Z'), // Tuesday (rest day)
    new Date('2026-10-07T12:00:00.000Z'), // Wednesday (training day)
    new Date('2026-10-08T12:00:00.000Z'), // Thursday (rest day)
    new Date('2026-10-09T12:00:00.000Z'), // Friday (training day)
    new Date('2026-10-10T12:00:00.000Z'), // Saturday (rest day)
  ]

  for (const now of dates) {
    const tzOffset = 240
    const todayKey = localDateKey(null, tzOffset, now)
    const activityDays = reviewActivityDays(now, tzOffset)
    const { past: pastWorkouts } = reviewTrainingDayKeys(now, tzOffset)

    const workoutDays = new Set(pastWorkouts)
    const nutritionDays = new Set<string>()
    const mindDays = new Set<string>()
    for (let i = 0; i < activityDays; i++) {
      const k = shiftDay(todayKey, -i)
      nutritionDays.add(k)
      mindDays.add(k)
    }

    const trainingWeekdays = [1, 3, 5]
    const weeklyTarget = 3
    const fromKey = shiftDay(todayKey, -365)
    const allDays = dayRange(fromKey, todayKey)
    const trainedOrRest = workoutOrRestDays(workoutDays, allDays, trainingWeekdays, weeklyTarget)
    const lost = lostWeeks(workoutDays, weeklyTarget, todayKey, trainingWeekdays)
    const workoutHalf = withoutLostWeeks(trainedOrRest, lost)
    const superDays = intersectDays(nutritionDays, mindDays, workoutHalf)
    const superStreak = dayStreak(superDays, todayKey)

    assert.equal(superStreak.current, 12, `super streak should be 12 on ${todayKey}`)
    assert.equal(SEED_STREAK_DAYS, 12, 'stored day streak is 12')
  }
})

// ─── 6. The rate-limit keys ──────────────────────────────────────────────────

test('the client address comes from the FIRST forwarded entry', () => {
  const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null
  assert.equal(
    clientAddressFromHeaders(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' })),
    '203.0.113.9',
  )
  assert.equal(clientAddressFromHeaders(headers({ 'x-real-ip': '198.51.100.7' })), '198.51.100.7')
  assert.equal(clientAddressFromHeaders(headers({})), null, 'a missing address must not throw')
})
