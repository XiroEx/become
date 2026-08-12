import { test, expect } from '@playwright/test'
import { E2E_USER, BASE_URL, signToken } from './test-auth'

/**
 * Combining items that are ALREADY logged into one entry.
 *
 * The other half of the meals work: the search-sheet basket only helps going
 * forward, but three items logged separately an hour ago should still be
 * foldable into "Turkey sandwich" without re-logging them.
 *
 * The invariant worth protecting is that combining MOVES items — the day's
 * totals must not change. A merge that double-counts is worse than no merge,
 * because it silently inflates the number the member is steering by.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3210 npx playwright test --project=meal-combine
 */

const ITEMS = ['Zeta Burger Patty', 'Zeta Brioche Bun', 'Zeta Burger Sauce']
const CALS = { 'Zeta Burger Patty': 250, 'Zeta Brioche Bun': 180, 'Zeta Burger Sauce': 90 }

function token() {
  return signToken(E2E_USER.id, E2E_USER.email, E2E_USER.role)
}

async function auth(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  const t = token()
  const url = new URL(BASE_URL)
  await context.addCookies([
    { name: 'auth_token', value: t, domain: url.hostname, path: '/', httpOnly: false,
      secure: url.protocol === 'https:', sameSite: 'Lax' },
  ])
  await page.addInitScript(v => localStorage.setItem('token', v as string), t)
}

async function skipTour(page: import('@playwright/test').Page) {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400)
    if (await page.locator('.rtut-shield').count() === 0) {
      await page.waitForTimeout(400)
      if (await page.locator('.rtut-shield').count() === 0) return
    }
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  }
  throw new Error('tour shield never cleared')
}

test.describe('Combine already-logged items', () => {
  // Each test logs its own three SEPARATE entries, which is the state this
  // feature exists to clean up.
  test.beforeEach(async ({ request }) => {
    const t = token()
    const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
    const today = new Date().toISOString().slice(0, 10)

    const existing = await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })
    if (existing.ok()) {
      const body = await existing.json()
      for (const log of body.logs ?? []) {
        await request.delete(`${BASE_URL}/api/meal-logs/${log._id}`, { headers })
      }
    }

    const foods = await request.get(`${BASE_URL}/api/nutrition/foods?q=Zeta`, { headers })
    const { foods: found } = await foods.json()
    for (const name of ITEMS) {
      const food = found.find((f: { name: string }) => f.name === name)
      expect(food, `seed food missing: ${name}`).toBeTruthy()
      const res = await request.post(`${BASE_URL}/api/meal-logs`, {
        headers,
        data: {
          source: 'manual',
          tags: ['breakfast'],
          items: [{
            foodId: food._id,
            name: food.name,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            servings: 1,
            nutrition: food.nutrition,
          }],
        },
      })
      expect(res.status(), `failed to seed log for ${name}`).toBe(201)
    }
  })

  test('three separate entries fold into one without changing the day', async ({ page, context, request }) => {
    const headers = { Authorization: `Bearer ${token()}` }
    const today = new Date().toISOString().slice(0, 10)

    const before = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    expect(before.logs).toHaveLength(3)
    const calsBefore = before.logs.reduce((n: number, l: { totalNutrition?: { calories: number } }) =>
      n + (l.totalNutrition?.calories ?? 0), 0)
    expect(calsBefore).toBe(CALS['Zeta Burger Patty'] + CALS['Zeta Brioche Bun'] + CALS['Zeta Burger Sauce'])

    await auth(page, context)
    await page.goto(`${BASE_URL}/dashboard/nutrition`)
    await page.waitForLoadState('domcontentloaded')
    await skipTour(page)

    // Enter select mode from the section kebab.
    // Exact: the section header button's accessible name CONTAINS the kebab's,
    // so a substring match resolves to two elements.
    await page.getByRole('button', { name: 'More actions for Breakfast', exact: true }).click()
    const start = page.getByTestId('combine-start-breakfast')
    await expect(start).toBeVisible({ timeout: 10_000 })
    await start.click()

    // Pick every item, then combine.
    for (const name of ITEMS) {
      await page.getByRole('button', { name: `Select ${name}` }).click()
    }
    await expect(page.getByTestId('combine-bar-breakfast')).toContainText('3 selected')

    await page.getByTestId('combine-name-breakfast').fill('Zeta Combined Burger')
    await page.getByTestId('combine-submit-breakfast').click()

    await expect(page.getByText('Zeta Combined Burger').first()).toBeVisible({ timeout: 20_000 })

    // The day MOVED, it did not grow: one log now, same calories as before.
    const after = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    expect(after.logs).toHaveLength(1)
    expect(after.logs[0].items).toHaveLength(3)
    expect(after.logs[0].mealName).toBe('Zeta Combined Burger')
    expect(after.logs[0].totalNutrition.calories).toBe(calsBefore)

    // Fresh subdocument ids — reusing the source ids would make edit/delete on
    // the merged entry act on rows that no longer exist.
    const ids = after.logs[0].items.map((i: { _id: string }) => i._id)
    expect(new Set(ids).size).toBe(3)
  })

  test('combining a subset leaves the rest of the day alone', async ({ request }) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }
    const today = new Date().toISOString().slice(0, 10)

    const before = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    const picks = before.logs.slice(0, 2).map((l: { _id: string; items: { _id: string }[] }) => ({
      logId: l._id, itemId: l.items[0]._id,
    }))

    const res = await request.post(`${BASE_URL}/api/meal-logs/combine`, {
      headers,
      data: { picks, mealName: 'Zeta Pair', saveAsMeal: true },
    })
    expect(res.status()).toBe(201)

    const after = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    // Two source logs emptied and removed, one merged log created, third untouched.
    expect(after.logs).toHaveLength(2)
    const merged = after.logs.find((l: { mealName?: string }) => l.mealName === 'Zeta Pair')
    expect(merged.items).toHaveLength(2)

    // Totals across the day are unchanged.
    const total = after.logs.reduce((n: number, l: { totalNutrition?: { calories: number } }) =>
      n + (l.totalNutrition?.calories ?? 0), 0)
    expect(total).toBe(CALS['Zeta Burger Patty'] + CALS['Zeta Brioche Bun'] + CALS['Zeta Burger Sauce'])
  })

  test('a single item is refused — that is a rename, not a combination', async ({ request }) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }
    const today = new Date().toISOString().slice(0, 10)
    const before = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    const one = before.logs[0]

    const res = await request.post(`${BASE_URL}/api/meal-logs/combine`, {
      headers,
      data: { picks: [{ logId: one._id, itemId: one.items[0]._id }], saveAsMeal: false },
    })
    expect(res.status()).toBe(400)

    // And nothing was touched.
    const after = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    expect(after.logs).toHaveLength(3)
  })

  test('a stale item id changes nothing', async ({ request }) => {
    const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }
    const today = new Date().toISOString().slice(0, 10)
    const before = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()

    const res = await request.post(`${BASE_URL}/api/meal-logs/combine`, {
      headers,
      data: {
        picks: [
          { logId: before.logs[0]._id, itemId: before.logs[0].items[0]._id },
          { logId: before.logs[1]._id, itemId: '000000000000000000000000' },
        ],
        saveAsMeal: false,
      },
    })
    expect(res.status()).toBe(404)

    // Resolution happens before any write, so a bad pick must not half-merge.
    const after = await (await request.get(`${BASE_URL}/api/meal-logs?date=${today}`, { headers })).json()
    expect(after.logs).toHaveLength(3)
  })
})
