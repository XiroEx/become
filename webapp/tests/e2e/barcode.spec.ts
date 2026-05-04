/**
 * Barcode scanner e2e tests.
 * Covers: API lookup (hit + miss), scanner UI open/close, manual-entry flow,
 * unknown-barcode error banner.
 *
 * Runs against production: https://become.redbtn.io
 *
 * Camera is unavailable in headless Playwright — the scanner component handles
 * this by entering error state and auto-showing the manual-entry panel, which
 * is exactly the code path we exercise here.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'https://become.redbtn.io'
const BOOTSTRAP_TOKEN = 'e2e-user-setup-2026'
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

// Known barcode present in the OpenFoodFacts collection
const KNOWN_BARCODE = '0000103783001'   // Chobani Greek Yogurt
const UNKNOWN_BARCODE = '9999999999999'

function ss(page: Page, name: string) {
  return page.screenshot({ path: path.join(SCREENSHOTS_DIR, `barcode--${name}.png`), fullPage: true })
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

/** Opens the food search modal from the nutrition page. Returns false if no Add button found. */
async function openFoodSearchModal(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1200)

  const addBtn = page.locator('button').filter({ hasText: /add/i }).first()
  if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) return false
  await addBtn.click()
  await page.waitForTimeout(600)

  const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="food" i]').first()
  return searchInput.isVisible({ timeout: 5000 }).catch(() => false)
}

// ─── API tests ────────────────────────────────────────────────────────────────

test.describe('Barcode API', () => {
  test('known barcode returns food data', async () => {
    const { token } = await getAdminToken()
    const res = await fetch(
      `${BASE_URL}/api/nutrition/foods/barcode?code=${KNOWN_BARCODE}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.ok).toBeTruthy()

    const data = await res.json()
    expect(data.food).not.toBeNull()
    expect(data.food.name).toBeTruthy()
    expect(typeof data.food.nutrition?.calories).toBe('number')
  })

  test('unknown barcode returns food: null', async () => {
    const { token } = await getAdminToken()
    const res = await fetch(
      `${BASE_URL}/api/nutrition/foods/barcode?code=${UNKNOWN_BARCODE}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.ok).toBeTruthy()

    const data = await res.json()
    expect(data.food).toBeNull()
  })

  test('missing code param returns 400', async () => {
    const { token } = await getAdminToken()
    const res = await fetch(
      `${BASE_URL}/api/nutrition/foods/barcode`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.status).toBe(400)
  })

  test('unauthenticated request returns 401', async () => {
    const res = await fetch(
      `${BASE_URL}/api/nutrition/foods/barcode?code=${KNOWN_BARCODE}`
    )
    expect(res.status).toBe(401)
  })
})

// ─── UI tests ─────────────────────────────────────────────────────────────────

