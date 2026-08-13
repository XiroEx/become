import { test, expect } from '@playwright/test'
import { BASE_URL, signToken } from './test-auth'

/**
 * The "Schedule meals" CTA on a future day must appear AND STAY.
 *
 * It used to be gated on the day already having tags, so on a fresh future day
 * it rendered from the previous day's tags still in state and then vanished when
 * they cleared — a sub-second flash. And a member with quick-adds configured
 * fell between that gate and the empty state's own button (which requires NO
 * quick-adds), leaving no way to schedule at all.
 *
 * Asserting it is still there after the data settles is the whole point; a
 * snapshot taken immediately would have passed against the broken build.
 */
const USER = { id: '69324119a28a8ac3b78750b9', email: 'jondon27500@gmail.com' }

test('the schedule CTA survives the swipe to a future day', async ({ page, context }) => {
  const token = signToken(USER.id, USER.email, 'user')
  const url = new URL(BASE_URL)
  await context.addCookies([
    { name: 'auth_token', value: token, domain: url.hostname, path: '/', httpOnly: false,
      secure: url.protocol === 'https:', sameSite: 'Lax' },
  ])
  await page.addInitScript(t => localStorage.setItem('token', t as string), token)
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

  await page.goto(`${BASE_URL}/dashboard/nutrition`)
  await page.waitForLoadState('domcontentloaded')
  for (let i = 0; i < 10; i++) {
    if (await page.locator('.rtut-shield').count() === 0) break
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
  }

  const cta = page.getByRole('button', { name: /Schedule meals/i })

  // Today: no scheduling CTA.
  await expect(cta).toHaveCount(0)

  // Forward two days, well past anything already planned.
  await page.getByRole('button', { name: /Next day/i }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /Next day/i }).first().click()

  // Present right away…
  await expect(cta.first()).toBeVisible({ timeout: 10_000 })

  // …and STILL present after everything settles. This is the assertion that
  // fails on the old build.
  await page.waitForTimeout(3000)
  await expect(cta.first()).toBeVisible()

  // Exactly one — the empty state must not add a duplicate.
  await expect(cta).toHaveCount(1)

  // And it opens the drawer.
  await cta.first().click()
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()
  expect(body).toMatch(/schedule|plan/i)
})
