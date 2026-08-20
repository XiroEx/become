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

async function openExerciseList(page: Page) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('[data-testid="live-row-0"]').isVisible().catch(() => false)) {
      await page.waitForTimeout(250)
      if (await page.locator('[data-testid="live-row-0"]').isVisible().catch(() => false)) return
    }
    await page.locator('[data-tour="live-exercise-dots"]').click()
    await page.waitForTimeout(400)
  }
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
  // The pill sits next to Swap Exercise, in plain sight: the first cut hid the
  // only entry point inside a hover-only drawer, which on a phone never opened.
  const pill = page.locator('[data-testid="live-add-exercise-pill"]')
  await expect(pill).toBeVisible()
  await expect(pill).toBeEnabled()
  // The pill pulses forever while the session is still thin, so it never
  // settles for Playwright's stability check — the pulse is the point.
  await pill.click({ force: true })
  const soloName = await addExercise(page, 'curl', 'end')
  console.log('ADDED SOLO:', soloName)

  // The list still opens from the dots, and still offers its own add button.
  await page.locator('[data-tour="live-exercise-dots"]').click()
  await expect(page.getByText(soloName, { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-testid="live-add-exercise"]')).toBeVisible()

  // ── Add one INTO a superset with the exercise being worked on ─────────────
  // Forced for the same reason as the pill: it pulses while the session is thin.
  await page.locator('[data-testid="live-add-exercise"]').click({ force: true })
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

  // ── A superset you did not mean to make can be taken back ─────────────────
  await expect(page.locator('[data-testid="live-ungroup-pill"]')).toBeVisible()
  await page.locator('[data-testid="live-ungroup-pill"]').click()
  await expect.poll(async () => {
    const res = await api.get(`/api/workouts/session?id=${sessionId}`)
    if (!res.ok()) return -1
    const body = await res.json()
    return ((body.session?.exercises ?? []) as LoggedExercise[]).filter(e => e.groupId).length
  }, { timeout: 20_000, message: 'ungrouping must reach the log too' }).toBe(0)
  await expect(page.locator('[data-testid="live-ungroup-pill"]')).toHaveCount(0)
  console.log('UNGROUPED: the superset came apart again')

  // Put it back so the rest of the test still covers a grouped session.
  await page.locator('[data-tour="live-exercise-dots"]').click()
  await page.locator('[data-testid="live-group-toggle-0"]').click()
  await expect.poll(async () => {
    const res = await api.get(`/api/workouts/session?id=${sessionId}`)
    if (!res.ok()) return -1
    const body = await res.json()
    return ((body.session?.exercises ?? []) as LoggedExercise[]).filter(e => e.groupId).length
  }, { timeout: 20_000 }).toBe(2)

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

/**
 * Flipping Track↔Live is looking at one workout two ways — it must not move you.
 *
 * The regression: Live rebuilt its flow on mount and always opened at set 1, so
 * a member three sets into an exercise came back to the top and re-logged over
 * work they had already done.
 */
test('switching to Track and back keeps the exercise and set you were on', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-flip-${Date.now()}`

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
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Flip Views',
      exercises: [
        { exerciseSlug: 'push-up', name: 'Push-Up', trackingType: 'reps_bodyweight', sets: 4, reps: '10' },
        { exerciseSlug: 'bodyweight-squat', name: 'Bodyweight Squat', trackingType: 'reps_bodyweight', sets: 3, reps: '12' },
      ],
    }))
  }, { id: sessionId })

  const position = async () => {
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    return (text.match(/Exercise \d+\/\d+ . Set \d+\/\d+/) ?? ['(not found)'])[0]
  }

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout/live?session=${sessionId}`)
  await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 20_000 })
  expect(await position()).toContain('Set 1/4')

  // Log three sets.
  for (const reps of ['10', '11', '12']) {
    await page.locator('button:has-text("Skip Rest")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(400)
    const input = page.locator('input[inputmode="numeric"], input[type="number"]').first()
    if (await input.count()) await input.fill(reps)
    await page.locator('button:has-text("Complete Set"), button:has-text("Skip Set")').first().click({ force: true })
    await page.waitForTimeout(1200)
  }
  await page.locator('button:has-text("Skip Rest")').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(500)
  const before = await position()
  console.log('BEFORE FLIP:', before)
  expect(before).toContain('Set 4/4')

  await page.locator('button[role="tab"]:has-text("Track")').click({ force: true })
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible({ timeout: 20_000 })
  await page.locator('button[role="tab"]:has-text("Live")').click({ force: true })
  await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)

  const after = await position()
  console.log('AFTER FLIP:', after)
  expect(after, 'the flip must not move you').toBe(before)

  // And the three logged sets are still logged — nothing to re-do.
  const progress = await page.evaluate(({ id }) => JSON.parse(localStorage.getItem(`qs_progress_${id}`) || 'null'), { id: sessionId })
  const done = (progress?.exercises?.[0]?.sets ?? []).filter((s: { completed?: boolean }) => s.completed).length
  expect(done, 'the sets you already did stay done').toBe(3)
})

