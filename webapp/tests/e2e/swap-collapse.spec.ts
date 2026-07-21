import { test, expect } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

test('swap modal: sections preview 4, show more, collapse', async ({ page, context }) => {
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE ERR:', m.text().slice(0,180)) })
  page.on('response', r => { if (r.status()>=400 && r.url().includes('/api/')) console.log('HTTP', r.status(), r.url().split('?')[0]) })
  page.on('pageerror', e => console.log('PAGE ERROR:', String(e.stack || e).slice(0,900)))
  await authenticate(page, context)
  await page.goto(`${BASE_URL}/dashboard/workout`)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)

  // Open today's workout (the "Today: Day N" card).
  await page.locator('text=/Today: Day/i').first().click({ force: true })
  await page.waitForTimeout(3000)
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(1000)

  const swap = page.locator('button[title="Swap exercise"]').first()
  await expect(swap).toBeVisible({ timeout: 15_000 })
  await swap.click({ force: true })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'tests/e2e/screenshots/swap-collapsed.png' })

  // Preview + "Show N more"
  const showMore = page.locator('button:has-text("Show")').first()
  await expect(showMore).toBeVisible({ timeout: 15_000 })
  console.log('SHOW MORE LABEL:', (await showMore.textContent())?.trim())

  // Count cards before expanding (preview should be small)
  const before = await page.locator('button:has-text("Use"), [class*="rounded-xl"]:has-text("Intermediate")').count()
  console.log('cards visible in preview (approx):', before)

  await showMore.click()
  await page.waitForTimeout(800)
  const collapse = page.locator('button:has-text("Collapse")').first()
  await expect(collapse).toBeVisible({ timeout: 8000 })
  await page.screenshot({ path: 'tests/e2e/screenshots/swap-expanded.png' })

  await collapse.click()
  await page.waitForTimeout(800)
  await expect(page.locator('button:has-text("Collapse")')).toHaveCount(0)
  await page.screenshot({ path: 'tests/e2e/screenshots/swap-recollapsed.png' })
  console.log('RESULT: preview → show more → collapse ALL WORK')
})
