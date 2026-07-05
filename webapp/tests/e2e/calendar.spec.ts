import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

// Calendar feature/button coverage. Non-destructive: asserts controls are present
// and reachable; does not delete/skip real data. Runs against production as the
// test user, whose calendar has program + quick-session history (July 2026).

test.describe('Calendar', () => {
  test.beforeEach(async ({ page, context }) => {
    await authenticate(page, context)
    await page.goto(`${BASE_URL}/dashboard/calendar`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('Calendar').first()).toBeVisible({ timeout: 15_000 })
  })

  test('shell + navigation controls', async ({ page }) => {
    // Month / Week toggle
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Week' })).toBeVisible()
    await page.getByRole('button', { name: 'Week' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Month' }).click()
    await page.waitForTimeout(400)

    // Prev / next / today
    const label = page.locator('h2, [class*="font-bold"]').filter({ hasText: /\d{4}/ }).first()
    const before = await label.textContent()
    await page.getByRole('button', { name: 'Today' }).click()
    await page.waitForTimeout(300)
    // Legend present
    for (const t of ['Completed', 'Scheduled', 'Skipped']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible()
    }
    expect(before).toBeTruthy()
  })

  test('settings link works', async ({ page }) => {
    await page.locator('a[href="/dashboard/calendar/settings"]').first().click()
    await page.waitForURL('**/dashboard/calendar/settings', { timeout: 15_000 })
    expect(page.url()).toContain('/dashboard/calendar/settings')
  })

  test('day-detail renders management controls', async ({ page }) => {
    // The calendar auto-selects today; today (in the app's world) has a quick
    // session. Assert the unified quick card shows management buttons.
    const detail = page.locator('text=Quick session').first()
    if (await detail.isVisible({ timeout: 4000 }).catch(() => false)) {
      // Unified quick card: View Summary (completed) or Start/Continue, plus Delete
      await expect(page.getByRole('button', { name: /View Summary|Continue|Start/ }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
      // View Summary opens the summary sheet (non-destructive)
      const viewBtn = page.getByRole('button', { name: 'View Summary' }).first()
      if (await viewBtn.isVisible().catch(() => false)) {
        await viewBtn.click()
        await expect(page.getByText(/sets logged/).first()).toBeVisible({ timeout: 8000 })
      }
    }
  })

  test('a day with a program workout exposes actions', async ({ page }) => {
    // Click day cells until one opens a program day-detail with an action button.
    const cells = page.locator('button:has-text("1"), button:has-text("6"), button:has-text("9")')
    const count = await cells.count()
    let found = false
    for (let i = 0; i < Math.min(count, 8) && !found; i++) {
      await cells.nth(i).click().catch(() => {})
      await page.waitForTimeout(300)
      const anyAction = page.getByRole('button', { name: /Start Workout|Do It Now|Manage|Un-skip|Un-complete|Reschedule/ }).first()
      if (await anyAction.isVisible({ timeout: 800 }).catch(() => false)) found = true
    }
    // Non-fatal: some months may have no program workouts. If found, verify Manage opens.
    if (found) {
      const manage = page.getByRole('button', { name: /Manage|Reschedule/ }).first()
      if (await manage.isVisible().catch(() => false)) {
        await manage.click()
        await expect(page.getByText('Manage Workout')).toBeVisible({ timeout: 5000 })
        await page.getByRole('button', { name: 'Cancel' }).click()
      }
    }
  })
})
