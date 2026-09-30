// Run with: npm run test:file tests/unit/onboarding-gate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { onboardingSettled, ONBOARDING_TOUR_ID } from '../../lib/tutorials/onboardingSettled'
import { becomeOnboardingTour } from '../../lib/tutorials/becomeTour'

const V = becomeOnboardingTour.version ?? 1
const src = (entry: { status: string; version: number } | null) => ({ getStatus: () => entry })

test('a member who has never seen the tour is NOT settled', () => {
  // This is the fresh account in the report. The tour is still coming, so the
  // check-in has to wait.
  assert.equal(onboardingSettled(src(null)), false)
})

test('a member mid-tour is NOT settled', () => {
  assert.equal(onboardingSettled(src({ status: 'in-progress', version: V })), false)
})

test('a completed tour is settled', () => {
  assert.equal(onboardingSettled(src({ status: 'completed', version: V })), true)
})

test('a SKIPPED tour is settled too', () => {
  // The library's isCompleted() says false here. Using it would leave everyone
  // who tapped "Skip tour" without a daily check-in permanently.
  assert.equal(onboardingSettled(src({ status: 'dismissed', version: V })), true)
})

test('a tour completed at an older version is NOT settled — it is about to replay', () => {
  assert.equal(onboardingSettled(src({ status: 'completed', version: V - 1 })), false)
})

test('the id tracks the real tour definition', () => {
  assert.equal(ONBOARDING_TOUR_ID, 'become-onboarding')
  assert.equal(ONBOARDING_TOUR_ID, becomeOnboardingTour.id)
})

// ── The race that caused the report ──────────────────────────────────────────

const DASHBOARD = readFileSync(join(process.cwd(), 'app/dashboard/DashboardClient.tsx'), 'utf8')
const CORE_TOUR = readFileSync(join(process.cwd(), 'lib/tutorials/sections/core.ts'), 'utf8')

test('the tour really does start on a delay, which is what the old gate raced', () => {
  // If this delay ever goes away the race changes shape — the test should be
  // revisited rather than silently passing.
  assert.match(CORE_TOUR, /trigger: \{ type: 'route', match: '\/dashboard', delayMs: \d+ \}/)
})

test('the check-in gate no longer depends only on a tour being ACTIVE', () => {
  // `tutorial.active` is null during the trigger delay, which is exactly when the
  // check-in used to slip through.
  assert.match(DASHBOARD, /onboardingSettled\(tutorial\)/, 'must ask whether onboarding is finished')
  assert.match(
    DASHBOARD,
    /tourWasSettled !== true && \(sawTour\.current \|\| !tourGraceOver\)/,
    'busy must be driven by the sampled verdict, not just the live active flag',
  )
})

test('the gate can never strand the queue forever', () => {
  // Two ways an unfinished tour could permanently suppress the check-in: the
  // tour never triggers, or the tutorial provider never reports ready (a stored
  // progress blob wedges it — reproduced locally). Both are covered by a grace
  // window rather than an open-ended block.
  assert.match(DASHBOARD, /TOUR_GRACE_MS = \d+/)
  assert.match(DASHBOARD, /setTimeout\(\(\) => setTourGraceOver\(true\), TOUR_GRACE_MS\)/)
  // The unresolved verdict (null) must fall into the SAME grace path as a
  // negative one, not into an unconditional block.
  assert.doesNotMatch(
    DASHBOARD,
    /tourWasSettled === null \|\| \/\/ still resolving/,
    'an unresolved verdict must not block unconditionally',
  )
})

test('the program nudge is gated too, and the two never stack', () => {
  // The nudge was the other first-run modal opening straight over the tour.
  assert.match(DASHBOARD, /if \(nudgeDue && !tutorialBusy\)/)
  assert.match(DASHBOARD, /if \(checkInDue && !tutorialBusy && !showNudge && !nudgeDue\)/)
})

test('a tour seen this session keeps the queue shut until the next load', () => {
  assert.match(DASHBOARD, /const sawTour = useRef\(false\)/)
  assert.match(DASHBOARD, /if \(tutorial\?\.active\) sawTour\.current = true/)
})

test('the verdict is sampled once per page load, not recomputed as the tour finishes', () => {
  // Recomputing would pop the check-in the instant the member taps "Got it".
  assert.match(DASHBOARD, /if \(tourWasSettled !== null\) return/)
  assert.match(DASHBOARD, /if \(!tutorial\.ready\) return/)
})

test('no tutorial provider means no gate', () => {
  assert.match(DASHBOARD, /if \(!tutorial\) \{ setTourWasSettled\(true\); return \}/)
})

// ── Abandoned tours ─────────────────────────────────────────────────────────
//
// Reported as "why do I no longer get my daily check in message for weight and
// mood". A real account had been sitting at status 'in-progress' for weeks —
// stopped part-way through the workout-schedule segment — while its HOME segment
// was long since completed. The gate only accepted 'completed'/'dismissed', so it
// returned false on every load, the check-in fell through to the 6-second
// fail-safe timer, and tapping into any section before that timer fired meant
// never seeing it.

test('a tour abandoned mid-way is settled once its DASHBOARD segment is done', () => {
  const settled = onboardingSettled({
    getStatus: () => ({
      status: 'in-progress',
      version: becomeOnboardingTour.version ?? 1,
      segments: { home: 'completed', 'workout-schedule': 'in-progress' as never },
    }),
  })
  assert.equal(settled, true, 'nothing can draw over the dashboard any more')
})

test('a dismissed dashboard segment counts too', () => {
  assert.equal(onboardingSettled({
    getStatus: () => ({
      status: 'in-progress',
      version: becomeOnboardingTour.version ?? 1,
      segments: { home: 'dismissed' },
    }),
  }), true)
})

test('an in-progress tour that has NOT reached the dashboard segment still holds', () => {
  // This is the case the hold exists for: the tour is about to draw on the very
  // screen the check-in wants.
  assert.equal(onboardingSettled({
    getStatus: () => ({
      status: 'in-progress',
      version: becomeOnboardingTour.version ?? 1,
      segments: {},
    }),
  }), false)
  assert.equal(onboardingSettled({
    getStatus: () => ({ status: 'in-progress', version: becomeOnboardingTour.version ?? 1 }),
  }), false, 'no segment record at all')
})

test('a stale VERSION still holds, even with the home segment done', () => {
  // A revised tour replays from the start, so the dashboard segment is coming
  // round again and the check-in must keep waiting.
  assert.equal(onboardingSettled({
    getStatus: () => ({
      status: 'in-progress',
      version: 0,
      segments: { home: 'completed' },
    }),
  }), false)
})
