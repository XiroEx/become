import { test, expect } from '@playwright/test'
import { E2E_USER, BASE_URL, signToken } from './test-auth'

/**
 * Multi-select logging: build a basket in the search sheet and log it in one go.
 *
 * The pain this fixes is concrete — logging a burger, its bun and the sauce meant
 * opening the search sheet three times for about a dozen taps. The basket keeps
 * the sheet open, and saving the result as a reusable meal is the optional half.
 *
 * Runs against a scratch DB (`become_e2e_meals`) seeded with three "Zeta" foods,
 * so it never writes to a real member's day:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3210 npx playwright test meal-multiselect
 */

const ITEMS = ['Zeta Burger Patty', 'Zeta Brioche Bun', 'Zeta Burger Sauce']

async function auth(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  const token = signToken(E2E_USER.id, E2E_USER.email, E2E_USER.role)
  const url = new URL(BASE_URL)
  await context.addCookies([
    { name: 'auth_token', value: token, domain: url.hostname, path: '/', httpOnly: false,
      secure: url.protocol === 'https:', sameSite: 'Lax' },
  ])
  // The app reads localStorage['token'] — NOT 'auth_token'. Getting this wrong
  // leaves the cookie valid and the client still bouncing to /login.
  await page.addInitScript(t => localStorage.setItem('token', t as string), token)
}

/**
 * The onboarding tour mounts a `.rtut-shield` that swallows every click by
 * design, and it mounts a fresh step when the search sheet opens. Sampling the
 * shield once races that: it reads zero, then a step appears and eats the next
 * click. So poll for a quiet window instead of checking a single instant.
 */
async function skipTour(page: import('@playwright/test').Page) {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400)
    if (await page.locator('.rtut-shield').count() === 0) {
      // Confirm it stays gone before trusting it.
      await page.waitForTimeout(400)
      if (await page.locator('.rtut-shield').count() === 0) return
    }
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  }
  throw new Error('tour shield never cleared')
}

async function openSearch(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')
  await skipTour(page)
  // The page-level search button, not a per-meal "+": once the day has logs,
  // `/Add food/i` also matches the add button inside each logged meal card.
  await page.getByRole('button', { name: /Search foods/i }).first().click()
  const search = page.getByPlaceholder(/Search or describe foods/i)
  await expect(search).toBeVisible({ timeout: 20_000 })
  // A tour step can mount over the sheet after it opens.
  await skipTour(page)
  return search
}

/** Search for a food and add it (to the basket, in meal mode). */
async function addFood(page: import('@playwright/test').Page, name: string) {
  const search = page.getByPlaceholder(/Search or describe foods/i)
  await search.fill('')
  await search.fill(name)
  // The result row is a role=button container; clicking the bare text does not
  // expand the serving picker.
  const row = page.locator('[role="button"]').filter({ hasText: name }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
  // Exact: the basket CTA reads "Add to meal and log N", so a loose regex
  // matches both and trips strict mode.
  const cta = page.getByRole('button', { name: 'Add to meal', exact: true })
  await expect(cta).toBeVisible({ timeout: 10_000 })
  await cta.click()
  await expect(cta).toBeHidden({ timeout: 10_000 })
}

test.describe('Meal multi-select', () => {
  // Each test asserts on the day's totals, so they cannot share a day.
  test.beforeEach(async ({ request }) => {
    const token = signToken(E2E_USER.id, E2E_USER.email, E2E_USER.role)
    const today = new Date().toISOString().slice(0, 10)
    const res = await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) return
    const body = await res.json()
    for (const log of body.logs ?? []) {
      await request.delete(`${BASE_URL}/api/meal-logs/${log._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('three foods go in one basket and land as one log', async ({ page, context }) => {
    await auth(page, context)
    await openSearch(page)

    // Enter meal mode. Without this the first tap would log and close the sheet,
    // which is exactly the behaviour being replaced.
    await page.getByTestId('toggle-meal-mode').click()

    for (const name of ITEMS) await addFood(page, name)

    // The sheet stayed open and the basket counted every item.
    const basket = page.getByTestId('meal-basket')
    await expect(basket).toBeVisible()
    await expect(basket).toContainText('3')

    // Default name is derived from the contents and is editable in place.
    const nameField = page.getByTestId('meal-name')
    await expect(nameField).toBeVisible()
    await nameField.fill('Zeta Test Burger')

    await page.getByTestId('submit-basket').click()

    // The modal closes and the day reflects all three at once: 520 cal total
    // (250 + 180 + 90), which no single item could produce.
    await expect(page.getByPlaceholder(/Search or describe foods/i)).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText('Zeta Test Burger').first()).toBeVisible({ timeout: 20_000 })
  })

  test('the basket is not a one-way door', async ({ page, context }) => {
    await auth(page, context)
    await openSearch(page)
    await page.getByTestId('toggle-meal-mode').click()
    await addFood(page, ITEMS[0])
    await addFood(page, ITEMS[1])

    const basket = page.getByTestId('meal-basket')
    await expect(basket).toContainText('2')

    // Expand via the summary row (the tray container itself is not the toggle).
    await basket.getByRole('button', { name: /items?/ }).first().click()

    // Removing an item must not close the sheet or clear the rest.
    await page.getByRole('button', { name: `Remove ${ITEMS[0]}` }).click()
    await expect(basket).toContainText('1')
    await expect(page.getByPlaceholder(/Search or describe foods/i)).toBeVisible()
  })
})
