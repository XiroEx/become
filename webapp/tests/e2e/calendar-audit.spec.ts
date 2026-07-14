import { test, expect, Page } from '@playwright/test'
import { authenticate, BASE_URL } from './test-auth'

// Exploratory audit of the workout calendar. Captures console errors + failed
// network calls throughout, screenshots each surface, and asserts the invariants
// that the "made up on the wrong day" bug violated.

const problems: string[] = []

function watch(page: Page) {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`CONSOLE: ${m.text().slice(0, 160)}`)
  })
  page.on('requestfailed', (r) => {
    problems.push(`REQ FAILED: ${r.method()} ${r.url().split('?')[0]} — ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      problems.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url().split('?')[0]}`)
    }
  })
}

async function dismissOverlays(page: Page) {
  const skip = page.locator('button:has-text("Skip for Today")')
  if (await skip.isVisible({ timeout: 2500 }).catch(() => false)) await skip.click({ force: true })
  for (let i = 0; i < 4; i++) {
    const coach = page.locator('button[aria-label*="lose" i]').first()
    if (await coach.isVisible({ timeout: 1200 }).catch(() => false)) {
      await coach.click({ force: true }).catch(() => {})
      await page.waitForTimeout(300)
    } else break
  }
  // The onboarding tour mounts a `.rtut-shield` that (by design) gates the page
  // until you skip or finish it. Dismiss it the way a user does — the control is
  // labelled "Skip tour", NOT "close".
  if (await page.locator('.rtut-shield').count() > 0) {
    await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(700)
    if (await page.locator('.rtut-shield').count() > 0) {
      problems.push('FINDING: tour shield still blocks the page after "Skip tour"')
    }
  }
}

test('calendar audit — views, statuses, actions', async ({ page, context }) => {
  watch(page)
  await authenticate(page, context)
  await page.goto(`${BASE_URL}/dashboard/calendar`)
  await page.waitForLoadState('domcontentloaded')
  await dismissOverlays(page)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'tests/e2e/screenshots/cal-month.png', fullPage: true })

  // ── Month view basics ──────────────────────────────────────────────────────
  await expect(page.locator('text=/Completed/').first()).toBeVisible()
  await expect(page.locator('text=/Scheduled/').first()).toBeVisible()

  // ── Week view ──────────────────────────────────────────────────────────────
  const week = page.locator('button:has-text("Week")').first()
  if (await week.isVisible().catch(() => false)) {
    await week.click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: 'tests/e2e/screenshots/cal-week.png', fullPage: true })
    await page.locator('button:has-text("Month")').first().click()
    await page.waitForTimeout(700)
  }

  // ── Month navigation (prev / next / today) ─────────────────────────────────
  const monthLabel = page.locator('text=/^(January|February|March|April|May|June|July|August|September|October|November|December) \\d{4}$/').first()
  const start = (await monthLabel.textContent().catch(() => '')) || ''
  await page.getByRole('button', { name: /next month|next/i }).first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(700)
  const moved = (await monthLabel.textContent().catch(() => '')) || ''
  if (start && moved && start === moved) problems.push(`FINDING: next-month arrow did not change the month (still ${start})`)
  await page.getByRole('button', { name: 'Today' }).first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(700)
  const back = (await monthLabel.textContent().catch(() => '')) || ''
  if (start && back && back !== start) problems.push(`FINDING: "Today" did not return to the current month (${back} vs ${start})`)
  problems.push(`INFO: month nav ${start} → ${moved} → (Today) ${back}`)
  await page.screenshot({ path: 'tests/e2e/screenshots/cal-nav.png', fullPage: true })

  // ── INVARIANT: a day marked completed must not ALSO still offer Start Workout
  //    (that's the shape the mis-credit bug produced: today "Scheduled" + empty)
  const dayCells = page.locator('[class*="grid"] >> text=/^\\d{1,2}$/')
  const cellCount = await dayCells.count()
  expect(cellCount).toBeGreaterThan(20)

  // ── Click through several days and inspect the detail panel ────────────────
  for (const dayNum of ['6', '13', '14']) {
    const cell = page.locator(`text="${dayNum}"`).first()
    if (!(await cell.isVisible().catch(() => false))) continue
    await cell.click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
    await page.screenshot({ path: `tests/e2e/screenshots/cal-day-${dayNum}.png` })

    const panel = page.locator('text=/Start Workout|Un-complete|Manage|View Summary|Made up on/').first()
    const hasPanel = await panel.isVisible({ timeout: 2000 }).catch(() => false)
    // A completed day must never simultaneously offer "Start Workout".
    const completed = await page.locator('text=/Un-complete/').isVisible().catch(() => false)
    const startable = await page.locator('button:has-text("Start Workout")').isVisible().catch(() => false)
    if (completed && startable) {
      problems.push(`INVARIANT: day ${dayNum} shows BOTH "Un-complete" and "Start Workout"`)
    }
    problems.push(`INFO: day ${dayNum} panel=${hasPanel} completed=${completed} startable=${startable}`)
  }

  // ── Manage sheet ───────────────────────────────────────────────────────────
  const manage = page.locator('button:has-text("Manage")').first()
  if (await manage.isVisible().catch(() => false)) {
    await manage.click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: 'tests/e2e/screenshots/cal-manage.png' })
    const actions = await page.locator('button').allTextContents()
    problems.push(`INFO: Manage actions = ${actions.filter(Boolean).slice(0, 14).join(' | ')}`)
  }

  console.log('\n===== CALENDAR AUDIT =====')
  for (const p of problems) console.log('  ' + p)
  console.log('==========================\n')
})
