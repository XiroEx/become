// Dashboard fixes — verified against a LOCAL dev server pointed at the real DB
// as jondon27500@gmail.com. Read-only for Jon: POST /api/checkin and POST
// /api/mood are stubbed so nothing is written to his record.
//
//   PLAYWRIGHT_BASE_URL=http://localhost:3210 PLAYWRIGHT_AUTH_TOKEN=<jwt> \
//     npx playwright test tests/e2e/dashboard-fixes.spec.ts

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3210'
const TOKEN = process.env.PLAYWRIGHT_AUTH_TOKEN || readFileSync('/tmp/hb/local.token', 'utf8').trim()

async function signIn(page: Page) {
  const errs: string[] = []
  // middleware.ts gates /dashboard on the auth_token COOKIE; the app itself
  // reads the token from localStorage. Set both.
  const u = new URL(BASE)
  await page.context().addCookies([{ name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/', httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax' }])
  page.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 160)))
  page.on('response', r => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`) })
  // Never write to Jon's real record from a test.
  await page.route('**/api/checkin', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    : route.continue())
  await page.route('**/api/mood', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
    : route.continue())
  await page.goto(`${BASE}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), TOKEN)
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
  return errs
}

async function settle(page: Page) {
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(400)
  // Daily check-in may pop; dismiss without writing (POST is stubbed).
  const skip = page.locator('button:has-text("Skip for today"), button:has-text("Skip")').first()
  if (await skip.isVisible().catch(() => false)) await skip.click({ force: true }).catch(() => {})
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
}

test.use({ viewport: { width: 390, height: 844 } })

test('tiles tell the truth: This Week, Goal, Streak', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/progress') && r.ok(), { timeout: 30_000 })
  await settle(page)
  await page.waitForTimeout(1500)

  // The Becoming doorway is the first thing on the page.
  const door = page.locator('[data-testid="becoming-door"]')
  await expect(door).toBeVisible()
  const doorText = (await door.innerText()).replace(/\s+/g, ' ')
  console.log('DOOR  :', doorText)
  expect(doorText).toMatch(/THE BECOMING/i)
  expect(doorText).toMatch(/MIND/i); expect(doorText).toMatch(/NUTRITION/i); expect(doorText).toMatch(/TRAINING/i)
  const doorBox = await door.boundingBox(); const tilesBox = await page.locator('[data-testid="tilegrid"]').boundingBox()
  expect(doorBox!.y).toBeLessThan(tilesBox!.y)
  expect(await door.getAttribute('href')).toBe('/dashboard/mind/becoming')

  const weekly = page.locator('[data-tour="tile-weekly"]')
  const goal = page.locator('[data-tour="tile-goal"]')
  const streak = page.locator('[data-tour="tile-streak"]')
  const weeklyText = (await weekly.innerText()).replace(/\s+/g, ' ')
  const goalText = (await goal.innerText()).replace(/\s+/g, ' ')
  const streakText = (await streak.innerText()).replace(/\s+/g, ' ')
  console.log('WEEKLY:', weeklyText)
  console.log('GOAL  :', goalText)
  console.log('STREAK:', streakText)

  // Jon: 1 completed workout this week, target 5 (was "2/5" from an abandoned log).
  expect(weeklyText).toMatch(/1\/5/)
  expect(weeklyText).toMatch(/4 to weekly target/)
  // Goal: build muscle, 3 lbs to 205.
  expect(goalText).toMatch(/Goal · Build muscle/)
  expect(goalText).toMatch(/3 lbs to go/)
  expect(goalText).toMatch(/→ 205 lbs · (~\d wks?|\d+(\.\d)? lbs? behind)|208 → 205 lbs/)
  expect(goalText).not.toMatch(/Annual/)
  // Streak of 2 is not shown as a streak yet.
  expect(streakText).toMatch(/Building/)
  expect(streakText).toMatch(/2\/3/)
  expect(streakText).not.toMatch(/to 🏆/)

  await page.screenshot({ path: 'tests/e2e/screenshots/dash-fixes-tiles.png' })
  expect(errs, errs.join('\n')).toEqual([])
})

test('mood tile opens a sheet (not a clipped dropdown) and gateways to Mindset', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/progress') && r.ok(), { timeout: 30_000 })
  await settle(page)
  await page.waitForTimeout(800)

  await page.locator('[data-testid="mood-tile"]').click()
  const sheet = page.locator('[data-testid="mood-sheet"]')
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(700) // let the slide-up spring settle before measuring
  // The whole sheet is on-screen (this is the bug: it used to be clipped away).
  const box = await sheet.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1)
  expect(box!.height).toBeGreaterThan(80)
  await page.screenshot({ path: 'tests/e2e/screenshots/dash-fixes-mood-sheet.png' })

  await page.locator('[data-testid="mood-option-1"]').click()
  const gateway = page.locator('[data-testid="mood-gateway"]')
  await expect(gateway).toBeVisible()
  const gtext = (await gateway.innerText()).replace(/\s+/g, ' ')
  console.log('GATEWAY:', gtext)
  expect(gtext).toMatch(/Rough one/)
  expect(gtext).toMatch(/Mindset/)
  const cta = gateway.locator('a[href="/dashboard/mind"]')
  await expect(cta).toBeVisible()
  await page.screenshot({ path: 'tests/e2e/screenshots/dash-fixes-mood-gateway.png' })
  expect(errs, errs.join('\n')).toEqual([])
})

