import { test, expect, Page } from '@playwright/test'
import { authenticate, BASE_URL, AUTH_TOKEN } from './test-auth'

// Verifies the fix for "the keyboard blocks the edit-food sheet so I can't tap
// Save". Headless Chromium shows no real software keyboard, so we SIMULATE the iOS
// quirk: the layout viewport stays full-height while visualViewport shrinks. After
// opening the edit sheet we shrink visualViewport and dispatch its resize event,
// then assert the sheet lifted (overlay paddingBottom > 0) and the Save button sits
// ABOVE the simulated keyboard line (rect bottom <= the shrunken viewport height).

const KEYBOARD_TOP = 380 // simulated visible height with the keypad up (viewport is 844 tall)

// Seed one logged item for today via the API so there's a row to edit (the UI add
// flow is incidental to this test and flaky to drive).
async function seedLoggedItem(page: Page): Promise<string> {
  return page.evaluate(async ({ token, baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/meal-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'manual',
        items: [{
          name: 'KB Test Food',
          servingSize: 1,
          servingUnit: 'each',
          servings: 1,
          loggedQuantity: 1,
          loggedUnit: 'each',
          nutrition: { calories: 120, protein: 4, carbs: 20, fats: 2 },
        }],
      }),
    })
    const json = await res.json().catch(() => ({}))
    return json?.log?._id || json?._id || ''
  }, { token: AUTH_TOKEN, baseUrl: BASE_URL })
}

async function deleteLog(page: Page, logId: string) {
  if (!logId) return
  await page.evaluate(async ({ token, baseUrl, id }) => {
    await fetch(`${baseUrl}/api/meal-logs/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }, { token: AUTH_TOKEN, baseUrl: BASE_URL, id: logId })
}

test.describe('Edit-food sheet lifts above the software keyboard', () => {
  test('Save button stays reachable when the keypad is up', async ({ page, context }) => {
    await authenticate(page, context)

    const logId = await seedLoggedItem(page)
    try {
      await page.goto(`${BASE_URL}/dashboard/nutrition`)
      await page.waitForLoadState('domcontentloaded')

      // Find the seeded row and open its kebab menu → Edit.
      await expect(page.locator('text=/KB Test Food/i').first()).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: /Entry options/i }).first().click()
      await page.getByRole('button', { name: /^Edit$/ }).first().click()

      // The edit sheet is open — Amount picker + Save row present.
      const saveBtn = page.getByRole('button', { name: /^Save$|Saving/ }).first()
      await expect(saveBtn).toBeVisible({ timeout: 8_000 })
      // The overlay is the outermost fixed layer of the edit modal.
      const overlay = page.locator('div.fixed.inset-0.z-50').last()

      // Focus the amount field (what pops the keyboard on device).
      await page.locator('input[inputmode="decimal"], input[type="number"]').first().click().catch(() => {})

      // Baseline: with no keyboard, the overlay isn't lifted.
      const padBefore = await overlay.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom) || 0)
      expect(padBefore).toBeLessThanOrEqual(1)

      // Simulate the keyboard covering the bottom ~55% of the screen.
      const simulated = await page.evaluate((h) => {
        const vv = window.visualViewport
        if (!vv) return false
        try {
          Object.defineProperty(vv, 'height', { configurable: true, get: () => h })
          Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 })
        } catch { return false }
        vv.dispatchEvent(new Event('resize'))
        return true
      }, KEYBOARD_TOP)
      expect(simulated, 'visualViewport.height was overridable for the simulation').toBeTruthy()
      await page.waitForTimeout(350) // let the hook + CSS transition settle

      // 1) The overlay lifted: paddingBottom is now a positive pixel value ≈ keyboard height.
      const padAfter = await overlay.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom) || 0)
      expect(padAfter, 'overlay paddingBottom should lift the sheet above the keyboard').toBeGreaterThan(50)

      // 2) The Save button is fully above the simulated keyboard line.
      const box = await saveBtn.boundingBox()
      expect(box, 'Save button has a layout box').not.toBeNull()
      expect(
        Math.round(box!.y + box!.height),
        `Save bottom must be above keyboard top (${KEYBOARD_TOP})`,
      ).toBeLessThanOrEqual(KEYBOARD_TOP + 1)
    } finally {
      await deleteLog(page, logId)
    }
  })
})