/**
 * A session you built yourself, finished with barely anything in it, gets one
 * question on the way out — and the answer that leads somewhere is "add one".
 */
test('finishing a thin session asks first, and the ask leads to adding one', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-thin-${Date.now()}`

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
  // One exercise, one set: three taps from the door to "done".
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Thin Session',
      exercises: [{ exerciseSlug: 'push-up', name: 'Push-Up', trackingType: 'reps_bodyweight', sets: 1, reps: '10' }],
    }))
  }, { id: sessionId })

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout/live?session=${sessionId}`)
  await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 20_000 })

  // The only set is the last set, so this button says Finish Workout.
  const finish = page.locator('[data-tour="live-complete-set"]')
  await expect(finish).toHaveText(/finish workout/i)
  await finish.click({ force: true })

  const modal = page.locator('[data-testid="thin-session-modal"]')
  await expect(modal, 'a one-exercise session asks before it is called done').toBeVisible({ timeout: 10_000 })
  console.log('THIN PROMPT:', (await modal.innerText()).replace(/\s+/g, ' '))
  await page.screenshot({ path: 'tests/e2e/screenshots/thin-session-prompt.png' })

  // "Add an exercise" is the way out that leads somewhere.
  await page.locator('[data-testid="thin-session-add"]').click()
  await expect(page.locator('[data-testid="add-exercise-sheet"]')).toBeVisible({ timeout: 10_000 })
  const added = await addExercise(page, 'curl', 'end')
  console.log('ADDED FROM PROMPT:', added)

  // Two exercises is still under four, so it asks again — and this time takes
  // "finish anyway" for an answer. Work down to the last set first.
  for (let i = 0; i < 12; i++) {
    await page.locator('button:has-text("Skip Rest")').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(300)
    if (/finish workout/i.test(await finish.innerText())) break
    // Empty inputs turn the button into "Skip Set", which opens a prompt of its
    // own — fill them so each tap just completes the set.
    const numbers = page.locator('input[inputmode="numeric"], input[inputmode="decimal"], input[type="number"]')
    for (let f = 0; f < await numbers.count(); f++) await numbers.nth(f).fill('10').catch(() => {})
    await finish.click({ force: true })
    await page.waitForTimeout(900)
  }
  await expect(finish).toHaveText(/finish workout/i, { timeout: 10_000 })
  await finish.click({ force: true })
  await expect(modal, 'two exercises is still thin, so it asks again').toBeVisible({ timeout: 10_000 })
  await page.locator('[data-testid="thin-session-finish"]').click()
  await expect(page.getByText(/workout done|you crushed it|program complete/i).first()).toBeVisible({ timeout: 20_000 })
  console.log('FINISHED ANYWAY: the summary came up')
})

/** The Track view asks the same question the Live view does. */
test('the track view also asks before finishing a thin session', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-thin-track-${Date.now()}`

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
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Thin Track',
      exercises: [{ exerciseSlug: 'push-up', name: 'Push-Up', trackingType: 'reps_bodyweight', sets: 1, reps: '10' }],
    }))
  }, { id: sessionId })

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout?session=${sessionId}`)
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible({ timeout: 30_000 })

  // Fill the single set so the workout reaches 100% and offers to complete.
  const reps = page.locator('input[inputmode="numeric"], input[type="number"]').first()
  await reps.fill('10')
  const complete = page.locator('[data-testid="track-complete-workout"]')
  await expect(complete).toBeVisible({ timeout: 15_000 })
  await complete.click()

  const modal = page.locator('[data-testid="thin-session-modal"]')
  await expect(modal, 'the track view asks too').toBeVisible({ timeout: 10_000 })
  console.log('TRACK THIN PROMPT:', (await modal.innerText()).replace(/\s+/g, ' ').slice(0, 80))
  await page.locator('[data-testid="thin-session-finish"]').click()
  await expect(page.getByText(/workout done|you crushed it|program complete/i).first()).toBeVisible({ timeout: 20_000 })
})

