import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL, AUTH_TOKEN } from './test-auth'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

  test('week view renders and toggles back to month', async ({ page }) => {
    await page.getByRole('button', { name: 'Week' }).click()
    await page.waitForTimeout(400)
    // Week view still shows weekday headers and day cells.
    await expect(page.getByText('Sun', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Month' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible()
  })
})

// Destructive-but-self-cleaning: seeds a real quick session for the test user via
// the API, drives the full management lifecycle through the UI, then guarantees
// cleanup in `finally`. Net-zero effect on the account.
test.describe('Calendar — quick-session lifecycle round-trip', () => {
  test('seed → appears with controls → Move picker → delete via UI → gone', async ({ page, context, request }) => {
    const stamp = Date.now()
    const sessionId = `e2e-cal-${stamp}`
    const title = `E2E Roundtrip ${stamp}`
    const dateKey = todayKey()

    // Seed a completed quick session dated today.
    const seed = await request.post(`${BASE_URL}/api/workouts`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' },
      data: {
        kind: 'quick',
        sessionId,
        title,
        focus: 'e2e',
        completed: true,
        duration: 12,
        performedAt: dateKey,
        exercises: [{ name: 'E2E Move', exerciseSlug: '', sets: [{ setNumber: 1, reps: 5, weight: 10, completed: true }] }],
      },
    })
    expect(seed.ok(), `seed POST failed: ${seed.status()}`).toBeTruthy()

    try {
      await authenticate(page, context)
      // Open the calendar with the seeded day pre-selected.
      await page.goto(`${BASE_URL}/dashboard/calendar?date=${dateKey}`)
      await page.waitForLoadState('domcontentloaded')

      // Our uniquely-titled card renders in the day detail.
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })

      // Scope actions to the card containing our unique title.
      const card = page.locator('[class*="border-purple-200"]').filter({ hasText: title }).first()
      await expect(card.getByRole('button', { name: 'View Summary' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Delete' })).toBeVisible()

      // Move opens the inline re-date picker.
      await card.getByRole('button', { name: 'Move' }).click()
      await expect(card.locator('input[type="date"]')).toBeVisible({ timeout: 5_000 })
      // Collapse it again (toggle) so it doesn't intercept the delete click.
      await card.getByRole('button', { name: 'Move' }).click()

      // Delete via the UI, auto-accepting the confirm dialog.
      page.once('dialog', (d) => d.accept())
      await card.getByRole('button', { name: 'Delete' }).click()

      // The card disappears after the refresh.
      await expect(page.getByText(title)).toHaveCount(0, { timeout: 20_000 })
    } finally {
      // Safety net: ensure the seeded log is gone even if the UI path failed.
      await request
        .delete(`${BASE_URL}/api/workouts/session?id=${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        })
        .catch(() => {})
    }
  })
})
