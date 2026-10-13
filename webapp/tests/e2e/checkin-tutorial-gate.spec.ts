/**
 * The daily check-in must not open on top of the onboarding tour.
 *
 * Reported twice. The first fix gated on `tutorial.active`, but the tour starts
 * on an 800ms route trigger — so for that first beat there is no active tutorial
 * to detect, and a fresh account whose /api/checkin call returned inside the
 * window got the modal opened underneath the coach-marks.
 *
 * Runs against a LOCAL dev server on a scratch DB. Never point this at prod:
 *   MONGODB_URI=mongodb://localhost:27018/become-tutgate npx next dev -p 3111
 *   PLAYWRIGHT_BASE_URL=http://localhost:3111 npx playwright test \
 *     tests/e2e/checkin-tutorial-gate.spec.ts --project=tutgate
 */

import { test, expect, Page, BrowserContext } from '@playwright/test'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { TEST_USER } from './test-auth'

// test-auth mints a PERMANENT token, and AuthGuard reads `(payload.exp ?? 0)`
// — a missing exp evaluates as already expired and bounces to /login. Sign our
// own short-lived one so the guard lets us through.
function jwtSecret(): string {
  const envPath = path.join(__dirname, '../../.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^JWT_SECRET=(.*)$/)
    if (m) return m[1].replace(/^["']|["']$/g, '').trim()
  }
  throw new Error('JWT_SECRET not found in webapp/.env.local')
}

const AUTH_TOKEN = jwt.sign(
  { userId: TEST_USER.id, email: TEST_USER.email, role: 'admin' },
  jwtSecret(),
  { expiresIn: '2h' },
)

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3111'

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  throw new Error('refusing to run the tutorial-gate spec against a non-local base URL')
}

async function signIn(page: Page, context: BrowserContext) {
  // Both planes: the httpOnly-style cookie the server reads and the localStorage
  // token the client sends as a Bearer header.
  await context.addCookies([{
    name: 'auth_token',
    value: AUTH_TOKEN,
    domain: new URL(BASE).hostname,
    path: '/',
    httpOnly: false,
    secure: BASE.startsWith('https'),
    sameSite: 'Lax',
  }])
  await page.addInitScript(
    ([token, userId]) => {
      localStorage.setItem('token', token as string)
      localStorage.setItem('userId', userId as string)
    },
    [AUTH_TOKEN, TEST_USER.id],
  )
}

const checkInModal = (page: Page) => page.getByText('Daily check-in', { exact: false })
const nudgeModal = (page: Page) => page.getByText('Ready to start a training program?', { exact: false })
const tourCard = (page: Page) => page.getByText('Your dashboard at a glance', { exact: false })

test.describe('daily check-in vs onboarding tour', () => {
  test('no first-run modal opens during the tour trigger window', async ({ page, context }) => {
    await signIn(page, context)
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })

    // The tour triggers 800ms after landing. Both modals must stay shut across
    // that whole window — this is the span the old gate let them through.
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250)
      for (const [label, modal] of [['check-in', checkInModal], ['program nudge', nudgeModal]] as const) {
        if (await modal(page).isVisible().catch(() => false)) {
          await page.screenshot({ path: 'tests/e2e/screenshots/tutgate-FAIL.png', fullPage: true })
          throw new Error(`${label} opened ${(i + 1) * 250}ms after load, inside the tour window`)
        }
      }
    }
    await page.screenshot({ path: 'tests/e2e/screenshots/tutgate-quiet.png', fullPage: true })
  })

  test('the queue is never stranded — a first-run modal still arrives', async ({ page, context }) => {
    // The other half of the gate. Holding for the tour must not mean "no
    // check-in, ever" when the tour never starts or the tutorial provider never
    // reports ready. Without the grace fallback this hangs forever.
    await signIn(page, context)
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await expect(nudgeModal(page).or(checkInModal(page))).toBeVisible({ timeout: 25_000 })
    await page.screenshot({ path: 'tests/e2e/screenshots/tutgate-released.png', fullPage: true })
  })

  test('the two first-run modals never stack on each other', async ({ page, context }) => {
    await signIn(page, context)
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await expect(nudgeModal(page).or(checkInModal(page))).toBeVisible({ timeout: 25_000 })
    const both =
      (await nudgeModal(page).isVisible().catch(() => false)) &&
      (await checkInModal(page).isVisible().catch(() => false))
    expect(both, 'the nudge and the check-in must not be open together').toBe(false)
  })
})
