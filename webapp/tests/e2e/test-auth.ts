/**
 * Shared test auth helpers for Playwright e2e tests.
 *
 * Generates short-lived JWTs from JWT_SECRET at runtime.
 * Never hardcode tokens in test files — import from here instead.
 *
 * Requires: webapp/.env.local with JWT_SECRET set.
 * Run `npm run gen-test-token` to preview the generated token.
 */

import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'

// ─── Load JWT_SECRET from .env.local ─────────────────────────────────────────

function readEnvLocal(): Record<string, string> {
  const envPath = path.join(__dirname, '../../.env.local')
  if (!fs.existsSync(envPath)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

const env = readEnvLocal()
const JWT_SECRET = process.env.JWT_SECRET || env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET not found. Add it to webapp/.env.local or set PLAYWRIGHT_AUTH_TOKEN env var.'
  )
}

// ─── Test users ───────────────────────────────────────────────────────────────

/**
 * The dedicated end-to-end account. Every spec authenticates as this user
 * unless it is told otherwise — the suite skips and unskips workouts, enrols
 * programs, rewrites schedules and resets onboarding, and none of that may
 * happen to a person.
 */
export const E2E_USER = {
  id: '69ee5d9a0a303c1b8a6f4457',
  email: 'e2etest@become.io',
  role: 'user' as const,
}

/** Safe default for screenshot and exploratory runs that must not touch a
 * human member's account. */
export const E2E_AUTH_TOKEN: string = jwt.sign(
  { userId: E2E_USER.id, email: E2E_USER.email, role: E2E_USER.role },
  JWT_SECRET,
  { expiresIn: '7d' },
)

/**
 * A real person's account. It used to be the DEFAULT of `TEST_USER`, so the
 * thirteen specs importing `TEST_USER` / `AUTH_TOKEN` drove a browser through
 * George's live data — schedule-sync.spec.ts skipped and unskipped his
 * workouts, calendar.spec.ts POSTed to /api/programs/enroll and /api/schedule
 * on him. Reaching it is now a deliberate act.
 */
const HUMAN_USER = {
  id: '693adca9073978ec812b601a',
  email: 'george8794@gmail.com',
  role: 'user' as const,
}

const HUMAN_OPT_IN = 'E2E_ALLOW_HUMAN_ACCOUNT'

/** Opt-in only, and it has to be exactly "1" so a stray truthy value cannot
 *  enable it by accident. */
export const usingHumanAccount: boolean = process.env[HUMAN_OPT_IN] === '1'

/**
 * The account the suite runs as. The dedicated e2e user by default; the human
 * account only under `E2E_ALLOW_HUMAN_ACCOUNT=1`, which exists for reproducing
 * a report that genuinely depends on that member's data and nothing else.
 */
export const TEST_USER = usingHumanAccount ? HUMAN_USER : E2E_USER

// Match production token shape. AuthGuard intentionally rejects tokens without
// an expiry claim, so an "evergreen" test token only produces a login-page
// screenshot while making the harness look authenticated.
export const AUTH_TOKEN: string = usingHumanAccount
  ? jwt.sign(
      { userId: HUMAN_USER.id, email: HUMAN_USER.email, role: HUMAN_USER.role },
      JWT_SECRET,
      { expiresIn: '7d' },
    )
  : E2E_AUTH_TOKEN

if (usingHumanAccount) {
  console.warn(
    `[test-auth] ${HUMAN_OPT_IN}=1 — running as ${HUMAN_USER.email}. ` +
      'Destructive specs will mutate a real member\'s data.',
  )
}

/** Defaults to http://localhost:3000, and REFUSES a production-backed host
 *  without PLAYWRIGHT_ALLOW_PROD=1. Resolved in one place so a spec importing
 *  only this module still gets the fence. */
export { BASE_URL } from './base-url'
import { BASE_URL } from './base-url'

/**
 * Mint a token for an arbitrary test user.
 *
 * MUST carry an `exp` claim: AuthGuard reads `(payload.exp ?? 0) * 1000` and so
 * treats an expiry-less token as expired, wiping it from localStorage and
 * bouncing to /login. Real tokens are always issued with 7d, so this matches
 * production shape rather than working around anything.
 */
export function signToken(userId: string, email: string, role = 'user'): string {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '7d' })
}

