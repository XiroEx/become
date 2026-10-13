import { test, expect } from '@playwright/test'
import { BASE_URL, AUTH_TOKEN } from './test-auth'

// ─────────────────────────────────────────────────────────────────────────────
// Skip ↔ schedule sync coverage.
//
// Pure-logic coverage of reflowStuckSchedule() itself (including the "a missed
// session is never resurrected onto today" regression) lives in
// tests/unit/reflowStuckSchedule.test.ts, which runs in CI. This file covers
// the live round-trip through the real API.
//
// Live round-trip: skips a real upcoming scheduled workout via the API,
// confirms the schedule reflects it, then un-skips to restore — proving the calendar
// store stays in sync and the action round-trips. Self-cleaning (net-zero).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('skip ↔ schedule live round-trip', () => {
  test('skip an upcoming workout → schedule marks it skipped → un-skip restores', async ({ request }) => {
    const auth = { Authorization: `Bearer ${AUTH_TOKEN}` }
    const getSchedule = async (programId: string) => {
      const res = await request.get(`${BASE_URL}/api/schedule?programId=${programId}&view=all`, { headers: auth })
      expect(res.ok(), `schedule GET ${res.status()}`).toBeTruthy()
      const body = await res.json()
      return (body.schedules?.[0]?.scheduledWorkouts ?? []) as Array<{ date: string; status: string; dayLabel: string }>
    }

    // Find an in-progress program with an upcoming scheduled slot to act on.
    const activeRes = await request.get(`${BASE_URL}/api/programs/active`, { headers: auth })
    expect(activeRes.ok()).toBeTruthy()
    const active = await activeRes.json()
    const programs: Array<{ programId: string }> = active.activePrograms ?? active.programs ?? (Array.isArray(active) ? active : [])
    test.skip(programs.length === 0, 'no active program to exercise')

    let target: { programId: string; date: string; dayLabel: string } | null = null
    for (const p of programs) {
      const slots = await getSchedule(p.programId)
      const upcoming = slots
        .filter((s) => s.status === 'scheduled' && new Date(s.date) >= new Date())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] // furthest out — least disruptive
      if (upcoming) { target = { programId: p.programId, date: upcoming.date, dayLabel: upcoming.dayLabel }; break }
    }
    test.skip(!target, 'no upcoming scheduled workout available to skip')

    const patch = (action: string) => request.patch(`${BASE_URL}/api/schedule`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { programId: target!.programId, action, workoutDate: target!.date, tz: new Date().getTimezoneOffset() },
    })
    const statusOn = (slots: Array<{ date: string; status: string }>, iso: string) =>
      slots.find((s) => new Date(s.date).getTime() === new Date(iso).getTime())?.status

    try {
      // Skip it → schedule should now report that slot as skipped.
      expect((await patch('skip')).ok()).toBeTruthy()
      let slots = await getSchedule(target!.programId)
      expect(statusOn(slots, target!.date)).toBe('skipped')

      // Re-fetch (fresh GET, incl. any reflow pass): the skip persists — it is NOT
      // resurrected as scheduled, because other upcoming slots keep it off the dead-end path.
      slots = await getSchedule(target!.programId)
      expect(statusOn(slots, target!.date)).toBe('skipped')
    } finally {
      // Restore: un-skip returns the slot to scheduled. Net-zero on the account.
      await patch('unskip').catch(() => {})
    }

    const restored = await getSchedule(target!.programId)
    expect(statusOn(restored, target!.date)).toBe('scheduled')
  })
})

// Drives the DEPLOYED /api/schedule GET through a genuinely fallen-behind
// schedule: seeds a schedule whose every slot is already in the past, then
// confirms the endpoint reports those sessions as MISSED at their true dates
// — never resurrected onto today/upcoming days ("Day 5" perpetually showing
// as "Scheduled" no matter how long it had actually been missed) — and that a
// skip applied directly to a missed slot stays put. Self-restoring: re-seeds
// a clean present-day schedule in `finally`.
test.describe('reflow — deployed end-to-end (seeded, self-restoring)', () => {
  const PROG = 'strength-size-20' // the test user is enrolled; used only as a scratch schedule
  const auth = { Authorization: `Bearer ${AUTH_TOKEN}` }
  const isoDay = (offsetDays: number) => {
    const d = new Date(); d.setDate(d.getDate() + offsetDays)
    return d.toISOString().split('T')[0]
  }

  test('REGRESSION: a fallen-behind schedule marks sessions missed, never resurrects them onto today', async ({ request }) => {
    const postSchedule = (startDate: string) => request.post(`${BASE_URL}/api/schedule`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { programId: PROG, trainingDays: [1, 2, 3, 4, 5], startDate },
    })
    const getSlots = async (): Promise<Array<{ date: string; status: string; dayLabel: string }>> => {
      const res = await request.get(`${BASE_URL}/api/schedule?programId=${PROG}&view=all`, { headers: auth })
      expect(res.ok(), `schedule GET ${res.status()}`).toBeTruthy()
      return (await res.json()).schedules?.[0]?.scheduledWorkouts ?? []
    }

    // Seed: startDate ~10 weeks ago so all sessions land in the past → fallen behind.
    const seeded = await postSchedule(isoDay(-70))
    test.skip(!seeded.ok(), `could not seed ${PROG} (status ${seeded.status()})`)

    try {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const slots = await getSlots()
      const nonRest = slots.filter((s) => s.status !== 'rest')
      test.skip(nonRest.length === 0, `seed produced no sessions for ${PROG}`)

      // No session gets a phantom new date — the calendar tells the truth
      // instead of perpetually showing overdue work as "due today".
      const upcoming = slots.filter((s) => s.status === 'scheduled' && new Date(s.date) >= today)
      expect(upcoming.length, 'fallen-behind sessions must not be resurrected onto today/upcoming dates').toBe(0)

      const missed = slots.filter((s) => s.status === 'missed')
      expect(missed.length, 'past, uncompleted sessions should read as missed').toBeGreaterThan(0)

      // Skip one of the missed sessions directly — it must stay at its
      // ORIGINAL date, not be moved anywhere.
      const target = missed[0]
      const skipRes = await request.patch(`${BASE_URL}/api/schedule`, {
        headers: { ...auth, 'Content-Type': 'application/json' },
        data: { programId: PROG, action: 'skip', workoutDate: target.date, tz: new Date().getTimezoneOffset() },
      })
      expect(skipRes.ok()).toBeTruthy()

      const after = await getSlots()
      const skipped = after.find((s) => new Date(s.date).getTime() === new Date(target.date).getTime())
      expect(skipped?.status, 'a skip stays at its original date, never resurrected').toBe('skipped')
    } finally {
      // Restore a clean, present-day schedule so the scratch program is left sane.
      await postSchedule(isoDay(0)).catch(() => {})
    }
  })
})

