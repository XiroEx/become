import { test, expect } from '@playwright/test'
import { BASE_URL, AUTH_TOKEN } from './test-auth'
import { reflowStuckSchedule } from '../../lib/schedule'

// ─────────────────────────────────────────────────────────────────────────────
// Skip ↔ schedule sync coverage.
//
// Part 1 (pure logic): exercises the ACTUAL shipped reflow primitive to prove a
// deliberate skip is a firm decision — it is kept as history and NEVER resurrected
// as an upcoming session. Only genuinely-missed (fell-behind) sessions are
// re-offered. When every session is resolved (completed or skipped) the reflow
// returns null, signalling the caller to mark the program complete.
//
// Part 2 (live round-trip): skips a real upcoming scheduled workout via the API,
// confirms the schedule reflects it, then un-skips to restore — proving the calendar
// store stays in sync and the action round-trips. Self-cleaning (net-zero).
// ─────────────────────────────────────────────────────────────────────────────

const PHASES = [{
  phase: 'Phase 1',
  weeks: '1-2', // repeats the 3-day split for 2 weeks → 6 sessions total
  focus: '',
  workouts: [
    { day: 'Day 1', title: 'A', exercises: [] },
    { day: 'Day 2', title: 'B', exercises: [] },
    { day: 'Day 3', title: 'C', exercises: [] },
  ],
}]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const past = (d: number) => new Date(Date.UTC(2026, 0, d)) // January 2026 — the past
const FROM = new Date(Date.UTC(2026, 6, 10))               // reflow target — the future

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slot = (d: number, day: string, status: string): any =>
  ({ date: past(d), programId: 'p', phase: 1, dayLabel: day, workoutTitle: day, status })

test.describe('reflow logic — skips are firm', () => {
  test('completed + skipped kept as history; only missed re-offered; total preserved', () => {
    const slots = [
      slot(1, 'Day 1', 'completed'),
      slot(2, 'Day 2', 'skipped'),
      slot(3, 'Day 3', 'missed'),
      slot(8, 'Day 1', 'missed'),
      slot(9, 'Day 2', 'missed'),
      slot(10, 'Day 3', 'missed'),
    ]
    const out = reflowStuckSchedule(slots, PHASES, ALL_DAYS, FROM, 'p')
    expect(out).not.toBeNull()

    const byStatus: Record<string, number> = {}
    for (const s of out!) byStatus[s.status] = (byStatus[s.status] || 0) + 1
    // 1 completed + 1 skipped kept as history; the 4 unresolved sessions
    // (6 program sessions − 2 resolved) get re-offered as upcoming.
    expect(byStatus.completed).toBe(1)
    expect(byStatus.skipped).toBe(1)
    expect(byStatus.scheduled).toBe(4)
    expect(out!.length).toBe(6) // total stays equal to the program length — no double count

    // The skip kept its ORIGINAL past date — it was NOT resurrected into the future.
    const skippedSlot = out!.find((s) => s.status === 'skipped')!
    expect(new Date(skippedSlot.date).getTime()).toBe(past(2).getTime())
    // Every re-offered session lands in the future.
    for (const s of out!.filter((s) => s.status === 'scheduled')) {
      expect(new Date(s.date).getTime()).toBeGreaterThanOrEqual(FROM.getTime())
    }
  })

  test('every session completed or skipped → null (program is done, nothing to reflow)', () => {
    const slots = [
      slot(1, 'Day 1', 'completed'),
      slot(2, 'Day 2', 'skipped'),
      slot(3, 'Day 3', 'completed'),
      slot(8, 'Day 1', 'skipped'),
      slot(9, 'Day 2', 'completed'),
      slot(10, 'Day 3', 'skipped'),
    ]
    expect(reflowStuckSchedule(slots, PHASES, ALL_DAYS, FROM, 'p')).toBeNull()
  })

  test('a single skip mid-program is not re-offered while future work remains', () => {
    // One completed, one skipped, and the rest still upcoming (unresolved). The
    // skipped session must not reappear among the re-offered set.
    const slots = [
      slot(1, 'Day 1', 'completed'),
      slot(2, 'Day 2', 'skipped'),
      slot(3, 'Day 3', 'missed'),
      slot(8, 'Day 1', 'missed'),
      slot(9, 'Day 2', 'missed'),
      slot(10, 'Day 3', 'missed'),
    ]
    const out = reflowStuckSchedule(slots, PHASES, ALL_DAYS, FROM, 'p')!
    const reoffered = out.filter((s) => s.status === 'scheduled')
    // Day 2 was skipped once and appears twice in the program; exactly ONE Day 2
    // (the unresolved week-2 occurrence) should be re-offered, not the skipped one.
    expect(reoffered.filter((s) => s.dayLabel === 'Day 2').length).toBe(1)
    expect(reoffered.filter((s) => s.dayLabel === 'Day 1').length).toBe(1)
    expect(reoffered.filter((s) => s.dayLabel === 'Day 3').length).toBe(2)
  })
})

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