/**
 * Put a user back to the pre-onboarding state.
 *
 * Prefers /api/admin/e2e-setup (full reset incl. progress + nutrition goals)
 * when BOOTSTRAP_TOKEN is available; otherwise falls back to the admin-key
 * reset endpoint, which only flips onboardingCompleted. The secret never
 * leaves this module.
 *
 * NOTE (reported, not changed here — the route is out of this change's scope):
 * that fallback sends `x-admin-key: JWT_SECRET`, i.e.
 * /api/admin/reset-onboarding accepts the app's TOKEN-SIGNING SECRET as an
 * admin API key. One value therefore both mints sessions and unlocks an admin
 * endpoint, so the blast radius of leaking it is doubled and it cannot be
 * rotated independently. It wants a separate ADMIN_API_KEY.
 */
export async function resetOnboarding(userId: string): Promise<void> {
  const bootstrap = process.env.BOOTSTRAP_TOKEN
  if (bootstrap) {
    const res = await fetch(`${BASE_URL}/api/admin/e2e-setup`, {
      method: 'POST',
      headers: { 'x-bootstrap-token': bootstrap },
    })
    if (res.ok) return
  }

  const res = await fetch(`${BASE_URL}/api/admin/reset-onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': JWT_SECRET },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) {
    throw new Error(`reset-onboarding failed (${res.status}): ${await res.text()}`)
  }
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

import type { Page, BrowserContext } from '@playwright/test'

/** Wait for route content rather than accepting a shell, compile overlay, or
 * full-screen loader as a successful screenshot. The threshold is deliberately
 * generic because this helper walks unrelated areas of the app. */
export async function waitForAppScreen(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (document.body?.innerText.trim().length || 0) >= 120,
    undefined,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(400)
}

/** Clear first-run coach marks through their real, labelled control. Routes
 * can mount a new segment after navigation, so screenshot walks call this
 * after every page change rather than mutating tutorial storage directly. */
export async function dismissTutorials(page: Page): Promise<void> {
  let clearChecks = 0
  for (let i = 0; i < 12; i++) {
    const shield = page.locator('.rtut-shield')
    if (await shield.count() === 0) {
      clearChecks += 1
      if (clearChecks >= 2) return
      await page.waitForTimeout(350)
      continue
    }

    clearChecks = 0
    const skip = page.locator('button[aria-label="Skip tour"]:visible').first()
    if (await skip.isVisible({ timeout: 800 }).catch(() => false)) {
      await skip.click({ force: true }).catch(() => {})
    }
    await page.waitForTimeout(350)
  }
}

/**
 * Injects auth token into cookies + localStorage and navigates to /dashboard.
 * Handles onboarding redirect and daily check-in modal automatically.
 *
 * The default is AUTH_TOKEN, which is the dedicated E2E_USER account unless
 * E2E_ALLOW_HUMAN_ACCOUNT=1. It is deliberately NOT hardcoded to
 * E2E_AUTH_TOKEN: several specs authenticate here and then call the API with
 * AUTH_TOKEN, so pinning one side would have the browser acting as one member
 * while the fetches act as another — the worst of both accounts.
 */
export async function authenticate(
  page: Page,
  context: BrowserContext,
  authToken: string = AUTH_TOKEN,
): Promise<void> {
  await context.addCookies([{
    name: 'auth_token',
    value: authToken,
    domain: new URL(BASE_URL).hostname,
    path: '/',
    httpOnly: false,
    secure: BASE_URL.startsWith('https'),
    sameSite: 'Lax',
  }])

  await page.goto(`${BASE_URL}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), authToken)
  await page.goto(`${BASE_URL}/dashboard`)
  await page.waitForLoadState('domcontentloaded')

  // Handle onboarding redirect
  if (page.url().includes('/onboarding')) {
    await page.evaluate(async (args: { token: string; baseUrl: string }) => {
      await fetch(`${args.baseUrl}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.token}` },
        body: JSON.stringify({
          onboardingCompleted: true,
          // 'build_muscle' is NOT a valid FitnessGoal — the enum value is
          // 'gain_muscle'. The old value slipped past because findByIdAndUpdate
          // doesn't run validators by default, leaving an unknown goal on the
          // profile that other screens then had to defend against.
          profile: {
            fitnessGoal: 'gain_muscle',
            fitnessGoals: ['gain_muscle'],
            experienceLevel: 'intermediate',
            age: 30,
          },
        }),
      })
    }, { token: authToken, baseUrl: BASE_URL })
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
  }

  // Dismiss daily check-in modal if present
  const skipBtn = page.locator('button:has-text("Skip for Today")')
  if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skipBtn.click({ force: true })
    await page.waitForTimeout(400)
    const continueBtn = page.locator('button:has-text("Continue Anyway")')
    if (await continueBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await continueBtn.click({ force: true })
      await page.waitForTimeout(300)
    }
  }

  await dismissTutorials(page)
}