// Abandoning a program keeps its workout logs (history), but a re-enrollment must
// start fresh — not inherit the old completions. Drives abandon → re-enroll →
// re-schedule and asserts the hub reports 0 completed for the fresh enrollment.
// Leaves the program freshly enrolled (self-restoring).
test.describe('abandon → re-enroll starts fresh', () => {
  test('a re-enrolled program does not inherit the previous enrollment’s progress', async ({ request }) => {
    const PROG = 'program_1_become' // test user has prior (pre-today) completions here
    const auth = { Authorization: `Bearer ${AUTH_TOKEN}` }
    const today = new Date().toISOString().split('T')[0]

    // Abandon (removes the active enrollment + schedule; keeps historical logs).
    await request.post(`${BASE_URL}/api/programs/abandon`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { programId: PROG },
    }).catch(() => {})

    // Re-enroll fresh (startDate = today) and lay a new schedule.
    const enroll = await request.post(`${BASE_URL}/api/programs/enroll`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { programId: PROG, startDate: today },
    })
    expect(enroll.ok(), `enroll ${enroll.status()}`).toBeTruthy()
    const sched = await request.post(`${BASE_URL}/api/schedule`, {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: { programId: PROG, trainingDays: [1, 2, 3, 4], startDate: today },
    })
    expect(sched.ok(), `schedule ${sched.status()}`).toBeTruthy()

    // The hub must report the fresh enrollment at 0 completed — the pre-today logs
    // (from the prior enrollment) must NOT carry over.
    const active = await (await request.get(`${BASE_URL}/api/programs/active`, { headers: auth })).json()
    const p = (active.activePrograms ?? []).find((x: { programId: string }) => x.programId === PROG)
    expect(p, 'program should be enrolled after re-enroll').toBeTruthy()
    expect(p.completedWorkouts, 'a re-enrolled program must start at 0 completed').toBe(0)
    expect(p.progress).toBe(0)
  })
})

// Read-only: the dashboard "Current Program" and the workout-hub "Continue Training"
// must report the SAME session-based progress for the same program (Fix A — no more
// 50%-vs-45% split from two different denominators).
test.describe('progress % — dashboard and hub agree', () => {
  test('same completed/total and same rounded percentage across surfaces', async ({ request }) => {
    const auth = { Authorization: `Bearer ${AUTH_TOKEN}` }
    const [progRes, activeRes] = await Promise.all([
      request.get(`${BASE_URL}/api/progress`, { headers: auth }),
      request.get(`${BASE_URL}/api/programs/active`, { headers: auth }),
    ])
    expect(progRes.ok()).toBeTruthy()
    expect(activeRes.ok()).toBeTruthy()
    const cp = (await progRes.json()).currentProgram as { programId: string; completedWorkouts?: number; totalWorkouts?: number } | null
    const activeList: Array<{ programId: string; completedWorkouts: number; totalWorkouts: number; progress: number }> =
      (await activeRes.json()).activePrograms ?? []

    test.skip(!cp || cp.completedWorkouts == null || !cp.totalWorkouts, 'no schedule-backed current program')
    const match = activeList.find((p) => p.programId === cp!.programId)
    test.skip(!match, 'current program not present in active list')

    // Same source of truth → identical session counts.
    expect(cp!.completedWorkouts).toBe(match!.completedWorkouts)
    expect(cp!.totalWorkouts).toBe(match!.totalWorkouts)
    // The percentage the dashboard renders equals the hub's.
    const dashPct = Math.round((cp!.completedWorkouts! / cp!.totalWorkouts!) * 100)
    expect(dashPct).toBe(match!.progress)
  })
})