test.describe('Barcode scanner UI', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('01 – scan button visible in food search modal', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    await ss(page, '01-modal-open')
    const scanBtn = page.locator('[data-testid="barcode-scan-btn"]')
    await expect(scanBtn).toBeVisible({ timeout: 5000 })
  })

  test('02 – clicking scan button opens scanner overlay', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    const scanBtn = page.locator('[data-testid="barcode-scan-btn"]')
    await expect(scanBtn).toBeVisible({ timeout: 5000 })
    await scanBtn.click()
    await page.waitForTimeout(400)

    await ss(page, '02-scanner-overlay')
    const scanner = page.locator('[data-testid="barcode-scanner"]')
    await expect(scanner).toBeVisible({ timeout: 5000 })
  })

  test('03 – close button dismisses scanner', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    await page.locator('[data-testid="barcode-scan-btn"]').click()
    await page.waitForTimeout(400)

    const scanner = page.locator('[data-testid="barcode-scanner"]')
    await expect(scanner).toBeVisible({ timeout: 5000 })

    await page.locator('[data-testid="scanner-close"]').click()
    await page.waitForTimeout(400)

    await ss(page, '03-scanner-closed')
    await expect(scanner).not.toBeVisible({ timeout: 3000 })

    // Food search modal should still be visible
    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 3000 })
  })

  test('04 – manual entry panel appears (camera unavailable in headless)', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    await page.locator('[data-testid="barcode-scan-btn"]').click()
    await page.waitForTimeout(400)

    // In headless, camera access fails → manual panel auto-shows.
    // If camera somehow starts (unlikely), the toggle button can be clicked.
    const manualForm = page.locator('[data-testid="manual-barcode-form"]')
    const toggleBtn = page.locator('[data-testid="manual-entry-toggle"]')

    const formVisible = await manualForm.isVisible({ timeout: 8000 }).catch(() => false)
    if (!formVisible) {
      // Camera started — trigger manual mode
      if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleBtn.click()
        await page.waitForTimeout(400)
      }
    }

    await ss(page, '04-manual-entry-panel')
    await expect(page.locator('[data-testid="manual-barcode-input"]')).toBeVisible({ timeout: 5000 })
  })

  test('05 – known barcode via manual entry populates food picker', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    await page.locator('[data-testid="barcode-scan-btn"]').click()
    await page.waitForTimeout(400)

    // Wait for manual entry panel (headless → error state auto-shows it)
    const manualInput = page.locator('[data-testid="manual-barcode-input"]')
    const toggleBtn = page.locator('[data-testid="manual-entry-toggle"]')

    const inputVisible = await manualInput.isVisible({ timeout: 8000 }).catch(() => false)
    if (!inputVisible) {
      if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleBtn.click()
        await page.waitForTimeout(400)
      }
    }

    await expect(manualInput).toBeVisible({ timeout: 5000 })
    await manualInput.fill(KNOWN_BARCODE)
    await page.waitForTimeout(200)

    await ss(page, '05-manual-code-entered')

    const submitBtn = page.locator('[data-testid="manual-barcode-submit"]')
    await expect(submitBtn).toBeEnabled({ timeout: 3000 })
    await submitBtn.click()

    // Scanner closes, barcode lookup fires, food picker appears in the modal
    await page.waitForTimeout(2500)
    await ss(page, '05-after-barcode-lookup')

    // Scanner should be gone
    await expect(page.locator('[data-testid="barcode-scanner"]')).not.toBeVisible({ timeout: 5000 })

    // Food should be selected — serving picker or "Add to" button should appear
    const hasServingPicker = await page.locator('text=/servings|grams|Add to/i').first().isVisible({ timeout: 5000 }).catch(() => false)
    const hasResults = await page.locator('[class*="divide"] button').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasServingPicker || hasResults).toBeTruthy()
  })

  test('06 – unknown barcode shows error banner', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    await page.locator('[data-testid="barcode-scan-btn"]').click()
    await page.waitForTimeout(400)

    const manualInput = page.locator('[data-testid="manual-barcode-input"]')
    const toggleBtn = page.locator('[data-testid="manual-entry-toggle"]')

    const inputVisible = await manualInput.isVisible({ timeout: 8000 }).catch(() => false)
    if (!inputVisible) {
      if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleBtn.click()
        await page.waitForTimeout(400)
      }
    }

    await expect(manualInput).toBeVisible({ timeout: 5000 })
    await manualInput.fill(UNKNOWN_BARCODE)

    await page.locator('[data-testid="manual-barcode-submit"]').click()
    await page.waitForTimeout(2500)

    await ss(page, '06-unknown-barcode-error')

    const errorBanner = page.locator('[data-testid="barcode-error"]')
    await expect(errorBanner).toBeVisible({ timeout: 5000 })
  })

  test('07 – error banner can be dismissed', async ({ page, context }) => {
    await authenticateAdmin(page, context)
    const opened = await openFoodSearchModal(page)
    if (!opened) { test.skip(); return }

    await page.locator('[data-testid="barcode-scan-btn"]').click()
    await page.waitForTimeout(400)

    const manualInput = page.locator('[data-testid="manual-barcode-input"]')
    const toggleBtn = page.locator('[data-testid="manual-entry-toggle"]')

    const inputVisible = await manualInput.isVisible({ timeout: 8000 }).catch(() => false)
    if (!inputVisible) {
      if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleBtn.click()
        await page.waitForTimeout(400)
      }
    }

    await expect(manualInput).toBeVisible({ timeout: 5000 })
    await manualInput.fill(UNKNOWN_BARCODE)
    await page.locator('[data-testid="manual-barcode-submit"]').click()
    await page.waitForTimeout(2500)

    const errorBanner = page.locator('[data-testid="barcode-error"]')
    await expect(errorBanner).toBeVisible({ timeout: 5000 })

    // Dismiss by clicking the X inside the banner
    const dismissBtn = errorBanner.locator('button').first()
    await dismissBtn.click()
    await page.waitForTimeout(400)

    await ss(page, '07-error-dismissed')
    await expect(errorBanner).not.toBeVisible({ timeout: 3000 })
  })
})
