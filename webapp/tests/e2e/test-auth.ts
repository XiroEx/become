/**
 * Shared test auth helpers for Playwright e2e tests.
 *
 * Generates a permanent JWT (no expiry) from JWT_SECRET at runtime.
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

export const TEST_USER = {
  id: '693adca9073978ec812b601a',
  email: 'george8794@gmail.com',
  role: 'user' as const,
}

// Permanent token — no expiresIn means it never expires
export const AUTH_TOKEN: string = jwt.sign(
  { userId: TEST_USER.id, email: TEST_USER.email, role: TEST_USER.role },
  JWT_SECRET
  // deliberately no expiresIn
)

/**
 * The dedicated end-to-end account. Destructive fixtures (resetting onboarding,
 * overwriting nutrition goals) must target THIS user and never a real member.
 */
export const E2E_USER = {
  id: '69ee5d9a0a303c1b8a6f4457',
  email: 'e2etest@become.io',
  role: 'user' as const,
}

export const BASE_URL = 'https://become.redbtn.io'

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

/**
 * Injects auth token into cookies + localStorage and navigates to /dashboard.
 * Handles onboarding redirect and daily check-in modal automatically.
 */
export async function authenticate(page: Page, context: BrowserContext): Promise<void> {
  await context.addCookies([{
    name: 'auth_token',
    value: AUTH_TOKEN,
    domain: new URL(BASE_URL).hostname,
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }])

  await page.goto(`${BASE_URL}/login`)
  await page.evaluate((t) => localStorage.setItem('token', t), AUTH_TOKEN)
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
    }, { token: AUTH_TOKEN, baseUrl: BASE_URL })
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
}
