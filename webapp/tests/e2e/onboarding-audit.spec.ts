/**
 * Onboarding Audit — End-to-End
 *
 * Walks the 5-step wizard as a brand-new member and proves the four things the
 * redesign promised:
 *
 *   1. Goals are multi-select and ORDERED — first pick is the primary.
 *   2. Picking goals immediately recommends a program, with stated reasons,
 *      and the recommendation RESPONDS to later answers (equipment, days).
 *   3. Body stats alone produce correct calories/macros — the live preview
 *      matches a hand-computed Mifflin-St Jeor target, and the same numbers are
 *      persisted on Finish. This is the regression guard for the bug where the
 *      seed POSTed an invalid goalType, silently failed validation, and left
 *      every new member on the 2000/150/200/65 defaults until they opened the
 *      nutrition goals page and pressed Save.
 *   4. The review step lists every answer and can jump back to edit it.
 *   5. Onboarding and the nutrition goals page agree to the calorie — the two
 *      screens used to convert lbs→kg differently (0.1 kg rounding vs none), so
 *      a 210 lb member was shown 2,910 on one screen and 2,909 on the other.
 *
 * Prerequisites:
 *   - webapp/.env.local with JWT_SECRET
 *   - BOOTSTRAP_TOKEN env var (for /api/admin/e2e-setup)
 *
 * Run:
 *   cd /home/alpha/code/become/webapp && \
 *     BOOTSTRAP_TOKEN=... npx playwright test --project=onboarding-audit
 */

import { test, expect, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { BASE_URL, E2E_USER, resetOnboarding, signToken } from './test-auth'

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')

const e2eToken = signToken(E2E_USER.id, E2E_USER.email)

/** The old hardcoded API defaults — the exact numbers members used to be stuck
 *  with. Seeded before the run so the assertions prove onboarding overwrote
 *  them rather than merely finding a doc that happened to be there. */
const STALE_DEFAULTS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  waterGoal: 96,
  goalType: 'maintain',
  activityLevel: 'moderate',
}

// ─── The reference member ─────────────────────────────────────────────────────
// 30 y/o male, 5'10", 185 lb, training 4 days a week.
// Expected numbers are computed BY HAND here rather than imported from
// lib/nutrition/tdee so the test genuinely checks the math.
//
// Conversions are EXACT — no rounding until render. Rounding 185 lb to 83.9 kg
// and 5'10" to 178 cm (what the app used to do) inflated this member's TDEE by
// 2 cal and, worse, produced a different answer on each screen depending on
// which rounding that screen happened to use.
//   185 lb                        → 83.9146 kg (185 / 2.20462)
//   5'10"                         → 177.8 cm   (70 × 2.54)
//   BMR  = 10(83.9146) + 6.25(177.8) − 5(30) + 5 = 1805.40
//   TDEE = 1805.40 × 1.55 (moderate: 3-4 days)   = 2798
const MEMBER = { age: 30, heightFt: 5, heightIn: 10, weightLbs: 185, days: 4 }
const EXPECTED_TDEE = 2798
const EXPECTED = {
  lose: { calories: 2298, protein: 185, carbs: 246, fats: 64 },
  // gain: 2798 + 300 = 3098; protein 185 × 0.9 = 167;
  // fats round(3098 × .25 / 9) = 86; carbs (3098 − 668 − 774) / 4 = 414
  gain: { calories: 3098, protein: 167, carbs: 414, fats: 86 },
  maintain: { calories: 2798 },
}

// ─── The parity member ────────────────────────────────────────────────────────
// The profile that exposed the cross-screen drift: 25 y/o male, 6'0", 210 lb,
// 5 days a week, cutting. 6'0" is 182.88 cm exactly and 210 lb is 95.2544 kg —
// both land mid-rounding-step, which is precisely why this member disagreed
// across screens and the 185 lb one above did not.
//   BMR  = 10(95.2544) + 6.25(182.88) − 5(25) + 5 = 1975.54
//   TDEE = 1975.54 × 1.725 (active: 5 days)       = 3408
const PARITY_MEMBER = { age: 25, heightFt: 6, heightIn: 0, weightLbs: 210, days: 5 }
const PARITY_TDEE = 3408
const PARITY_CALORIES = 2908

