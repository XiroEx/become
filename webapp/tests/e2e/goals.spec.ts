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

test('Becoming details: Fuel and Training screens show then→now→next; Story lists the weeks', async ({ page }) => {
  const errs = await signIn(page)
  await page.emulateMedia({ reducedMotion: 'reduce' }) // skip the stage intro; we are testing the details screens
  await page.goto(`${BASE}/dashboard/mind/becoming`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/becoming/journey') && r.ok(), { timeout: 60_000 })
  await settle(page)
  await page.locator('[data-testid="week-card-details"]').click({ timeout: 15_000 })
  await page.waitForResponse(r => r.url().includes('/api/goals') && r.ok(), { timeout: 60_000 })
  await expect(page.locator('[data-testid="details-screen-mind"]')).toBeVisible()
  await page.locator('[data-testid="details-tab-fuel"]').click()
  const fuel = page.locator('[data-testid="details-screen-fuel"]')
  await expect(fuel).toBeVisible()
  await page.waitForTimeout(600)
  const ft = (await fuel.innerText()).replace(/\s+/g, ' ')
  console.log('FUEL:', ft.slice(0, 300))
  expect(ft).toMatch(/Then/i); expect(ft).toMatch(/Now/i); expect(ft).toMatch(/Next/i)
  expect(ft).toMatch(/205 lbs/)
  expect(ft).toMatch(/Logged \d\/7 days/)
  await page.locator('[data-testid="details-tab-training"]').click()
  const tr = page.locator('[data-testid="details-screen-training"]')
  await expect(tr).toBeVisible(); await page.waitForTimeout(500)
  const tt = (await tr.innerText()).replace(/\s+/g, ' ')
  console.log('TRAINING:', tt.slice(0, 300))
  expect(tt).toMatch(/\/wk/); expect(tt).toMatch(/This week \d\/5/)
  await page.locator('[data-testid="details-tab-story"]').click()
  await expect(page.locator('[data-testid="details-screen-story"]')).toBeVisible()
  expect(await page.locator('[data-testid="details-week-row"]').count()).toBeGreaterThan(3)
  await page.screenshot({ path: 'tests/e2e/screenshots/becoming-details-story.png' })
  // Tapping a week flies the stage there and closes the sheet.
  await page.locator('[data-testid="details-week-row"]').nth(2).click()
  await expect(page.locator('[data-testid="becoming-details"]')).toHaveCount(0)
  await page.waitForTimeout(1200)
  expect(await page.locator('[data-testid="journey-counter"]').innerText()).toMatch(/Week \d+ of \d+/)
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
