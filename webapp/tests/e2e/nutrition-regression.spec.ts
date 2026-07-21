import { test, expect, Page } from '@playwright/test'
import { authenticate, BASE_URL, AUTH_TOKEN } from './test-auth'

// Regression coverage for bugs found in the deep nutrition audit.

async function seedItem(page: Page, calories: number, name: string): Promise<string> {
  return page.evaluate(async ({ token, baseUrl, calories, name }) => {
    const res = await fetch(`${baseUrl}/api/meal-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'manual',
        items: [{ name, servingSize: 1, servingUnit: 'each', servings: 1, loggedQuantity: 1, loggedUnit: 'each', nutrition: { calories, protein: 0, carbs: 0, fats: 0 } }],
      }),
    })
    const j = await res.json().catch(() => ({}))
    return j?.log?._id || j?._id || ''
  }, { token: AUTH_TOKEN, baseUrl: BASE_URL, calories, name })
}

async function deleteLog(page: Page, id: string) {
  if (!id) return
  await page.evaluate(async ({ token, baseUrl, id }) => {
    await fetch(`${baseUrl}/api/meal-logs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
  }, { token: AUTH_TOKEN, baseUrl: BASE_URL, id })
}

const num = (s: string) => parseInt((s.match(/\d+/) || ['0'])[0], 10)

test.describe('Nutrition regressions', () => {
  // BUG (audit finding #1): deleting a logged item updated the meal card but NOT the
  // headline daily-calorie ring / macro bars — the ring kept counting the deleted item.
  test('deleting a logged item updates the daily calorie ring', async ({ page, context }) => {
    await authenticate(page, context)
    const logId = await seedItem(page, 314, 'Totals Regression Food')
    try {
      await page.goto(`${BASE_URL}/dashboard/nutrition`)
      await page.waitForLoadState('domcontentloaded')

      // CalorieRing renders "Food <consumed>".
      const ring = page.locator('text=/Food\\s+\\d+/').first()
      await expect(ring).toBeVisible({ timeout: 15_000 })
      const before = num(await ring.innerText())
      await expect(page.locator('text=/Totals Regression Food/i').first()).toBeVisible({ timeout: 10_000 })
      expect(before).toBeGreaterThanOrEqual(314)

      // Delete via the row kebab → Delete.
      await page.getByRole('button', { name: /Entry options/i }).first().click()
      await page.getByRole('button', { name: /^Delete$/ }).first().click()
      await expect(page.locator('text=/Totals Regression Food/i')).toHaveCount(0, { timeout: 10_000 })

      // The ring total must drop by ~the deleted item's calories — not stay stale.
      await expect.poll(async () => num(await ring.innerText().catch(() => String(before))), { timeout: 8_000 })
        .toBeLessThanOrEqual(before - 314 + 1)
    } finally {
      await deleteLog(page, logId)
    }
  })
})
