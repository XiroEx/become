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
// lib/nutrition/tdee so the test genuinely checks the math:
//   185 lb                        → 83.9 kg  (round(185 / 2.20462 * 10) / 10)
//   5'10"                         → 178 cm   (round(70 * 2.54))
//   BMR  = 10(83.9) + 6.25(178) − 5(30) + 5   = 1806.5
//   TDEE = 1806.5 × 1.55 (moderate: 3-4 days) = 2800
const MEMBER = { age: 30, heightFt: 5, heightIn: 10, weightLbs: 185, days: 4 }
const EXPECTED_TDEE = 2800
const EXPECTED = {
  lose: { calories: 2300, protein: 185, carbs: 246, fats: 64 },
  // gain: 2800 + 300 = 3100; protein 184.97 × 0.9 = 166;
  // fats round(3100 × .25 / 9) = 86; carbs (3100 − 664 − 774) / 4 = 416
  gain: { calories: 3100, protein: 166, carbs: 416, fats: 86 },
  maintain: { calories: 2800 },
}

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
    secure: true,
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
      secure: true,
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
})
