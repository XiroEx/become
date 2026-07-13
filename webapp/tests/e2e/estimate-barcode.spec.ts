import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

test('estimate → Add more offers Barcode (not Snap/Upload), scanner opens above the plate', async ({ page, context }) => {
  await authenticate(page, context)
  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')
  const skip = page.locator('button:has-text("Skip for Today")')
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click({ force: true })
  await page.waitForTimeout(500)

  // Dismiss the onboarding coachmark — it overlays and intercepts the FAB.
  for (let i = 0; i < 4; i++) {
    const coach = page.locator('button[aria-label*="lose" i], button:has-text("×")').first()
    if (await coach.isVisible({ timeout: 1500 }).catch(() => false)) {
      await coach.click({ force: true }).catch(() => {})
      await page.waitForTimeout(400)
    } else break
  }
  await page.waitForTimeout(400)

  // Open food search, then hand the text to the describe estimator.
  await page.locator('button[aria-label="Add food"]').first().click({ force: true })
  const search = page.getByPlaceholder(/search/i).first()
  await search.waitFor({ timeout: 15_000 })
  await search.fill('one medium apple')
  await page.locator('button[aria-label="Describe this meal to estimate macros"]').click()

  // The describe screen opens prefilled — kick off the actual estimate.
  const estimateBtn = page.locator('button:has-text("Estimate")')
  await estimateBtn.waitFor({ timeout: 15_000 })
  await estimateBtn.click()

  // Wait for the AI estimate to reach the review phase.
  const addMore = page.locator('button:has-text("Missing something")')
  await addMore.waitFor({ timeout: 150_000 })
  await addMore.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'tests/e2e/screenshots/estimate-review.png' })

  // Open "Add more".
  await addMore.click()
  await page.waitForTimeout(1000)

  // NEW: barcode is offered here…
  const barcodeBtn = page.locator('[data-testid="barcode-scan-btn"]')
  await expect(barcodeBtn).toBeVisible({ timeout: 10_000 })

  // …but the loop-inducing capture actions stay withheld. Exact match: the
  // capture-row buttons are literally "Snap" / "Upload" (the describe screen's
  // "Upload photo" is a different control and must not be matched here).
  await expect(page.getByRole('button', { name: 'Snap', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'tests/e2e/screenshots/addmore-barcode.png' })

  // The scanner and the plate modal are BOTH z-[60] — prove the scanner wins.
  await barcodeBtn.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'tests/e2e/screenshots/addmore-scanner.png' })

  // Headless has no camera, so the scanner shows its manual-entry fallback.
  const scannerSurface = page.locator('input[placeholder*="barcode" i], text=/enter.*barcode/i').first()
  await expect(scannerSurface).toBeVisible({ timeout: 15_000 })
})
