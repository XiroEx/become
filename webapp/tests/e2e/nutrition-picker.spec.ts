import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

// Audits the food picker's DEFAULT serving for curated first-class foods. The bug:
// the picker defaulted to a wrong alternate ("1 cup", "10 cherries", "100 g") instead
// of the food's real serving. The picker preview renders the default serving's
// calories + "P: Xg · C: Yg · F: Zg" — a wrong default shows different macros, so the
// macro line is the discriminator. Read-only (never taps Add).

type FoodCase = { q: string; label: RegExp; cal: number; p: number; c: number; f: number }
const FOODS: FoodCase[] = [
  { q: 'crab',       label: /3 oz cooked/i,  cal: 82,  p: 16, c: 0,  f: 1 },
  { q: 'cherries',   label: /1 cup/i,        cal: 97,  p: 2,  c: 25, f: 0 },
  { q: 'olive oil',  label: /1 tbsp/i,       cal: 124, p: 0,  c: 0,  f: 14 },
  { q: 'white rice', label: /1 cup cooked/i, cal: 205, p: 4,  c: 44, f: 1 },
  { q: 'banana',     label: /1 medium/i,     cal: 105, p: 1,  c: 27, f: 0 },
  { q: 'cantaloupe', label: /1 cup diced/i,  cal: 54,  p: 1,  c: 13, f: 0 },
]

test.describe('Food picker — real serving defaults (not 100 g / wrong alternate)', () => {
  for (const food of FOODS) {
    test(`"${food.q}" default = its real serving, correct macros`, async ({ page, context }) => {
      await authenticate(page, context)
      await page.goto(`${BASE_URL}/dashboard/nutrition`)
      await page.waitForLoadState('domcontentloaded')

      // Open the Add-food search modal.
      await page.getByRole('button', { name: /Add food/i }).first().click()
      const search = page.getByPlaceholder(/Search or describe foods/i)
      await expect(search).toBeVisible({ timeout: 15_000 })
      await search.fill(food.q)

      // Tap the Best Match row (our curated first-class food) to expand the picker.
      const best = page.locator('[role="button"]').filter({ hasText: 'Best Match' }).first()
      await expect(best).toBeVisible({ timeout: 15_000 })
      await best.click()

      // The picker's default serving label must be the real one (e.g. "3 oz cooked",
      // "1 cup") — proving the default isn't a bare "100 g" or wrong alternate.
      await expect(page.getByText(food.label).first()).toBeVisible({ timeout: 8_000 })

      // The preview macros identify the selected default serving. A wrong default
      // (e.g. "1 cup" crab = P23, or a 100 g value) would show different numbers.
      await expect(page.getByText(new RegExp(`P:\\s*${food.p}\\s*g`)).first()).toBeVisible({ timeout: 8_000 })
      await expect(page.getByText(new RegExp(`C:\\s*${food.c}\\s*g`)).first()).toBeVisible()
      await expect(page.getByText(new RegExp(`F:\\s*${food.f}\\s*g`)).first()).toBeVisible()
    })
  }
})