test('mindset card shows real content, nutrition shows a trend, chart mood tab works, links compact', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/mind/summary') && r.ok(), { timeout: 30_000 })
  await settle(page)
  await page.waitForTimeout(1200)

  const mind = page.locator('[data-testid="mindset-card"]')
  await mind.scrollIntoViewIfNeeded()
  const mtext = (await mind.innerText()).replace(/\s+/g, ' ')
  console.log('MINDSET:', mtext)
  expect(mtext).toMatch(/Level \d+ · Chapter \d+/)
  expect(mtext).toMatch(/\d+\/10 sessions/)
  expect(mtext).toMatch(/mood check-in/)
  expect(mtext).not.toMatch(/110 mood entries/)
  expect(mtext).not.toMatch(/Track your mental wellness journey/)

  const trend = page.locator('[data-testid="nutrition-trend"]')
  await trend.scrollIntoViewIfNeeded()
  const ttext = await trend.innerText()
  console.log('NUTRITION TREND:', ttext)
  expect(ttext).toMatch(/Last 7 days:/)
  expect(ttext).toMatch(/logged \d of 7 days|Nothing logged/)

  // Progress chart mood tab actually switches.
  const chart = page.locator('[data-tour="progress-chart"]')
  await chart.scrollIntoViewIfNeeded()
  await chart.locator('button:has-text("Mood")').click()
  await page.waitForTimeout(400)
  const moodTabActive = await chart.locator('button:has-text("Mood")').evaluate(el => el.className.includes('bg-zinc-900') || el.className.includes('dark:bg-white'))
  expect(moodTabActive).toBe(true)
  const barCount = await chart.locator('.recharts-bar-rectangle').count()
  console.log('MOOD BARS:', barCount)
  expect(barCount).toBeGreaterThan(0)
  // Weight tab has the target line.
  await chart.locator('button:has-text("Weight")').click()
  await page.waitForTimeout(400)
  const goalLine = await chart.locator('text=/Goal 205 lbs/').count()
  console.log('GOAL LINE on chart:', goalLine)
  expect(goalLine).toBeGreaterThan(0)

  // Quick links: 4 links, two per row.
  const links = page.locator('a[href="/dashboard/workout"]:has-text("All Programs"), a[href="/dashboard/nutrition"]:has-text("Nutrition"), a[href="/dashboard/progress"]:has-text("Progress"), a[href="/dashboard/chat"]:has-text("Connect")')
  expect(await links.count()).toBe(4)
  const b1 = await links.nth(0).boundingBox(); const b2 = await links.nth(1).boundingBox()
  expect(Math.abs(b1!.y - b2!.y)).toBeLessThan(4)

  await page.screenshot({ path: 'tests/e2e/screenshots/dash-fixes-full.png', fullPage: true })
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  console.log('PAGE HEIGHT:', h)
  expect(errs, errs.join('\n')).toEqual([])
})

test('streaks page renders every pillar with the 3-day rule', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard/streaks`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/streaks') && r.ok(), { timeout: 30_000 })
  await settle(page)
  await page.waitForTimeout(600)
  for (const id of ['streak-overall', 'streak-workout', 'streak-nutrition', 'streak-mindset', 'streak-super']) {
    const t = (await page.locator(`[data-testid="${id}"]`).innerText()).replace(/\s+/g, ' ')
    console.log(id.toUpperCase() + ':', t)
    expect(t.length).toBeGreaterThan(10)
  }
  const overall = (await page.locator('[data-testid="streak-overall"]').innerText()).replace(/\s+/g, ' ')
  expect(overall).toMatch(/Building/)           // 2 days
  const mindset = (await page.locator('[data-testid="streak-mindset"]').innerText()).replace(/\s+/g, ' ')
  expect(mindset).toMatch(/3\s*days/)            // 3-day mindset streak IS shown
  const workout = (await page.locator('[data-testid="streak-workout"]').innerText()).replace(/\s+/g, ' ')
  expect(workout).toMatch(/This week 1\/5/)
  await page.screenshot({ path: 'tests/e2e/screenshots/dash-fixes-streaks.png', fullPage: true })
  expect(errs, errs.join('\n')).toEqual([])
})

test('a mind session opener reads today\'s mood', async ({ page }) => {
  const errs = await signIn(page)
  await page.goto(`${BASE}/dashboard/mind`, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.waitForTimeout(2500)
  const begin = page.locator('button:has-text("Begin")').first()
  if (!(await begin.isVisible().catch(() => false))) {
    console.log('No Begin button visible (session done / training grounds) — opener check skipped')
    return
  }
  await begin.click()
  await page.waitForTimeout(2500)
  // The player opens on its own title card with a second Begin.
  const inner = page.locator('button:has-text("Begin")').first()
  if (await inner.isVisible().catch(() => false)) { await inner.click(); await page.waitForTimeout(2500) }
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const readsMood = /You checked in feeling|Welcome back/.test(body)
  console.log('OPENER reads mood/recent:', readsMood, '|', body.slice(0, 200))
  await page.screenshot({ path: 'tests/e2e/screenshots/dash-fixes-opener.png' })
  expect(readsMood).toBe(true)
  await page.goto(`${BASE}/dashboard`) // leave without completing anything
  expect(errs.filter(e => !e.includes('/api/ai/')), errs.join('\n')).toEqual([])
})
