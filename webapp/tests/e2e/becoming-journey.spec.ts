// The Becoming — the stage. Intro → focus, swipe, pinch to the line, tap a
// marker, details sheet, keyboard, reduced motion. Read-only for the member.
//   PLAYWRIGHT_BASE_URL=http://localhost:3210 PLAYWRIGHT_AUTH_TOKEN=<jwt> npx playwright test --project=becoming-journey

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFileSync } from 'fs'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3210'
const TOKEN = process.env.PLAYWRIGHT_AUTH_TOKEN || readFileSync('/tmp/hb/jon.token', 'utf8').trim()


async function open(page: Page) {
  const errs: string[] = []
  page.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 160)))
  page.on('response', r => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`) })
  const u = new URL(BASE)
  await page.context().addCookies([{ name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/', httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax' }])
  await page.goto(`${BASE}/login`)
  await page.evaluate(t => { localStorage.setItem('token', t); Object.keys(localStorage).filter(k => k.startsWith('becoming.intro')).forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('becoming.opened') }, TOKEN)
  await page.goto(`${BASE}/dashboard/mind/becoming`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/becoming/journey') && r.ok(), { timeout: 120_000 })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
  return errs
}

async function swipe(ctx: BrowserContext, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] })
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 8, y: y1 + (y2 - y1) * i / 8 }] }); await page.waitForTimeout(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}
async function pinchOut(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page)
  // Fingers start apart and CONVERGE = pinch in on the content = zoom out to the line.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 330 }, { x: 300, y: 540 }] })
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90 + i * 7, y: 330 + i * 7 }, { x: 300 - i * 7, y: 540 - i * 7 }] }); await page.waitForTimeout(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('intro plays, lands on the current week; swipe back; pinch out to the line; tap a week; details', async ({ page, context }) => {
  const errs = await open(page)
  const stage = page.locator('[data-testid="journey-stage"]')
  await expect(stage).toHaveAttribute('data-mode', 'intro')
  await expect(page.locator('[data-testid="journey-title"]')).toBeVisible()
  await expect(stage).toHaveAttribute('data-mode', 'focus', { timeout: 8000 })
  const total = Number((await page.locator('[data-testid="journey-counter"]').innerText()).match(/of (\d+)/)![1])
  expect(total).toBeGreaterThan(1)
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week ${total} of ${total}`)
  await expect(page.locator('[data-testid="week-card-current"]')).toBeVisible()
  await page.screenshot({ path: 'tests/e2e/screenshots/journey-focus.png' })

  // Swipe right = back one week.
  await swipe(context, page, 80, 480, 320, 480)
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week ${total - 1} of ${total}`, { timeout: 4000 })
  // Swipe left = forward.
  await swipe(context, page, 320, 480, 80, 480)
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week ${total} of ${total}`, { timeout: 4000 })
  // A vertical drag either steers along the path or is refused with a hint — never leaves focus.
  await swipe(context, page, 200, 300, 200, 560)
  await page.waitForTimeout(900)
  await expect(stage).toHaveAttribute('data-mode', 'focus')
  // Forward from the live week lands on the Horizon.
  await page.keyboard.press('End'); await page.waitForTimeout(900)
  await page.locator('[data-testid="journey-next"]').click()
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText('Horizon', { timeout: 4000 })
  await expect(page.locator('[data-testid="horizon-card"]')).toBeVisible()
  await page.screenshot({ path: 'tests/e2e/screenshots/journey-horizon.png' })
  await page.locator('[data-testid="journey-today"]').click()
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week ${total} of ${total}`, { timeout: 4000 })
  // The card's sparkline zooms out to the line.
  await page.locator('[data-testid="week-card-spark"]').click()
  await expect(stage).toHaveAttribute('data-mode', 'overview', { timeout: 4000 })
  await expect(page.locator('[data-testid="journey-hud"]')).toBeVisible()
  await page.locator('[data-testid="journey-zoom"]').click()
  await expect(stage).toHaveAttribute('data-mode', 'focus', { timeout: 4000 })

  // Pinch out → overview (the line).
  await pinchOut(context, page)
  await expect(stage).toHaveAttribute('data-mode', 'overview', { timeout: 4000 })
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`${total} weeks`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'tests/e2e/screenshots/journey-overview.png' })

  // Zoom toggle back in → focus on the same week.
  await page.locator('[data-testid="journey-zoom"]').click()
  await expect(stage).toHaveAttribute('data-mode', 'focus', { timeout: 4000 })

  // Details sheet.
  await page.locator('[data-testid="week-card-details"]').click()
  await expect(page.locator('[data-testid="becoming-details"]')).toBeVisible()
  await expect(page.locator('[data-testid="becoming-nutrition"]')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'tests/e2e/screenshots/journey-details.png' })
  await page.locator('button[aria-label="Close details"]').click()
  await expect(page.locator('[data-testid="becoming-details"]')).toHaveCount(0)

  // Keyboard.
  await page.keyboard.press('End')
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week ${total} of ${total}`, { timeout: 4000 })
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week ${total - 1} of ${total}`, { timeout: 4000 })
  await page.keyboard.press('Home')
  await expect(page.locator('[data-testid="journey-counter"]')).toHaveText(`Week 1 of ${total}`, { timeout: 4000 })
  await page.keyboard.press('End')
  await page.keyboard.press('-')
  await expect(stage).toHaveAttribute('data-mode', 'overview', { timeout: 4000 })
  expect(errs, errs.join('\n')).toEqual([])
})

test('reduced motion skips the intro and still navigates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errs = await open(page)
  const stage = page.locator('[data-testid="journey-stage"]')
  await expect(stage).toHaveAttribute('data-mode', 'focus')
  await expect(page.locator('[data-testid="journey-title"]')).toHaveCount(0)
  await page.locator('[data-testid="journey-prev"]').click()
  const c = await page.locator('[data-testid="journey-counter"]').innerText()
  expect(c).toMatch(/Week \d+ of \d+/)
  expect(errs, errs.join('\n')).toEqual([])
})

test('the sr-only week list exists for assistive tech', async ({ page }) => {
  await open(page)
  const list = page.locator('ol[aria-label="Your Becoming, week by week"] li')
  await expect(list.first()).toBeAttached({ timeout: 10_000 })
  expect(await list.count()).toBeGreaterThan(1)
})
