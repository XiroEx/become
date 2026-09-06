import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, E2E_USER, signToken } from './test-auth'

// Verifies the fix for "the save button is completely blocked by the main nav
// on Meal Schedule page". The autosave status pill was positioned with the
// plain `bottom-20` Tailwind class (a static 80px), while BottomNav floats at
// `env(safe-area-inset-bottom) + 10px`. Headless Chromium reports a 0px safe
// area by default, so the bug never reproduced on desktop — it only showed up
// on a real notched phone, where the nav shifts up by the home-indicator
// inset and its z-40 pill renders on top of the status pill's z-30. This test
// uses the CDP Emulation.setSafeAreaInsetsOverride hook to simulate that
// inset in a real browser and asserts the two elements no longer overlap.

const IPHONE_HOME_INDICATOR_INSET = 34 // px — iPhone with a home indicator (e.g. 14/15 series)

async function signIn(page: Page) {
  // Was: a PLAYWRIGHT_TEST_USER_ID lookup that fell back to a real member's id,
  // signed with a hand-parsed JWT_SECRET and NO expiry claim (AuthGuard treats
  // an expiry-less token as expired). Both are handled by test-auth now.
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const u = new URL(BASE_URL)
  await page.context().addCookies([{ name: 'auth_token', value: token, domain: u.hostname, path: '/', httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax' }])
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), token)
}

test.use({ viewport: { width: 390, height: 844 } })

test('autosave status pill clears the bottom nav on a notched device', async ({ page, context }) => {
  await signIn(page)

  // Simulate an iPhone home-indicator safe area — CDP override, not a CSS
  // trick, so `env(safe-area-inset-bottom)` really resolves to this value.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { bottom: IPHONE_HOME_INDICATOR_INSET, bottomMax: IPHONE_HOME_INDICATOR_INSET },
  })

  await page.goto(`${BASE_URL}/dashboard/nutrition/meal-schedule`, { waitUntil: 'domcontentloaded' })

  const status = page.locator('[data-testid="save-status"]')
  await expect(status).toBeVisible({ timeout: 15_000 })
  const nav = page.locator('nav[aria-label="Primary"]')
  await expect(nav).toBeVisible()

  const statusBox = await status.boundingBox()
  const navBox = await nav.boundingBox()
  expect(statusBox, 'save-status has a layout box').not.toBeNull()
  expect(navBox, 'bottom nav has a layout box').not.toBeNull()

  console.log(`status pill: y=${statusBox!.y} h=${statusBox!.height} | nav: y=${navBox!.y} h=${navBox!.height}`)

  // The pill must sit entirely above the nav — no vertical overlap — even
  // with the nav's own safe-area offset pushing it up.
  expect(
    statusBox!.y + statusBox!.height,
    'save-status bottom edge must clear the nav top edge',
  ).toBeLessThanOrEqual(navBox!.y)

  // A future regression back to a bare `bottom-*` Tailwind class (no
  // safe-area term) would pass the check above by coincidence at 0 offset —
  // pin the actual computed style so that can't happen silently.
  const bottomPx = await status.evaluate((el) => parseFloat(getComputedStyle(el.parentElement!).bottom))
  expect(bottomPx, 'status container bottom must include the safe-area inset').toBeGreaterThanOrEqual(80 + IPHONE_HOME_INDICATOR_INSET - 1)
})
