import { test, expect } from '@playwright/test'
import { BASE_URL, E2E_USER, signToken } from './test-auth'

/**
 * "Schedule meals" has three states, and WHERE it sits carries the meaning:
 *
 *   future day → above the timeline (scheduling is all you can do on that day)
 *   today      → below the water tracker, at the end of the day, where the
 *                rest of today still is
 *   past day   → absent (no future left to plan)
 *
 * Two separate bugs live here, so both are asserted.
 *
 * 1. On a future day it must appear AND STAY. It used to be gated on the day
 *    already having tags, so on a fresh future day it rendered from the previous
 *    day's tags still in state and vanished when they cleared — a sub-second
 *    flash. Asserting it is still there after the data settles is the whole
 *    point; a snapshot taken immediately would have passed against that build.
 *
 * 2. On today it must exist at all, and must be BELOW the water tracker. Today
 *    used to have no scheduling affordance whatsoever, even though the API has
 *    always accepted a plan dated today — you had to detour through the Meal
 *    Plan tile to reach it.
 */
// Was pinned to the coach's live account. Placement of the CTA is the same for
// every member, so it runs as the e2e account.
const USER = E2E_USER

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

  // ── Today: present, exactly once, and BELOW the water tracker ─────────────
  await expect(cta).toHaveCount(1)
  await expect(cta.first()).toBeVisible()

  // Position is the feature, so assert position rather than mere presence.
  const water = page.getByText('Water', { exact: true }).first()
  await expect(water).toBeVisible()
  const waterY = (await water.boundingBox())?.y ?? -1
  const ctaY = (await cta.first().boundingBox())?.y ?? -1
  expect(waterY).toBeGreaterThan(0)
  expect(ctaY).toBeGreaterThan(waterY)

  // ── Yesterday: nothing to schedule ────────────────────────────────────────
  await page.getByRole('button', { name: /Previous day/i }).first().click()
  await page.waitForTimeout(1200)
  await expect(cta).toHaveCount(0)
  await page.getByRole('button', { name: /Next day/i }).first().click()
  await page.waitForTimeout(1200)

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

  // And on a future day the position FLIPS: it leads instead of trailing.
  const futureWaterY = (await page.getByText('Water', { exact: true }).first().boundingBox())?.y ?? -1
  const futureCtaY = (await cta.first().boundingBox())?.y ?? -1
  expect(futureWaterY).toBeGreaterThan(0)
  expect(futureCtaY).toBeLessThan(futureWaterY)

  // And it opens the drawer.
  await cta.first().click()
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()
  expect(body).toMatch(/schedule|plan/i)
})
