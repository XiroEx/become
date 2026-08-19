/**
 * Build as you go — a workout is not fixed at the moment you start it.
 *
 * Start a session with ONE exercise, then add more from inside the live view,
 * superset two of them on the spot, and confirm that what you built survives:
 * in the live view's own list, in the Track view (the other half of the same
 * session), and on the server log the calendar and history read from.
 *
 * Auth/isolation: the dedicated e2e account, with the session seeded straight
 * into localStorage the way lib/quickSession/store.ts does — no dependency on
 * the AI builder for a test about editing a running workout.
 *
 * Run from webapp/ against a local server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3210 npx playwright test --project=build-as-you-go
 */

import { test, expect, request, type Page } from '@playwright/test'
import { signToken, E2E_USER, BASE_URL as PROD_URL } from './test-auth'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || PROD_URL

interface LoggedExercise {
  name: string
  groupId?: string
  groupType?: string
  addedAdHoc?: boolean
  prescription?: { sets?: number; reps?: string }
  sets?: Array<{ completed?: boolean }>
}

async function addExercise(page: Page, query: string, placement: 'end' | 'group') {
  await page.locator('[data-testid="add-exercise-search"]').fill(query)
  const first = page.locator('[data-testid="add-exercise-result"]').first()
  await expect(first).toBeVisible({ timeout: 15_000 })
  const name = (await first.innerText()).trim()
  await first.click()
  if (placement === 'group') await page.locator('[data-testid="add-exercise-place-group"]').click()
  await page.locator('[data-testid="add-exercise-confirm"]').click()
  await expect(page.locator('[data-testid="add-exercise-sheet"]')).toHaveCount(0)
  return name
}

test('a session started with one exercise grows while it runs, and every surface agrees', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-bayg-${Date.now()}`

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })

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
  await page.evaluate(t => localStorage.setItem('token', t), token)

  // One exercise. That is the whole session at the door.
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Build As You Go',
      exercises: [{ exerciseSlug: 'push-up', name: 'Push-Up', trackingType: 'reps_bodyweight', sets: 3, reps: '10-12' }],
    }))
  }, { id: sessionId })

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout/live?session=${sessionId}`)
  await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 20_000 })

  // ── Add one on its own, from inside the running session ───────────────────
  await page.locator('[data-tour="live-exercise-dots"]').click()
  await page.locator('[data-testid="live-add-exercise"]').click()
  const soloName = await addExercise(page, 'curl', 'end')
  console.log('ADDED SOLO:', soloName)

  await page.locator('[data-tour="live-exercise-dots"]').click()
  await expect(page.getByText(soloName, { exact: false }).first()).toBeVisible({ timeout: 10_000 })

  // ── Add one INTO a superset with the exercise being worked on ─────────────
  await page.locator('[data-testid="live-add-exercise"]').click()
  const supersetName = await addExercise(page, 'plank', 'group')
  console.log('ADDED SUPERSET:', supersetName)

  // ── The server has all three, with the superset and the prescription ──────
  await expect.poll(async () => {
    const res = await api.get(`/api/workouts/session?id=${sessionId}`)
    if (!res.ok()) return 0
    const body = await res.json()
    return (body.session?.exercises as LoggedExercise[] | undefined)?.length ?? 0
  }, { timeout: 20_000, message: 'the added exercises must reach the log' }).toBe(3)

  const saved = (await (await api.get(`/api/workouts/session?id=${sessionId}`)).json()).session
  const logged = saved.exercises as LoggedExercise[]
  console.log('LOGGED:', logged.map(e => `${e.name}${e.groupId ? ` [${e.groupType}]` : ''}${e.addedAdHoc ? ' +added' : ''}`).join(' | '))

  const added = logged.filter(e => e.addedAdHoc)
  expect(added, 'both added exercises are flagged as added mid-session').toHaveLength(2)
  expect(added.every(e => (e.prescription?.sets ?? 0) >= 1)).toBe(true)

  // Push-Up and the exercise supersetted with it share a group, and sit next
  // to each other — the flow only interleaves consecutive group members.
  const pushIdx = logged.findIndex(e => e.name === 'Push-Up')
  const superIdx = logged.findIndex(e => e.name === supersetName)
  expect(logged[pushIdx]!.groupId, 'the anchor joined the group').toBeTruthy()
  expect(logged[superIdx]!.groupId).toBe(logged[pushIdx]!.groupId)
  expect(Math.abs(superIdx - pushIdx)).toBe(1)

  // ── The Track view is the same session: it shows what was added ───────────
  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout?session=${sessionId}`)
  await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(soloName, { exact: false }).first()).toBeVisible()
  await expect(page.getByText(supersetName, { exact: false }).first()).toBeVisible()
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible()
  await page.screenshot({ path: 'tests/e2e/screenshots/build-as-you-go-track.png', fullPage: true })

  // ── And it is on the calendar's own source of truth ───────────────────────
  const logsRes = await api.get('/api/workouts/logs?includeIncomplete=true&withExercises=true')
  expect(logsRes.status()).toBe(200)
  const logs = (await logsRes.json()).logs as Array<{ sessionId?: string; kind: string; exerciseCount?: number; exercises?: LoggedExercise[] }>
  const onCalendar = logs.find(l => l.sessionId === sessionId)
  expect(onCalendar, 'the session the calendar reads must carry the added work').toBeTruthy()
  expect(onCalendar!.exerciseCount).toBe(3)
  // Reopening it from the calendar has to bring the superset back with it.
  expect(onCalendar!.exercises?.filter(e => e.groupId).length).toBe(2)

  await api.dispose()
})
