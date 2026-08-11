/**
 * Quick session — abandon-before-any-input still saves.
 *
 * Repro (card): build a quick session, tap "Start workout" into the live
 * view, then leave immediately — before entering a single rep or weight —
 * to go do something else in the app. Previously the very first server save
 * only fired from a debounced input change, a completed set, or the
 * visibilitychange/pagehide flush — none of which cover leaving via in-app
 * navigation before touching anything. The session existed only as a local
 * draft with no server record, so nothing in the app (calendar, history)
 * ever offered it back — the user had to rebuild it from scratch.
 *
 * This drives the real live-workout React page (not just the API) so it
 * exercises the actual mount-time save effect, then confirms the session is
 * now discoverable via the same `/api/workouts/logs?includeIncomplete=true`
 * endpoint the calendar/history views read from.
 *
 * Auth/isolation: mints a token for a throwaway local user via signToken and
 * seeds the session directly into localStorage (mirrors quickSession/store.ts
 * stashQuickSession) rather than driving the AI session builder — no shared
 * exercise-library seed data required.
 *
 * Run from webapp/ against a local server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3010 npx playwright test tests/e2e/quick-session-abandon-save.spec.ts
 */

import { test, expect, request } from '@playwright/test'
import { signToken, BASE_URL as PROD_URL } from './test-auth'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || PROD_URL

// A throwaway user id — must already exist as a User doc with
// onboardingCompleted:true for AuthGuard to let the dashboard render, and a
// UserProgress doc gets created on-demand by the save itself (upsert:true).
const TEST_USER_ID = process.env.E2E_QUICK_SESSION_USER_ID
const TEST_USER_EMAIL = process.env.E2E_QUICK_SESSION_USER_EMAIL || 'e2e-quicksession-test@become.local'

test.describe('Quick session — leaving before any input still saves', () => {
  test.skip(!TEST_USER_ID, 'requires E2E_QUICK_SESSION_USER_ID pointing at a seeded local test user')

  test('starting a quick session and leaving untouched creates a resumable server record', async ({ page, context }) => {
    const token = signToken(TEST_USER_ID!, TEST_USER_EMAIL)
    const sessionId = `e2e-abandon-${Date.now()}`

    const api = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })

    // ── Sanity: nothing under this sessionId exists yet ──────────────────────
    const before = await api.get('/api/workouts/logs?includeIncomplete=true')
    expect(before.status()).toBe(200)
    const beforeLogs = (await before.json()).logs as Array<{ sessionId?: string }>
    expect(beforeLogs.some((l) => l.sessionId === sessionId)).toBe(false)

    // ── Auth the browser context ──────────────────────────────────────────
    await context.addCookies([{
      name: 'auth_token',
      value: token,
      domain: new URL(BASE_URL).hostname,
      path: '/',
      httpOnly: false,
      secure: BASE_URL.startsWith('https'),
      sameSite: 'Lax',
    }])
    await page.goto(`${BASE_URL}/login`)
    await page.evaluate((t) => localStorage.setItem('token', t), token)

    // Seed a quick-session draft directly into localStorage — the same shape
    // lib/quickSession/store.ts's stashQuickSession produces — so the live
    // view has a real session to load without needing the exercise library.
    await page.evaluate(({ id }) => {
      localStorage.setItem(
        `quick_session_${id}`,
        JSON.stringify({
          sessionId: id,
          title: 'E2E Abandon Test Session',
          exercises: [
            { exerciseSlug: 'push-up', name: 'Push-Up', trackingType: 'reps_bodyweight', sets: 3, reps: '10-12' },
          ],
        }),
      )
    }, { id: sessionId })

    // ── This is the repro: open the live view (== "pressed start workout")
    //    and leave immediately, before touching a single input. ─────────────
    await page.goto(`${BASE_URL}/dashboard/workout/quick/workout/live?session=${sessionId}`)
    // Wait for the live view to actually finish loading the quick session
    // (the exercise name renders once loading flips false) — this is the
    // point at which the mount-time save effect fires.
    await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 15_000 })

    // Leave via in-app navigation — no backgrounding, no visibilitychange,
    // no input touched. This is exactly the path that used to lose everything.
    await page.goto(`${BASE_URL}/dashboard`)

    // ── The session must now exist server-side, incomplete, and reachable ──
    const after = await api.get('/api/workouts/logs?includeIncomplete=true')
    expect(after.status()).toBe(200)
    const afterLogs = (await after.json()).logs as Array<{ sessionId?: string; kind: string; completed: boolean }>
    const saved = afterLogs.find((l) => l.sessionId === sessionId)
    expect(saved, 'the abandoned quick session must have a server-side log').toBeTruthy()
    expect(saved!.kind).toBe('quick')
    expect(saved!.completed).toBe(false)

    // And it's reachable through the same session-fetch the calendar's
    // "Continue" button uses to hand the user back into it.
    const sessionFetch = await api.get(`/api/workouts/session?id=${sessionId}`)
    expect(sessionFetch.status()).toBe(200)
    const sessionBody = await sessionFetch.json()
    expect(sessionBody.session?.exercises?.[0]?.name).toBe('Push-Up')

    await api.dispose()
  })
})