/**
 * Exercises can be dropped and reordered mid-session, in both views, and the
 * log follows. A duplicate you added by mistake should not have to be trained.
 */
test('exercises can be removed and reordered from the live view and the track view', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-edit-${Date.now()}`

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
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Edit Session',
      exercises: [
        { exerciseSlug: 'push-up', name: 'Push-Up', trackingType: 'reps_bodyweight', sets: 3, reps: '10' },
        { exerciseSlug: 'bodyweight-squat', name: 'Bodyweight Squat', trackingType: 'reps_bodyweight', sets: 3, reps: '12' },
        // The duplicate — exactly the thing you want gone.
        { exerciseSlug: 'plank', name: 'Plank', trackingType: 'time', sets: 3, duration: '45 sec', reps: '' },
      ],
    }))
  }, { id: sessionId })

  const names = async () => {
    const res = await api.get(`/api/workouts/session?id=${sessionId}`)
    if (!res.ok()) return []
    const body = await res.json()
    return ((body.session?.exercises ?? []) as LoggedExercise[]).map(e => e.name)
  }

  // ── Live view: drop the third, then move the second to the top ────────────
  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout/live?session=${sessionId}`)
  await expect(page.getByText('Push-Up').first()).toBeVisible({ timeout: 20_000 })
  await openExerciseList(page)
  await expect(page.locator('[data-testid="live-remove-2"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-testid="live-remove-2"]').click({ force: true })
  await expect.poll(names, { timeout: 20_000, message: 'the removal reaches the log' }).toEqual(['Push-Up', 'Bodyweight Squat'])
  console.log('LIVE REMOVED: Plank is gone')

  // Hold a row and drag it: the arrows came off the rows, because they left no
  // room for the exercise name.
  await openExerciseList(page)
  const row = page.locator('[data-testid="live-row-1"]')
  const box = (await row.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(600)                      // past the long-press threshold
  await page.mouse.move(box.x + box.width / 2, box.y - box.height, { steps: 8 })
  await page.mouse.up()
  await expect.poll(names, { timeout: 20_000, message: 'the reorder reaches the log' }).toEqual(['Bodyweight Squat', 'Push-Up'])
  console.log('LIVE MOVED: held the squat and dragged it to the top')

  // A tap on a row goes to that exercise — the list is navigation, not a label.
  // (The dots TOGGLE the drawer, so poke until it is actually open.)
  await openExerciseList(page)
  await page.locator('[data-testid="live-row-1"]').click()
  await page.waitForTimeout(600)
  const nowOn = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('TAPPED ROW 2:', (nowOn.match(/Exercise \d+\/\d+/) ?? ['?'])[0])
  expect(nowOn).toContain('Exercise 2/2')
  await page.screenshot({ path: 'tests/e2e/screenshots/edit-live-drawer.png' })

  // ── Track view: the same controls, and the same result ────────────────────
  // They live at the foot of the open card — the header had no room left.
  // Clicking an open card closes it, so only click when it is shut.
  const openCard = async (name: string, index: number) => {
    if (await page.locator(`[data-testid="track-remove-${index}"]`).isVisible().catch(() => false)) return
    await page.getByText(name, { exact: false }).first().click()
    await page.waitForTimeout(400)
  }

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout?session=${sessionId}`)
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible({ timeout: 20_000 })
  await openCard('Bodyweight Squat', 0)
  await expect(page.locator('[data-testid="track-move-down-0"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-testid="track-move-down-0"]').click()
  await expect.poll(names, { timeout: 20_000 }).toEqual(['Push-Up', 'Bodyweight Squat'])
  console.log('TRACK MOVED: back the other way')

  await openCard('Bodyweight Squat', 1)
  await expect(page.locator('[data-testid="track-remove-1"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-testid="track-remove-1"]').click()
  await expect.poll(names, { timeout: 20_000 }).toEqual(['Push-Up'])
  console.log('TRACK REMOVED: down to one')

  // The last exercise stays: a workout with nothing in it is not a workout.
  await openCard('Push-Up', 0)
  await expect(page.locator('[data-testid="track-remove-0"]')).toBeDisabled()
  await page.screenshot({ path: 'tests/e2e/screenshots/edit-track-cards.png', fullPage: true })

  await api.dispose()
})

/**
 * A session you built yourself resumes from the dashboard the same way a
 * program does — the pill used to need a programId, so a quick session left
 * mid-flight was invisible from the home screen.
 */
test('an open quick session shows the resume pill on the dashboard, and it goes back in', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-resume-${Date.now()}`

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  // An open session on the server, with nothing in this browser's stash: the
  // live view has to rebuild it from the log.
  await api.post('/api/workouts', {
    data: {
      kind: 'quick',
      sessionId,
      title: 'E2E Resume Session',
      completed: false,
      tz: new Date().getTimezoneOffset(),
      exercises: [{
        name: 'Barbell Bench Press',
        exerciseSlug: 'barbell-bench-press',
        prescription: { sets: 3, reps: '5', trackingType: 'reps_weight' },
        sets: [{ setNumber: 1, reps: 5, weight: 185, completed: false }],
      }],
    },
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
  await page.goto(`${BASE_URL}/dashboard`)
  await page.locator('button[aria-label="Skip tour"]').first().click({ force: true }).catch(() => {})
  const skip = page.locator('button:has-text("Skip for today"), button:has-text("Skip")').first()
  if (await skip.isVisible().catch(() => false)) await skip.click({ force: true }).catch(() => {})

  const pill = page.locator('a[aria-label*="Get back into"]')
  await expect(pill, 'a quick session is resumable from the home screen').toBeVisible({ timeout: 30_000 })
  const href = await pill.getAttribute('href')
  console.log('RESUME PILL:', (await pill.innerText()).replace(/\s+/g, ' '), '→', href)
  expect(href).toContain(`session=${sessionId}`)

  // Following it rebuilds the session from its log — this browser has never
  // seen the session, so without that the live view would offer demo exercises.
  await page.goto(`${BASE_URL}${href}`)
  await expect(page.getByText('Barbell Bench Press').first()).toBeVisible({ timeout: 30_000 })
  const live = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  expect(live, 'the rebuilt session is the real one, not the demo fallback').not.toContain('Seated Cable Row')
  expect(live).toContain('Exercise 1/1')
  console.log('REBUILT FROM LOG:', (live.match(/Exercise \d+\/\d+ . Set \d+\/\d+/) ?? ['?'])[0], '| history:', /Last:/.test(live), '| PR shown:', /PR:/.test(live))

  await api.dispose()
})

/**
 * Cardio keeps its metrics inside a circuit.
 *
 * The rounds layout hardcoded lbs and reps, so a stair climber dropped into a
 * circuit lost its time, distance and speed — and the DONE tick could never
 * light up, because the tick asks the exercise what it wants and the exercise
 * wanted a duration.
 */
test('a cardio exercise keeps time, distance and speed inside a circuit', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-cardio-${Date.now()}`

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  await context.addCookies([{
    name: 'auth_token', value: token, domain: new URL(BASE_URL).hostname, path: '/',
    httpOnly: false, secure: BASE_URL.startsWith('https'), sameSite: 'Lax',
  }])
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate(t => localStorage.setItem('token', t), token)

  // A circuit of stair climber + curls, exactly the shape that was reported.
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Cardio Circuit',
      exercises: [
        { exerciseSlug: 'stair-climber', name: 'Stair Climber', trackingType: 'time_distance', sets: 2, reps: '', duration: '600', groupId: 'g1', groupType: 'circuit', groupLabel: 'Circuit' },
        { exerciseSlug: 'dumbbell-curl', name: 'Dumbbell Curl', trackingType: 'reps_weight', sets: 2, reps: '8-12', groupId: 'g1', groupType: 'circuit', groupLabel: 'Circuit' },
      ],
    }))
  }, { id: sessionId })

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout?session=${sessionId}`)
  await expect(page.locator('[data-testid="track-add-exercise"]')).toBeVisible({ timeout: 30_000 })

  // Round 1, the cardio exercise: seconds, metres, mph — not lbs and reps.
  const sec = page.locator('[data-testid="round-duration-0-0"]')
  const dist = page.locator('[data-testid="round-distance-0-0"]')
  const mph = page.locator('[data-testid="round-speed-0-0"]')
  await expect(sec, 'cardio asks for time inside a circuit').toBeVisible({ timeout: 15_000 })
  await expect(dist, 'and distance').toBeVisible()
  await expect(mph, 'and speed').toBeVisible()
  await expect(page.locator('[data-testid="round-weight-0-0"]'), 'a stair climber has no load').toHaveCount(0)
  // The weighted exercise beside it still asks for weight and reps.
  await expect(page.locator('[data-testid="round-weight-1-0"]')).toBeVisible()
  await expect(page.locator('[data-testid="round-reps-1-0"]')).toBeVisible()
  console.log('CIRCUIT CARDIO: sec/dist/mph rendered, no weight box')

  // Filling it ticks DONE by itself — the reported "check never comes".
  await sec.fill('600')
  await mph.fill('3.5')
  await expect(page.locator('[data-testid="round-done-0-0"]'), 'the cardio set ticks itself')
    .toHaveAttribute('data-completed', 'true', { timeout: 10_000 })
  console.log('CIRCUIT CARDIO: filled → ticked')

  // And the numbers are kept as time and speed, so the live view (and the log)
  // read a stair climber rather than 600 reps at 3.5 lbs.
  // The shared draft is written on a debounce; give it a beat.
  await page.waitForTimeout(1500)
  const shared = await page.evaluate(({ id }) => JSON.parse(localStorage.getItem(`qs_progress_${id}`) || 'null'), { id: sessionId })
  const cardioSet = shared?.exercises?.[0]?.sets?.[0]
  console.log('CIRCUIT CARDIO shared:', JSON.stringify(cardioSet))
  expect(cardioSet?.duration).toBe('600')
  expect(cardioSet?.speed).toBe('3.5')
  expect(cardioSet?.reps || '').toBe('')

  await page.screenshot({ path: 'tests/e2e/screenshots/cardio-circuit.png', fullPage: true })
  await api.dispose()
})

