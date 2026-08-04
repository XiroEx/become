/**
 * Onboarding macro sanity — three different bodies, end to end.
 *
 * The bug this guards: a 6'5" 175 lb member gaining weight was handed 453g of
 * carbs (56% of intake) with protein at 19%, because protein was set in absolute
 * grams, fat was a flat 25%, and carbs silently absorbed the entire remainder.
 * The larger the calorie target, the worse it got.
 *
 * Each run walks the real wizard, reads the numbers off the live preview, and
 * checks them against the calorie total and against sane physiological bounds.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 BOOTSTRAP_TOKEN=... \
 *     npx playwright test --project=onboarding-macros
 */

import { test, expect, Page } from '@playwright/test'
import { E2E_USER, resetOnboarding, signToken } from './test-auth'

const e2eToken = signToken(E2E_USER.id, E2E_USER.email)

interface Body {
  label: string
  goal: 'lose_weight' | 'gain_muscle' | 'maintain'
  direction: 'lose' | 'gain' | 'maintain'
  sex: 'male' | 'female'
  age: number
  heightFt: number
  heightIn: number
  weightLbs: number
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  preset: 'recommended' | 'balanced' | 'high_protein' | 'low_carb'
}

const BODIES: Body[] = [
  // The reported case, with the split he'd now be offered.
  { label: "tall lean male, gaining", goal: 'gain_muscle', direction: 'gain',
    sex: 'male', age: 25, heightFt: 6, heightIn: 5, weightLbs: 175,
    activity: 'moderate', preset: 'recommended' },
  // Small female cutting — the other end of the range.
  { label: 'small female, cutting', goal: 'lose_weight', direction: 'lose',
    sex: 'female', age: 42, heightFt: 5, heightIn: 2, weightLbs: 132,
    activity: 'light', preset: 'high_protein' },
  // Heavy sedentary male maintaining — where the protein ceiling bites.
  { label: 'heavy male, maintaining', goal: 'maintain', direction: 'maintain',
    sex: 'male', age: 55, heightFt: 5, heightIn: 11, weightLbs: 290,
    activity: 'sedentary', preset: 'low_carb' },
]

async function readPreview(page: Page) {
  const num = async (id: string) =>
    Number((await page.getByTestId(id).innerText()).replace(/[^0-9.]/g, ''))
  return {
    calories: await num('preview-calories'),
    protein: await num('preview-protein'),
    carbs: await num('preview-carbs'),
    fats: await num('preview-fats'),
  }
}

async function runOnboarding(page: Page, b: Body) {
  await resetOnboarding(E2E_USER.id)
  await page.goto('/onboarding')
  await page.evaluate((t) => localStorage.setItem('token', t), e2eToken)
  await page.goto('/onboarding')

  // 1 — goals
  await page.getByTestId(`goal-${b.goal}`).click()
  await page.getByTestId('onboarding-next').click()

  // 2 — background
  await page.getByTestId('experience-intermediate').click()
  await page.getByTestId('onboarding-next').click()

  // 3 — body stats, activity, direction, macro split
  await page.getByTestId('stat-age').fill(String(b.age))
  await page.getByTestId('stat-height-ft').fill(String(b.heightFt))
  await page.getByTestId('stat-height-in').fill(String(b.heightIn))
  await page.getByTestId(`sex-${b.sex}`).click()
  await page.getByTestId('stat-current-weight').fill(String(b.weightLbs))
  await page.getByTestId(`activity-${b.activity}`).click()
  await page.getByTestId(`direction-${b.direction}`).click()
  await page.getByTestId(`macro-preset-${b.preset}`).click()
  await expect(page.getByTestId('tdee-preview')).toBeVisible()
}

test.describe('onboarding macro sanity', () => {
  for (const b of BODIES) {
    test(`${b.label} gets realistic macros`, async ({ page }) => {
      await runOnboarding(page, b)
      const t = await readPreview(page)
      // eslint-disable-next-line no-console
      console.log(`  ${b.label}: ${t.calories} cal — ${t.protein}p / ${t.carbs}c / ${t.fats}f`)

      const pPct = (t.protein * 4) / t.calories
      const cPct = (t.carbs * 4) / t.calories
      const fPct = (t.fats * 9) / t.calories

      // Macros must reconstruct the calorie target.
      expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fats * 9 - t.calories)).toBeLessThanOrEqual(15)

      // The actual regression: carbs may never dominate the plate again.
      expect(cPct).toBeLessThanOrEqual(0.55)
      expect(pPct).toBeGreaterThanOrEqual(0.2)
      expect(fPct).toBeGreaterThanOrEqual(0.2)
      expect(fPct).toBeLessThanOrEqual(0.5)

      // Physiological bounds on the gram figures themselves.
      const perLb = t.protein / b.weightLbs
      expect(perLb).toBeGreaterThanOrEqual(0.6)
      expect(perLb).toBeLessThanOrEqual(1.7)
      expect(t.protein).toBeLessThanOrEqual(250)
      expect(t.calories).toBeGreaterThanOrEqual(1200)
      expect(t.calories).toBeLessThanOrEqual(6000)
      expect(t.carbs).toBeGreaterThan(0)
      expect(t.fats).toBeGreaterThanOrEqual(20)
    })
  }

  test('the wizard will not advance without the stats it needs to compute', async ({ page }) => {
    await resetOnboarding(E2E_USER.id)
    await page.goto('/onboarding')
    await page.evaluate((t) => localStorage.setItem('token', t), e2eToken)
    await page.goto('/onboarding')
    await page.getByTestId('goal-gain_muscle').click()
    await page.getByTestId('onboarding-next').click()
    await page.getByTestId('experience-intermediate').click()
    await page.getByTestId('onboarding-next').click()

    // No stats yet: the wizard must say so and refuse to move on rather than
    // silently seeding the hardcoded 2000/150/200/65 defaults.
    await expect(page.getByTestId('targets-incomplete')).toBeVisible()
    await expect(page.getByTestId('onboarding-next')).toBeDisabled()

    await page.getByTestId('stat-age').fill('30')
    await page.getByTestId('stat-height-ft').fill('5')
    await page.getByTestId('stat-height-in').fill('10')
    await page.getByTestId('sex-male').click()
    await page.getByTestId('stat-current-weight').fill('180')

    await expect(page.getByTestId('tdee-preview')).toBeVisible()
    await expect(page.getByTestId('onboarding-next')).toBeEnabled()
  })
})
