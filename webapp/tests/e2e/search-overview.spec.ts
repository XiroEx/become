import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_USER, signToken } from './test-auth'

/**
 * The empty-box landing view must RENDER, not crash.
 *
 * Its first version returned raw Food docs, whose nutrition lives on the default
 * variant rather than the top level, so the row renderer threw on
 * `food.nutrition.calories` and the whole sheet unmounted into "This page
 * couldn't load". A unit test on shapes would not have caught that; only opening
 * the sheet does.
 */
// Was pinned to the coach's live account. This asserts that the sheet RENDERS,
// which is true of any authenticated member, so it runs as the e2e account.
const USER = E2E_USER

test('the default view renders sections and does not crash', async ({ page, context }) => {
  const token = signToken(USER.id, USER.email, 'user')
  const url = new URL(BASE_URL)
  await context.addCookies([
    { name: 'auth_token', value: token, domain: url.hostname, path: '/', httpOnly: false,
      secure: url.protocol === 'https:', sameSite: 'Lax' },
  ])
  await page.addInitScript(t => localStorage.setItem('token', t as string), token)
  // addInitScript runs before the document is parsed, so documentElement may not
  // exist yet — appending blind threw and polluted the pageerror assertion below
  // with a fault from the harness itself.
  await page.addInitScript(() => {
    const inject = () => {
      const el = document.documentElement || document.head || document.body
      if (!el) return false
      const s = document.createElement('style')
      s.textContent = 'nextjs-portal{display:none!important}'
      el.appendChild(s)
      return true
    }
    if (!inject()) document.addEventListener('DOMContentLoaded', () => { inject() })
  })

  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')
  for (let i = 0; i < 10; i++) {
    if (await page.locator('.rtut-shield').count() === 0) break
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
  }

  await page.getByRole('button', { name: /Search foods/i }).first().click()
  await expect(page.getByPlaceholder(/Search or describe foods/i)).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2500)

  // The crash symptom, asserted directly.
  await expect(page.getByText(/This page couldn't load/i)).toHaveCount(0)
  await expect(page.getByText(/Type at least 2 characters/i)).toHaveCount(0)

  // At least one section header, and real rows under it.
  const body = await page.locator('body').innerText()
  expect(body).toMatch(/Recent|Frequent|Your foods/i)
  expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([])
})
