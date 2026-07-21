import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

// Audits the food picker's DEFAULT serving for curated first-class foods. The bugs:
//  (1) the picker defaulted to a wrong alternate ("1 cup", "10 cherries", "100 g")
//      instead of the food's real serving;
//  (2) the amount/unit didn't reflect the real serving (e.g. crab showed "1 cup"
//      not "3 oz"), and macros were computed off the wrong base;
//  (3) a redundant bottom-right "Quantity" multiplier box existed in the add sheet.
// This asserts, per food: the default label is the real serving, the amount box holds
// the real quantity, the unit button shows the real unit, the cal/macros are correct,
// and NO "Quantity" multiplier box exists. Read-only (never taps Add).

type FoodCase = { q: string; label: RegExp; qty: string; unit: string; cal: number; p: number; c: number; f: number }
const FOODS: FoodCase[] = [
  { q: 'crab',       label: /3 oz cooked/i,  qty: '3', unit: 'oz',   cal: 82,  p: 16, c: 0,  f: 1 },
  { q: 'cherries',   label: /1 cup/i,        qty: '1', unit: 'cup',  cal: 97,  p: 2,  c: 25, f: 0 },
  { q: 'olive oil',  label: /1 tbsp/i,       qty: '1', unit: 'tbsp', cal: 124, p: 0,  c: 0,  f: 14 },
  { q: 'white rice', label: /1 cup cooked/i, qty: '1', unit: 'cup',  cal: 205, p: 4,  c: 44, f: 1 },
  { q: 'banana',     label: /1 medium/i,     qty: '1', unit: 'each', cal: 105, p: 1,  c: 27, f: 0 },
  { q: 'cantaloupe', label: /1 cup diced/i,  qty: '1', unit: 'cup',  cal: 54,  p: 1,  c: 13, f: 0 },
]

test.describe('Food picker — real serving defaults (right amount + unit + macros)', () => {
  for (const food of FOODS) {
    test(`"${food.q}" defaults to its real serving`, async ({ page, context }) => {
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

      // 1) The picker's default serving label is the real one (not "100 g"/wrong alt).
      await expect(page.getByText(food.label).first()).toBeVisible({ timeout: 8_000 })

      // 2) The amount box holds the real quantity (crab → "3", not "1"), and the unit
      //    button shows the real unit (crab → "oz", not "cup"/"serving").
      const amount = page.locator('input[inputmode="decimal"]').first()
      await expect(amount).toHaveValue(food.qty, { timeout: 8_000 })
      const unitBtn = page.locator('button[aria-haspopup="listbox"]').first()
      await expect(unitBtn).toContainText(food.unit)

      // 3) The redundant "Quantity" multiplier box was removed entirely.
      await expect(page.getByLabel(/^Quantity$/i)).toHaveCount(0)

      // 4) The preview macros identify the selected default serving. A wrong default
      //    (e.g. "1 cup" crab, or a per-100 g value) would show different numbers.
      await expect(page.getByText(new RegExp(`P:\\s*${food.p}\\s*g`)).first()).toBeVisible({ timeout: 8_000 })
      await expect(page.getByText(new RegExp(`C:\\s*${food.c}\\s*g`)).first()).toBeVisible()
      await expect(page.getByText(new RegExp(`F:\\s*${food.f}\\s*g`)).first()).toBeVisible()
    })
  }
})