async function shot(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `onboarding-audit--${name}.png`), fullPage: true })
}

/**
 * Put the e2e user back to pre-onboarding, then plant the OLD default macros so
 * the run reproduces the reported bug exactly: a member who lands on generic
 * 2000/150/200/65 targets and has to open the goals page to fix them.
 */
test.beforeAll(async () => {
  await resetOnboarding(E2E_USER.id)

  const seed = await fetch(`${BASE_URL}/api/nutrition/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e2eToken}` },
    body: JSON.stringify(STALE_DEFAULTS),
  })
  expect(seed.ok, 'must be able to plant the stale defaults').toBeTruthy()
  console.log(`[setup] e2e user ${E2E_USER.id} reset with stale default macros planted`)
})

async function startOnboarding(page: Page, context: import('@playwright/test').BrowserContext) {
  await context.addCookies([{
    name: 'auth_token',
    value: e2eToken,
    domain: new URL(BASE_URL).hostname,
    path: '/',
    httpOnly: false,
    secure: BASE_URL.startsWith('https'),
    sameSite: 'Lax',
  }])
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), e2eToken)
  await page.goto(`${BASE_URL}/onboarding`)
  await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 1 of 5')
}

/** Read the current nutrition goals straight from the API. */
async function fetchGoals(): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/nutrition/goals`, {
    headers: { Authorization: `Bearer ${e2eToken}` },
  })
  expect(res.ok).toBeTruthy()
  return res.json()
}

test.describe('Onboarding audit', () => {
  test.setTimeout(180_000)

  test('goals are ordered & multi-select, and drive a live program recommendation', async ({ page, context }) => {
    await startOnboarding(page, context)

    // Next is blocked until a goal is chosen — the one genuinely required answer.
    await expect(page.getByTestId('onboarding-next')).toBeDisabled()

    // First pick becomes the PRIMARY goal.
    await page.getByTestId('goal-lose_weight').click()
    await expect(page.getByTestId('goal-lose_weight')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('primary-goal-badge')).toHaveText(/primary/i)
    await expect(page.getByTestId('onboarding-next')).toBeEnabled()

    // A recommendation appears from the goal alone, with stated reasons.
    const recName = page.getByTestId('recommended-program-name')
    await expect(recName).toBeVisible({ timeout: 20_000 })
    const fatLossPick = (await recName.textContent())?.trim() ?? ''
    expect(fatLossPick.length).toBeGreaterThan(0)

    const reasons = page.getByTestId('recommended-program-reasons')
    await expect(reasons).toContainText(/primary goal/i)
    await shot(page, '01-goal-primary-with-recommendation')

    // Second pick is additive, not a replacement — and is ranked below the primary.
    await page.getByTestId('goal-gain_muscle').click()
    await expect(page.getByTestId('goal-lose_weight')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('goal-gain_muscle')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('goal-gain_muscle')).toContainText(/also #2/i)
    // The primary badge still belongs to the first pick.
    await expect(page.getByTestId('goal-lose_weight')).toContainText(/primary/i)
    await shot(page, '02-two-goals-ordered')

    // Deselect works and does not strand the wizard.
    await page.getByTestId('goal-gain_muscle').click()
    await expect(page.getByTestId('goal-gain_muscle')).toHaveAttribute('aria-pressed', 'false')
    await page.getByTestId('goal-gain_muscle').click()

    // Swapping the PRIMARY goal to muscle must change the recommendation.
    await page.getByTestId('goal-lose_weight').click() // remove → gain_muscle becomes primary
    await expect(page.getByTestId('goal-gain_muscle')).toContainText(/primary/i)
    await expect(recName).not.toHaveText(fatLossPick, { timeout: 20_000 })
    await shot(page, '03-recommendation-changed-with-primary-goal')
  })

  test('body stats alone produce correct macros, and the review step reflects every answer', async ({ page, context }) => {
    await startOnboarding(page, context)

    // ── Step 1 — goals ──────────────────────────────────────────────────
    await page.getByTestId('goal-lose_weight').click()
    await page.getByTestId('goal-gain_muscle').click()
    await page.getByTestId('onboarding-next').click()

    // ── Step 2 — background ─────────────────────────────────────────────
    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 2 of 5')
    await page.getByTestId('experience-intermediate').click()
    // Stepper starts at 3 — click up to reach the reference 4 days.
    const days = page.getByTestId('weekly-availability')
    await expect(days).toHaveText('3')
    await page.getByRole('button', { name: 'Increase days' }).click()
    await expect(days).toHaveText(String(MEMBER.days))
    await page.getByTestId('onboarding-next').click()

    // ── Step 3 — body stats ─────────────────────────────────────────────
    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 3 of 5')

    // Before stats are entered we must say what's missing, not show a number.
    await expect(page.getByTestId('tdee-incomplete')).toBeVisible()

    // Direction is pre-selected from the PRIMARY goal (lose_weight → deficit).
    await expect(page.getByTestId('direction-lose')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('stat-age').fill(String(MEMBER.age))
    await page.getByTestId('stat-height-ft').fill(String(MEMBER.heightFt))
    await page.getByTestId('stat-height-in').fill(String(MEMBER.heightIn))
    await page.getByTestId('sex-male').click()
    await page.getByTestId('stat-current-weight').fill(String(MEMBER.weightLbs))

    // THE core assertion: correct macros from body stats alone — no visit to
    // the nutrition goals page, no Save press.
    const preview = page.getByTestId('tdee-preview')
    await expect(preview).toBeVisible()
    await expect(preview).toContainText(EXPECTED_TDEE.toLocaleString())
    await expect(page.getByTestId('preview-calories')).toHaveText(EXPECTED.lose.calories.toLocaleString())
    await expect(page.getByTestId('preview-protein')).toHaveText(`${EXPECTED.lose.protein}g`)
    await expect(page.getByTestId('preview-carbs')).toHaveText(`${EXPECTED.lose.carbs}g`)
    await expect(page.getByTestId('preview-fats')).toHaveText(`${EXPECTED.lose.fats}g`)
    await shot(page, '04-live-macro-preview')

    // Changing the direction moves the target by exactly the documented delta.
    await page.getByTestId('direction-gain').click()
    await expect(page.getByTestId('preview-calories')).toHaveText(EXPECTED.gain.calories.toLocaleString())
    await expect(page.getByTestId('preview-protein')).toHaveText(`${EXPECTED.gain.protein}g`)

    await page.getByTestId('direction-maintain').click()
    await expect(page.getByTestId('preview-calories')).toHaveText(EXPECTED.maintain.calories.toLocaleString())
    // Maintenance has no target weight to hit, so that field goes away.
    await expect(page.getByTestId('stat-target-weight')).toHaveCount(0)

    // Back to the deficit this member actually wants.
    await page.getByTestId('direction-lose').click()
    await expect(page.getByTestId('stat-target-weight')).toBeVisible()
    await page.getByTestId('stat-target-weight').fill('170')
    await page.getByTestId('onboarding-next').click()

    // ── Step 4 — equipment ──────────────────────────────────────────────
    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 4 of 5')
    await page.getByTestId('equipment-none').click()
    await page.getByTestId('injury-notes').fill('Left shoulder — avoid overhead press')
    await page.getByTestId('onboarding-next').click()

    // ── Step 5 — review ─────────────────────────────────────────────────
    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 5 of 5')
    const review = page.getByTestId('review-step')

    // Every answer is played back.
    await expect(review).toContainText('Lose Weight')
    await expect(review).toContainText('Build Muscle')
    await expect(review).toContainText('Intermediate')
    await expect(review).toContainText(String(MEMBER.days))
    await expect(review).toContainText('185 lbs')
    await expect(review).toContainText('170 lbs')
    await expect(review).toContainText("5'10\"")
    await expect(review).toContainText('Calorie deficit')
    await expect(review).toContainText(EXPECTED.lose.calories.toLocaleString())
    await expect(review).toContainText(`${EXPECTED.lose.protein}p / ${EXPECTED.lose.carbs}c / ${EXPECTED.lose.fats}f`)
    await expect(review).toContainText('None')                                  // equipment
    await expect(review).toContainText('avoid overhead press')
    // …and explains WHY each answer matters.
    await expect(review).toContainText(/Mifflin-St Jeor/i)
    await shot(page, '05-review')

    // Equipment "None" must have pushed the recommendation to a bodyweight program.
    await expect(page.getByTestId('recommended-program-reasons')).toContainText(/no equipment needed/i)

    // Edit jumps back to the right step, and the edit sticks.
    await page.getByTestId('review-edit-2').click()
    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 2 of 5')
    await page.getByRole('button', { name: 'Increase days' }).click()
    await expect(page.getByTestId('weekly-availability')).toHaveText('5')
    await page.getByRole('button', { name: 'Decrease days' }).click()
    await page.getByTestId('onboarding-next').click() // 3
    await page.getByTestId('onboarding-next').click() // 4
    await page.getByTestId('onboarding-next').click() // 5
    await expect(page.getByTestId('review-step')).toBeVisible()

    // ── Finish ──────────────────────────────────────────────────────────
    await page.getByTestId('onboarding-finish').click()
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
    await shot(page, '06-dashboard-after-finish')

    // ── The regression guard ────────────────────────────────────────────
    // Goals must be PERSISTED (not the API's _isDefault fallback) and must
    // exactly match what the member was shown during onboarding.
    const goals = await fetchGoals()
    expect(goals._isDefault, 'onboarding must persist nutrition goals').toBeUndefined()
    expect(goals.goalType, 'goalType must be a NutritionGoal enum value').toBe('lose')
    expect(goals.activityLevel).toBe('moderate')
    expect(goals.calories).toBe(EXPECTED.lose.calories)
    expect(goals.protein).toBe(EXPECTED.lose.protein)
    expect(goals.carbs).toBe(EXPECTED.lose.carbs)
    expect(goals.fats).toBe(EXPECTED.lose.fats)
    // The stale defaults planted in beforeAll must be GONE. Under the old code
    // the seed threw on the enum validator and these survived untouched.
    expect(goals.calories).not.toBe(STALE_DEFAULTS.calories)
    expect(goals.protein).not.toBe(STALE_DEFAULTS.protein)
    expect(goals.goalType).not.toBe(STALE_DEFAULTS.goalType)

    // The profile keeps the full ordered goal set, with the primary mirrored.
    const profileRes = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${e2eToken}` },
    })
    const profile = (await profileRes.json()).profile as Record<string, unknown>
    expect(profile.fitnessGoals).toEqual(['lose_weight', 'gain_muscle'])
    expect(profile.fitnessGoal).toBe('lose_weight')
    expect(profile.nutritionDirection).toBe('lose')
    expect(profile.equipmentAccess).toEqual(['none'])
    expect(profile.experienceLevel).toBe('intermediate')
  })

  test('the nutrition goals page shows the onboarding numbers without pressing Save', async ({ page, context }) => {
    // Depends on the previous test having completed onboarding — same user.
    await context.addCookies([{
      name: 'auth_token',
      value: e2eToken,
      domain: new URL(BASE_URL).hostname,
      path: '/',
      httpOnly: false,
      secure: BASE_URL.startsWith('https'),
      sameSite: 'Lax',
    }])
    await page.goto(`${BASE_URL}/login`)
    await page.evaluate((t) => localStorage.setItem('token', t), e2eToken)

    await page.goto(`${BASE_URL}/dashboard/nutrition/goals`)
    await expect(page.getByRole('heading', { name: 'Nutrition Goals' })).toBeVisible()

    // The saved onboarding values are what's rendered — the member does not
    // have to open this page and press Save to get correct macros.
    const calories = page.locator('input[type="number"]').first()
    await expect(calories).toHaveValue(String(EXPECTED.lose.calories))
    await expect(page.getByText(`${EXPECTED_TDEE}`, { exact: false }).first()).toBeVisible()
    await shot(page, '07-nutrition-goals-page')
  })

  test('onboarding and the goals page agree to the calorie for a member whose weight lands mid-rounding-step', async ({ page, context }) => {
    // The 185 lb member above rounds to the same numbers under either
    // conversion, which is exactly why the drift survived that test. 210 lb at
    // 6'0" does not: the old code showed 2,910 in onboarding and 2,909 here.
    await resetOnboarding(E2E_USER.id)
    await startOnboarding(page, context)

    // ── Goals → Background → Body stats ─────────────────────────────────
    await page.getByTestId('goal-lose_weight').click()
    await page.getByTestId('onboarding-next').click()

    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 2 of 5')
    await page.getByTestId('experience-intermediate').click()
    const days = page.getByTestId('weekly-availability')
    await expect(days).toHaveText('3')
    await page.getByRole('button', { name: 'Increase days' }).click()
    await page.getByRole('button', { name: 'Increase days' }).click()
    await expect(days).toHaveText(String(PARITY_MEMBER.days))
    await page.getByTestId('onboarding-next').click()

    await expect(page.getByTestId('onboarding-step-counter')).toContainText('Step 3 of 5')
    await page.getByTestId('stat-age').fill(String(PARITY_MEMBER.age))
    await page.getByTestId('stat-height-ft').fill(String(PARITY_MEMBER.heightFt))
    await page.getByTestId('stat-height-in').fill(String(PARITY_MEMBER.heightIn))
    await page.getByTestId('sex-male').click()
    await page.getByTestId('stat-current-weight').fill(String(PARITY_MEMBER.weightLbs))

    await expect(page.getByTestId('direction-lose')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('tdee-preview')).toContainText(PARITY_TDEE.toLocaleString())
    await expect(page.getByTestId('preview-calories')).toHaveText(PARITY_CALORIES.toLocaleString())

    // Finish so the numbers are persisted exactly as previewed.
    await page.getByTestId('onboarding-next').click()   // → equipment
    await page.getByTestId('onboarding-next').click()   // → review
    await page.getByTestId('onboarding-finish').click()
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 })

    const saved = await fetchGoals()
    expect(saved.calories, 'persisted calories must match the preview').toBe(PARITY_CALORIES)

    // ── The parity assertion ────────────────────────────────────────────
    // Same member, other screen, same number — including the TDEE the
    // Recalculate button offers, which recomputes rather than reading storage.
    await page.goto(`${BASE_URL}/dashboard/nutrition/goals`)
    await expect(page.getByRole('heading', { name: 'Nutrition Goals' })).toBeVisible()
    await expect(page.locator('input[type="number"]').first()).toHaveValue(String(PARITY_CALORIES))
    await expect(page.getByRole('button', { name: /Recalculate from TDEE/i }))
      .toContainText(`${PARITY_CALORIES} cal`)

    // And the calorie direction is described identically on both screens —
    // this page used to call the surplus "Gain Muscle" while onboarding called
    // the same +300 "Gain Weight".
    await expect(page.getByText('Gain Weight', { exact: false }).first()).toBeVisible()
    await shot(page, '08-cross-screen-parity')
  })
})
