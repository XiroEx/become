// Goals: Becoming panels, plan card, settings pace picker, dashboard tile ETA.
// Read-only for Jon except the pace PUT (which we set back to what it was).
//   PLAYWRIGHT_BASE_URL=http://localhost:3210 PLAYWRIGHT_AUTH_TOKEN=<jwt> npx playwright test --project=goals

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3210'
const TOKEN = process.env.PLAYWRIGHT_AUTH_TOKEN || readFileSync('/tmp/hb/jon.local.token', 'utf8').trim()

async function signIn(page: Page) {
  const errs: string[] = []
  page.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 160)))
  page.on('response', r => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`) })
  const u = new URL(BASE)
  await page.context().addCookies([{ name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/', httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax' }])
  await page.route('**/api/checkin', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : route.continue())
  await page.goto(`${BASE}/login`)
  await page.evaluate(t => localStorage.setItem('token', t), TOKEN)
  return errs
}
async function settle(page: Page) {
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
}

test.use({ viewport: { width: 390, height: 844 } })

test('Becoming shows Nutrition + Training then→now→next and a 3-pillar work-on card', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard/mind/becoming`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/goals') && r.ok(), { timeout: 60_000 })
  await settle(page); await page.waitForTimeout(1200)
  const nut = (await page.locator('[data-testid="becoming-nutrition"]').innerText()).replace(/\s+/g, ' ')
  const tr = (await page.locator('[data-testid="becoming-training"]').innerText()).replace(/\s+/g, ' ')
  const wo = (await page.locator('[data-testid="becoming-work-on"]').innerText()).replace(/\s+/g, ' ')
  console.log('NUTRITION:', nut); console.log('TRAINING:', tr); console.log('WORK ON:', wo)
  expect(nut).toMatch(/Then/i); expect(nut).toMatch(/Now/i); expect(nut).toMatch(/Next/i)
  expect(nut).toMatch(/205 lbs/)            // target
  expect(nut).toMatch(/Logged \d\/7 days/)  // adherence
  expect(tr).toMatch(/\/wk/)                // avg + target
  expect(tr).toMatch(/This week \d\/5/)
  expect(wo).toMatch(/Where to work on/i)
  const rows = await page.locator('[data-testid="becoming-work-on"] a').count()
  expect(rows).toBe(2) // nutrition + training links (mind focus is a plain row)
  await page.evaluate(() => { const el = document.getElementById('app-scroll') || document.scrollingElement!; el.scrollTop = 900 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'tests/e2e/screenshots/becoming-pillars.png' })
  expect(errs, errs.join('\n')).toEqual([])
})

test('nutrition goals page shows the plan card with pace chips; changing pace updates the ETA and persists', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard/nutrition/goals`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/goals') && r.ok(), { timeout: 60_000 })
  await settle(page); await page.waitForTimeout(800)
  const card = page.locator('[data-testid="plan-card"]')
  await expect(card).toBeVisible()
  const before = (await card.innerText()).replace(/\s+/g, ' ')
  console.log('PLAN before:', before)
  expect(before).toMatch(/205 lbs/)
  expect(before).toMatch(/at this pace ~3 wks/)
  // 1.5 lb/wk → ~2 wks
  await card.locator('[data-testid="pace-1.5"]').click()
  await page.waitForResponse(r => r.url().includes('/api/goals') && r.request().method() === 'PUT' && r.ok(), { timeout: 30_000 })
  await page.waitForTimeout(400)
  const after = (await card.innerText()).replace(/\s+/g, ' ')
  console.log('PLAN after :', after)
  expect(after).toMatch(/at this pace ~2 wks/)
  // put it back
  await card.locator('[data-testid="pace-1"]').click()
  await page.waitForResponse(r => r.url().includes('/api/goals') && r.request().method() === 'PUT' && r.ok(), { timeout: 30_000 })
  await page.screenshot({ path: 'tests/e2e/screenshots/goals-plan-card.png' })
  expect(errs, errs.join('\n')).toEqual([])
})

test('settings shows the pace picker under target weight', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: 'domcontentloaded' })
  await settle(page); await page.waitForTimeout(1500)
  const picker = page.locator('[data-testid="pace-picker"]')
  await picker.scrollIntoViewIfNeeded()
  await expect(picker).toBeVisible()
  const eta = await page.locator('[data-testid="pace-eta"]').innerText()
  console.log('SETTINGS ETA:', eta)
  expect(eta).toMatch(/At this pace: ~\d wks?/)
  await page.screenshot({ path: 'tests/e2e/screenshots/goals-settings-pace.png' })
  expect(errs, errs.join('\n')).toEqual([])
})

test('dashboard goal tile carries the ETA', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/progress') && r.ok(), { timeout: 60_000 })
  await settle(page); await page.waitForTimeout(1200)
  const goal = (await page.locator('[data-tour="tile-goal"]').innerText()).replace(/\s+/g, ' ')
  console.log('GOAL TILE:', goal)
  expect(goal).toMatch(/3 lbs to go/)
  expect(goal).toMatch(/→ 205 lbs · ~3 wks/)
  expect(errs, errs.join('\n')).toEqual([])
})
