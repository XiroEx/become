// Admin streak management — driven as an admin, mutating ONLY the dedicated
// e2e test account (never a real member).
//   PLAYWRIGHT_BASE_URL=http://localhost:3210 PLAYWRIGHT_AUTH_TOKEN=<admin jwt> npx playwright test --project=admin-streaks

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3210'
const TOKEN = process.env.PLAYWRIGHT_AUTH_TOKEN || readFileSync('/tmp/hb/local.token', 'utf8').trim()
const E2E_USER = '69ee5d9a0a303c1b8a6f4457' // e2etest@become.io

test.use({ viewport: { width: 1024, height: 900 } })

test('admin can credit, see, and remove streak credits; edit day-streak counters', async ({ page }) => {
  const errs: string[] = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  const u = new URL(BASE)
  await page.context().addCookies([{ name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/', httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax' }])
  await page.goto(`${BASE}/login`)
  await page.evaluate(t => localStorage.setItem('token', t), TOKEN)
  await page.goto(`${BASE}/dashboard/admin/users/${E2E_USER}`, { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(r => r.url().includes('/api/admin/streaks') && r.ok(), { timeout: 60_000 })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
  const card = page.locator('[data-testid="admin-streaks"]')
  await card.scrollIntoViewIfNeeded()
  await expect(card).toContainText('Streaks')

  // Start clean: remove all credits if any
  const removeAll = card.locator('text=Remove all')
  if (await removeAll.isVisible().catch(() => false)) {
    await removeAll.click(); await page.waitForTimeout(800)
  }

  // Grant super streak (3 days) — credits all three pillars
  await card.locator('input[aria-label="Days"]').fill('3')
  await card.locator('[data-testid="admin-streak-grant-super"]').click()
  await expect(card).toContainText(/Credited \d+ days/)
  const after = (await card.innerText()).replace(/\s+/g, ' ')
  console.log('AFTER GRANT:', after.slice(0, 400))
  expect(after).toMatch(/Credits \(\d+\)/)
  // Super pillar now 3d (nutrition+mindset+workout all credited for 3 days; a fresh
  // account has no schedule so trained days are the credited days; week on track).
  expect(after).toMatch(/Super 3d/)
  await page.screenshot({ path: 'tests/e2e/screenshots/admin-streaks-granted.png', clip: (await card.boundingBox())! })

  // Remove one credit
  await card.locator('button[aria-label="Remove credit"]').first().click()
  await expect(card).toContainText(/Removed 1 credit/)

  // Set overall counters with a reason
  await card.locator('input[type="number"]').nth(1).fill('12') // Current (index 0 is the super-days input)
  await card.locator('input[placeholder="Reason (required)"]').fill('e2e: honour streak')
  await card.locator('select').selectOption('today')
  await card.locator('[data-testid="admin-streak-save-overall"]').click()
  await expect(card).toContainText(/Saved\./)
  const final = (await card.innerText()).replace(/\s+/g, ' ')
  console.log('AFTER OVERALL:', final.slice(0, 300))
  expect(final).toMatch(/Day streak 12d/)
  expect(final).toMatch(/active today/)
  expect(final).toMatch(/Counter edits \(\d+\)/)

  // Clean up: remove all credits, reset counters
  await card.locator('text=Remove all').click(); await page.waitForTimeout(600)
  await card.locator('input[type="number"]').nth(1).fill('0')
  await card.locator('input[placeholder="Reason (required)"]').fill('e2e: reset')
  await card.locator('[data-testid="admin-streak-save-overall"]').click()
  await expect(card).toContainText(/Saved\./)
  expect(errs, errs.join('\n')).toEqual([])
})