/**
 * The live view types cardio into the same two boxes as reps and weight (the
 * labels above them say Duration and Distance). It has to LOG them as duration
 * and distance, or a treadmill posts 1600 lbs and a plank posts 45 reps —
 * which is what history, the PR engine and the track view then read.
 */
test('cardio logged in the live view lands in duration, distance and speed', async ({ page, context }) => {
  const token = signToken(E2E_USER.id, E2E_USER.email)
  const sessionId = `e2e-cardio-live-${Date.now()}`

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  await context.addCookies([{
    name: 'auth_token', value: token, domain: new URL(BASE_URL).hostname, path: '/',
    httpOnly: false, secure: BASE_URL.startsWith('https'), sameSite: 'Lax',
  }])
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate(t => localStorage.setItem('token', t), token)
  await page.evaluate(({ id }) => {
    localStorage.setItem(`quick_session_${id}`, JSON.stringify({
      sessionId: id,
      title: 'E2E Cardio Live',
      exercises: [{ exerciseSlug: 'stair-climber', name: 'Stair Climber', trackingType: 'time_distance', sets: 1, reps: '', duration: '600' }],
    }))
  }, { id: sessionId })

  await page.goto(`${BASE_URL}/dashboard/workout/quick/workout/live?session=${sessionId}`)
  await expect(page.getByText('Stair Climber').first()).toBeVisible({ timeout: 30_000 })

  const live = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('LIVE CARDIO asks for:', ['Duration', 'Distance', 'Speed'].filter(l => live.includes(l)).join(', '))
  expect(live).toContain('Duration (sec)')
  expect(live).toContain('Distance (m)')
  expect(live).toContain('Speed (mph)')

  const boxes = page.locator('input[inputmode="numeric"], input[inputmode="decimal"]')
  await boxes.nth(0).fill('600')   // duration
  await boxes.nth(1).fill('1600')  // distance
  await boxes.nth(2).fill('3.5')   // speed
  await page.locator('[data-tour="live-complete-set"]').click({ force: true })

  await expect.poll(async () => {
    const res = await api.get(`/api/workouts/session?id=${sessionId}`)
    if (!res.ok()) return null
    const s = (await res.json()).session?.exercises?.[0]?.sets?.[0]
    return s ? { reps: s.reps, weight: s.weight, duration: s.duration, speed: s.speed } : null
  }, { timeout: 25_000, message: 'cardio is logged as cardio' })
    .toEqual({ reps: 0, weight: 0, duration: 600, speed: 3.5 })
  console.log('LIVE CARDIO: logged as duration + speed, no phantom reps or load')

  await api.dispose()
})
