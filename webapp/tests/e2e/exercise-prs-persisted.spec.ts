/**
 * Exercise PRs Persistence — End-to-End
 *
 * Locks in the user-visible behavior of the persistent-PR refactor:
 *   1. A completed workout's PRs are persisted on the UserProgress doc and
 *      flow back to the client as `newPRsAchieved` in the POST response.
 *   2. Saving the SAME workout again does NOT re-fire newPRsAchieved (the
 *      gating on wasAlreadyComplete works).
 *   3. The persisted PRs are visible on GET /api/progress?detailed=1.
 *
 * Auth/isolation: uses the existing /api/admin/e2e-setup bootstrap, which
 * mints a dedicated `e2etest@become.io` user with workoutLogs/activePrograms/
 * exercisePRs cleared. No production user data is touched.
 *
 * Run from webapp/:
 *   npx playwright test tests/e2e/exercise-prs-persisted.spec.ts
 */

import { test, expect, request } from '@playwright/test'
import { BASE_URL as PROD_URL } from './test-auth'

// Allow CI/local override; default to the prod base from test-auth.ts.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || PROD_URL
const BOOTSTRAP_TOKEN = 'e2e-user-setup-2026'
const TZ_OFFSET = 300 // EST — value of Date.getTimezoneOffset() in minutes

interface BootstrapResp { userId: string; email: string; token: string }

async function bootstrapTestUser(): Promise<BootstrapResp> {
  const ctx = await request.newContext()
  const res = await ctx.post(`${BASE_URL}/api/admin/e2e-setup`, {
    headers: { 'x-bootstrap-token': BOOTSTRAP_TOKEN },
  })
  expect(res.status(), `e2e-setup failed: ${await res.text()}`).toBe(200)
  const body = (await res.json()) as BootstrapResp
  expect(body.token, 'bootstrap must return a JWT').toBeTruthy()
  expect(body.userId, 'bootstrap must return userId').toBeTruthy()
  await ctx.dispose()
  return body
}

function workoutPayload(programId: string) {
  // A first-time completion of Bench Press 135×5 should break PRs across all
  // three dimensions (maxWeight, maxReps, maxE1RM).
  return {
    programId,
    phase: 0,
    day: 'Day 1',
    completed: true,
    duration: 30,
    activeSeconds: 1500,
    tz: TZ_OFFSET,
    exercises: [
      {
        name: 'Bench Press',
        exerciseSlug: 'bench-press',
        sets: [
          { setNumber: 1, weight: 135, reps: 5, completed: true },
        ],
      },
    ],
  }
}

test.describe('Exercise PRs are persisted', () => {
  test('first save records PRs; second identical save reports no new PRs; /api/progress reflects pbs', async () => {
    // ── 0. Bootstrap a fresh, isolated test user ─────────────────────────────
    const { token, userId } = await bootstrapTestUser()
    expect(userId).toBeTruthy()

    const api = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })

    const programId = `e2e-prs-${Date.now()}`
    const payload = workoutPayload(programId)

    // ── 1. First-time completed save → newPRsAchieved returned ───────────────
    const firstSave = await api.post('/api/workouts', { data: payload })
    expect(firstSave.status(), `first save failed: ${await firstSave.text()}`).toBe(200)
    const firstBody = await firstSave.json()
    expect(firstBody.completed).toBe(true)
    expect(firstBody.newPRsAchieved, 'newPRsAchieved must be present on first-time PR').toBeTruthy()
    expect(Array.isArray(firstBody.newPRsAchieved)).toBe(true)
    expect(firstBody.newPRsAchieved.length).toBeGreaterThanOrEqual(1)
    const benchPR = firstBody.newPRsAchieved.find(
      (p: { exerciseSlug: string }) => p.exerciseSlug === 'bench-press',
    )
    expect(benchPR, 'newPRsAchieved must include bench-press').toBeTruthy()
    expect(benchPR.dimensions.sort()).toEqual(['maxE1RM', 'maxReps', 'maxWeight'])

    // ── 2. Second identical save → no double-fire of newPRsAchieved ──────────
    // (wasAlreadyComplete=true on the second go-around skips the PR write.)
    const secondSave = await api.post('/api/workouts', { data: payload })
    expect(secondSave.status(), `second save failed: ${await secondSave.text()}`).toBe(200)
    const secondBody = await secondSave.json()
    // newPRsAchieved is either absent or an empty array on the second pass.
    if (Array.isArray(secondBody.newPRsAchieved)) {
      expect(secondBody.newPRsAchieved.length).toBe(0)
    } else {
      expect(secondBody.newPRsAchieved).toBeUndefined()
    }

    // ── 3. GET /api/progress?detailed=1 reflects the persisted PR ────────────
    // Route shape (route.ts:324): `pbs: Object.values(pbs).sort(...)` — an
    // array of {name, weight, reps, date}, sorted by weight desc. Look up by
    // exercise name.
    const progressRes = await api.get(`/api/progress?detailed=1&tz=${TZ_OFFSET}`)
    expect(progressRes.status(), `progress fetch failed: ${await progressRes.text()}`).toBe(200)
    const progressBody = await progressRes.json()
    expect(Array.isArray(progressBody.pbs), '/api/progress?detailed=1 must include pbs array').toBe(true)
    const benchPb = progressBody.pbs.find(
      (p: { name: string }) => p.name === 'Bench Press',
    )
    expect(benchPb, 'pbs must include the Bench Press PR from persisted exercisePRs').toBeTruthy()
    expect(benchPb.weight).toBe(135)
    expect(benchPb.reps).toBe(5)
    // date is the formatted en-US "MMM D" string from the route
    expect(typeof benchPb.date).toBe('string')

    // ── Cleanup ──────────────────────────────────────────────────────────────
    // Re-running the bootstrap wipes workoutLogs/exercisePRs for the e2e user,
    // leaving things clean for the next CI run.
    await bootstrapTestUser()
    await api.dispose()
  })
})
