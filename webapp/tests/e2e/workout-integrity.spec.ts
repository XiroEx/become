/**
 * Programs and workouts still work — the checks that catch what build-as-you-go
 * broke, run against a real enrolled program.
 *
 * Three regressions this covers:
 *   1. The weight column vanished. A session rebuilt from its log came back
 *      typed 'reps' — a value that matched no branch — so Track dropped the
 *      Weight column and Live rendered no inputs at all.
 *   2. Grouping was one tap and ungrouping was nothing: once two exercises
 *      became a superset, the rounds view had no way back out.
 *   3. Adding an exercise had to stay reachable in both views.
 *
 * Runs as jondon27500@gmail.com against a REAL program, and is read-only:
 * POST /api/workouts is stubbed, so nothing is written to his record.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3210 PLAYWRIGHT_AUTH_TOKEN=<jwt> \
 *     npx playwright test --project=workout-integrity
 */

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { signToken, E2E_USER } from './test-auth'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3210'
const TOKEN = process.env.PLAYWRIGHT_AUTH_TOKEN || readFileSync('/tmp/hb/jon.token', 'utf8').trim()
const PROGRAM = process.env.E2E_PROGRAM_ID || 'program_jon_don_split'
const DAY = process.env.E2E_PROGRAM_DAY || 'Day 1'

async function signIn(page: Page) {
  const u = new URL(BASE)
  await page.context().addCookies([{
    name: 'auth_token', value: TOKEN, domain: u.hostname, path: '/',
    httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax',
  }])
  // Read-only: never write to a real member's log from a test.
  await page.route('**/api/workouts', route =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
      : route.continue())
  await page.goto(`${BASE}/login`)
  await page.evaluate(t => localStorage.setItem('token', t), TOKEN)
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
}

test('a program workout logs weight in both views, and a superset can be undone', async ({ page }) => {
  await signIn(page)

  // ── Track view ────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard/workout/${PROGRAM}/workout?day=${encodeURIComponent(DAY)}`)
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible({ timeout: 30_000 })

  const firstCard = page.locator('[data-testid^="track-group-toggle-"]').first()
  await expect(firstCard, 'the group toggle is on every exercise card').toBeVisible()

  // The first exercise is expanded on load: its set rows must offer a load.
  const columns = (await page.locator('text=/^Weight$/').first().isVisible().catch(() => false))
  const weightInputs = await page.locator('input[placeholder="0"]').count()
  console.log('TRACK weight column visible:', columns, '| numeric inputs:', weightInputs)
  expect(columns, 'a loaded program exercise shows its Weight column').toBe(true)

  // ── Make a superset by mistake, then take it back ─────────────────────────
  await firstCard.click()
  const ungroup = page.locator('[data-testid^="track-ungroup-"]').first()
  await expect(ungroup, 'a group you did not mean to make offers a way out').toBeVisible({ timeout: 10_000 })
  const groupHeader = page.locator('text=/Superset/i').first()
  await expect(groupHeader).toBeVisible()
  await page.screenshot({ path: 'tests/e2e/screenshots/integrity-track-grouped.png', fullPage: false })

  await ungroup.click()
  await expect(page.locator('[data-testid^="track-ungroup-"]')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible()
  console.log('TRACK ungrouped back to plain cards')

  // ── Live view ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard/workout/${PROGRAM}/workout/live?day=${encodeURIComponent(DAY)}`)
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  await expect(page.locator('[data-testid="live-add-exercise-pill"]')).toBeVisible({ timeout: 30_000 })

  const live = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('LIVE:', (live.match(/Exercise \d+\/\d+ . Set \d+\/\d+/) ?? ['?'])[0], '| has weight input:', /Weight \(lbs\)|Weight per/.test(live), '| has reps input:', /Reps/.test(live))
  expect(/Weight \(lbs\)|Weight per/.test(live), 'the live view asks for the load').toBe(true)
  expect(/Reps/.test(live), 'the live view asks for the reps').toBe(true)
  await page.screenshot({ path: 'tests/e2e/screenshots/integrity-live.png' })
})

/**
 * The exact shape that lost the weights: a session whose exercises are typed
 * 'reps' — what the rebuild paths used to invent, and what is still sitting in
 * the stash of anyone who resumed a session before the fix.
 */
test('a session typed the old way still asks for weight in both views', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-legacy-${Date.now()}`
  const u = new URL(BASE)
  await context.addCookies([{
    name: 'auth_token', value: token, domain: u.hostname, path: '/',
    httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax',
  }])
  await page.goto(`${BASE}/login`)
  await page.evaluate(t => localStorage.setItem('token', t), token)
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'Legacy Typed Session',
      // 'reps' is not one of the app's tracking types — that is the bug.
      exercises: [
        { exerciseSlug: 'seated-calf-raise', name: 'Seated Calf Raise', trackingType: 'reps', sets: 3, reps: '10' },
        { exerciseSlug: 'hip-abduction-machine', name: 'Hip Abduction Machine', trackingType: 'reps', sets: 3, reps: '8-12' },
      ],
    }))
  }, { id: sessionId })

  await page.goto(`${BASE}/dashboard/workout/quick/workout?session=${sessionId}`)
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible({ timeout: 30_000 })
  const trackText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('LEGACY TRACK has Weight column:', /weight/i.test(trackText))
  expect(/weight/i.test(trackText), 'the weight column comes back').toBe(true)
  await page.screenshot({ path: 'tests/e2e/screenshots/integrity-legacy-track.png', fullPage: true })

  await page.goto(`${BASE}/dashboard/workout/quick/workout/live?session=${sessionId}`)
  await expect(page.locator('[data-testid="live-add-exercise-pill"]')).toBeVisible({ timeout: 30_000 })
  const liveText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('LEGACY LIVE has inputs:', /weight \(lbs\)|weight per/i.test(liveText), /reps/i.test(liveText))
  expect(/weight \(lbs\)|weight per/i.test(liveText), 'the live view is loggable again').toBe(true)
  expect(/reps/i.test(liveText)).toBe(true)
  await page.screenshot({ path: 'tests/e2e/screenshots/integrity-legacy-live.png' })
})
