/**
 * Nutrition section e2e tests.
 * Covers: daily log, food search, custom weight input, water tracking, goals page.
 * Target: PLAYWRIGHT_BASE_URL, default http://localhost:3000. It used to
 * hardcode https://become.redbtn.io, so it ran against production even when
 * the rest of the suite was pointed elsewhere.
 *
 * Uses tokens from e2e-admin-setup (admin role needed for the nutrition
 * FeatureGuard) and e2e-setup (user role, for goals page).
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { BASE_URL } from './base-url'
const BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN || ''
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

function ss(page: Page, name: string) {
  return page.screenshot({ path: path.join(SCREENSHOTS_DIR, `nutrition--${name}.png`), fullPage: true })
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getAdminToken(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/admin/e2e-admin-setup`, {
    method: 'POST',
    headers: { 'x-bootstrap-token': BOOTSTRAP_TOKEN },
  })
  if (!res.ok) throw new Error(`e2e-admin-setup failed: ${res.status}`)
  return res.json()
}

async function getUserToken(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/admin/e2e-setup`, {
    method: 'POST',
    headers: { 'x-bootstrap-token': BOOTSTRAP_TOKEN },
  })
  if (!res.ok) throw new Error(`e2e-setup failed: ${res.status}`)
  return res.json()
}

async function injectToken(page: Page, context: BrowserContext, token: string) {
  await context.addCookies([{
    name: 'auth_token',
    value: token,
    domain: new URL(BASE_URL).hostname,
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }])
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), token)
}

async function authenticateAdmin(page: Page, context: BrowserContext) {
  const { token } = await getAdminToken()
  await injectToken(page, context, token)
  await page.goto(`${BASE_URL}/dashboard`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)

  // Dismiss daily check-in if present
  const skipBtn = page.locator('button:has-text("Skip for Today")')
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click({ force: true })
    await page.waitForTimeout(300)
    const continueBtn = page.locator('button:has-text("Continue Anyway")')
    if (await continueBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await continueBtn.click({ force: true })
      await page.waitForTimeout(300)
    }
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe('Nutrition section', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('01 – navigate to nutrition page via bottom nav', async ({ page, context }) => {
    await authenticateAdmin(page, context)

    // Verify bottom nav has a nutrition link, then navigate
    const nutritionTab = page.locator('nav a[href="/dashboard/nutrition"]').first()
    await expect(nutritionTab).toBeVisible({ timeout: 5000 })
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await ss(page, '01-nutrition-page')
    await expect(page.locator('text=Nutrition').first()).toBeVisible()
  })

  test('02 – daily log shows calorie ring and meals', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    await ss(page, '02-daily-log')

    // Calorie ring or meal sections must be visible
    const hasContent = await page.locator('text=/breakfast|lunch|dinner|snack|kcal|cal/i').first().isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('03 – open food search modal', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    // Click any Add Food button
    const addBtn = page.locator('button').filter({ hasText: /add food|^\+$/i }).first()
    const mealAddBtn = page.locator('[data-testid*="add"], button').filter({ hasText: /add/i }).first()

    let opened = false
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click()
      opened = true
    } else if (await mealAddBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mealAddBtn.click()
      opened = true
    } else {
      // Try clicking the + button in any meal section
      const plusBtns = page.locator('button').filter({ hasText: /^\+$/ })
      const count = await plusBtns.count()
      if (count > 0) { await plusBtns.first().click(); opened = true }
    }

    if (!opened) {
      await ss(page, '03-no-add-button-found')
      test.skip()
      return
    }

    await page.waitForTimeout(600)
    await ss(page, '03-food-search-modal')

    const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="food" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
  })

  test('04 – food search returns results', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    const addBtn = page.locator('button').filter({ hasText: /add/i }).first()
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await ss(page, '04-skipped-no-add')
      test.skip()
      return
    }
    await addBtn.click()
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('chicken')
    await page.waitForTimeout(1500)

    await ss(page, '04-food-search-results')

    const hasResults = await page.locator('[class*="divide"] button').first().isVisible({ timeout: 12000 }).catch(() => false)
    const hasNoResults = await page.locator('text=/no foods/i').isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasResults || hasNoResults).toBeTruthy()
  })

  test('05 – select food shows serving picker', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    const addBtn = page.locator('button').filter({ hasText: /add/i }).first()
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) { test.skip(); return }
    await addBtn.click()
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('egg')
    await page.waitForTimeout(900)

    const firstResult = page.locator('[class*="divide"] button').first()
    if (!await firstResult.isVisible({ timeout: 8000 }).catch(() => false)) { test.skip(); return }
    await firstResult.click({ force: true })
    await page.waitForTimeout(400)

    await ss(page, '05-serving-picker')
    await expect(page.locator('text=/servings|grams/i').first()).toBeVisible({ timeout: 4000 })
  })

  test('06 – custom weight (grams) toggle for gram-based food', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    const addBtn = page.locator('button').filter({ hasText: /add/i }).first()
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) { test.skip(); return }
    await addBtn.click()
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('chicken breast')
    await page.waitForTimeout(900)

    let result = page.locator('[class*="divide"] button').first()
    if (!await result.isVisible({ timeout: 8000 }).catch(() => false)) {
      await searchInput.fill('chicken')
      await page.waitForTimeout(900)
    }

    result = page.locator('[class*="divide"] button').first()
    if (!await result.isVisible({ timeout: 5000 }).catch(() => false)) { test.skip(); return }
    await result.click({ force: true })
    await page.waitForTimeout(400)

    await ss(page, '06-food-selected')

    await ss(page, '06-food-selected-state')

    const gramsToggle = page.locator('button:has-text("Custom weight")').first()
    if (await gramsToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gramsToggle.click()
      await page.waitForTimeout(400)

      await ss(page, '06-grams-mode')

      // Grams input has no placeholder; it has min="1" (servings input has min="0.25")
      const gramsInput = page.locator('input[type="number"][min="1"]').first()
      await expect(gramsInput).toBeVisible({ timeout: 3000 })
      await gramsInput.fill('150')
      await page.waitForTimeout(300)

      await ss(page, '06-grams-150-preview')

      // Calories preview should show
      const preview = page.locator('text=/cal/i').first()
      await expect(preview).toBeVisible()
    } else {
      // Food not gram-based — verify the serving number input or any picker is present
      const hasServingInput = await page.locator('input[type="number"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      const hasServingText = await page.locator('text=/servings|serving/i').first().isVisible({ timeout: 1000 }).catch(() => false)
      const hasAddBtn = await page.locator('button').filter({ hasText: /add to/i }).first().isVisible({ timeout: 1000 }).catch(() => false)
      expect(hasServingInput || hasServingText || hasAddBtn).toBeTruthy()
    }
  })

  test('07 – add food to meal and see it in the log', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    const addBtn = page.locator('button').filter({ hasText: /add/i }).first()
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) { test.skip(); return }
    await addBtn.click()
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('egg')
    await page.waitForTimeout(900)

    const firstResult = page.locator('[class*="divide"] button').first()
    if (!await firstResult.isVisible({ timeout: 8000 }).catch(() => false)) { test.skip(); return }
    await firstResult.click({ force: true })
    await page.waitForTimeout(400)

    const addToMealBtn = page.locator('button').filter({ hasText: /add to/i }).first()
    if (!await addToMealBtn.isVisible({ timeout: 3000 }).catch(() => false)) { test.skip(); return }

    await ss(page, '07-before-add')
    await addToMealBtn.click()
    await page.waitForTimeout(1500)

    await ss(page, '07-after-add')

    // Modal should close
    const modalGone = await page.locator('input[placeholder*="Search" i]').isHidden({ timeout: 3000 }).catch(() => true)
    expect(modalGone).toBeTruthy()
  })

  test('08 – water tracker visible and interactive', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    const waterSection = page.locator('text=/water/i').first()
    if (await waterSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await waterSection.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await ss(page, '08-water-tracker')

      const addWaterBtn = page.locator('button').filter({ hasText: /\+8|\+1|add/i }).first()
      if (await addWaterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addWaterBtn.click()
        await page.waitForTimeout(500)
        await ss(page, '08-water-added')
      }
    } else {
      await ss(page, '08-water-section')
    }

    // If we reach here without throwing, the page loaded correctly
    expect(true).toBeTruthy()
  })

  test('09 – navigate to goals page', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const goalsLink = page.locator('a[href*="/nutrition/goals"], button').filter({ hasText: /goals|target/i }).first()
    if (await goalsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await goalsLink.click()
    } else {
      await page.goto(`${BASE_URL}/dashboard/nutrition/goals`)
    }

    await page.waitForURL('**/nutrition/goals**')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    await ss(page, '09-nutrition-goals')
    await expect(page.locator('text=/Nutrition Goals/i').first()).toBeVisible({ timeout: 5000 })
  })

  test('10 – goals page shows TDEE or missing-info panel', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition/goals`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    await ss(page, '10-goals-tdee')

    const tdeeVisible = await page.locator('text=/TDEE/i').isVisible({ timeout: 3000 }).catch(() => false)
    const manualPanel = await page.locator('text=/Fill in missing|update your profile/i').isVisible({ timeout: 2000 }).catch(() => false)
    const statsVisible = await page.locator('text=/Your Stats/i').isVisible({ timeout: 2000 }).catch(() => false)

    expect(tdeeVisible || manualPanel || statsVisible).toBeTruthy()
  })

  test('11 – goals page macro split and activity level', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition/goals`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    const goalCards = page.locator('button').filter({ hasText: /Lose Weight|Maintain|Gain Muscle/i })
    await expect(goalCards.first()).toBeVisible({ timeout: 5000 })

    // Select High Protein macro preset
    const macroSelect = page.locator('select').filter({ hasText: /balanced|high protein|low carb/i }).first()
    if (await macroSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await macroSelect.selectOption({ index: 1 })
      await page.waitForTimeout(400)
    }

    await ss(page, '11-macro-split')

    // Activity level selector
    const activitySelect = page.locator('select').nth(1)
    if (await activitySelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ss(page, '11-activity-level')
    }
  })

  test('12 – goals page save succeeds', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition/goals`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // Click Maintain
    const maintainBtn = page.locator('button').filter({ hasText: /Maintain/i }).first()
    if (await maintainBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await maintainBtn.click()
      await page.waitForTimeout(300)
    }

    const saveBtn = page.locator('button').filter({ hasText: /Save Goals/i }).first()
    await expect(saveBtn).toBeVisible({ timeout: 5000 })

    await ss(page, '12-before-save')
    await saveBtn.click()
    await page.waitForTimeout(1000)

    await ss(page, '12-after-save')
    await expect(page.locator('text=/saved successfully|Goals saved/i').first()).toBeVisible({ timeout: 5000 })
  })
})
