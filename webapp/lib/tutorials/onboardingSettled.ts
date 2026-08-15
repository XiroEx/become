/**
 * Has the member finished with the onboarding tour, one way or another?
 *
 * Used to hold the daily check-in back until onboarding is out of the way. The
 * library's own `isCompleted()` is deliberately stricter than what we want here:
 * it returns false for a tour the member SKIPPED, which would leave anyone who
 * tapped "Skip tour" without a daily check-in forever. For gating purposes
 * "dismissed" is just as settled as "completed" — in both cases the member is
 * done being taught and nothing is about to draw over the screen.
 *
 * Version matters too. Progress is stored per (id, version), so when the tour is
 * revised the engine replays it for members who finished the older cut. An entry
 * stamped with a stale version is therefore NOT settled: that tour is about to
 * run again, and the check-in should keep waiting.
 */

import { becomeOnboardingTour } from '@/lib/tutorials/becomeTour'

export const ONBOARDING_TOUR_ID = becomeOnboardingTour.id

/**
 * The tour segment that plays on /dashboard. Defined in tutorials/sections/core
 * with a route trigger on /dashboard, and it is the ONLY segment that can draw
 * over the daily check-in.
 */
export const DASHBOARD_SEGMENT = 'home'

/** The slice of the tutorial context this needs — keeps callers easy to test. */
export interface TutorialStatusSource {
  getStatus: (id: string) => {
    status: string
    version: number
    /** Per-segment outcome, keyed by segment name. */
    segments?: Record<string, string>
  } | null
}

export function onboardingSettled(tutorial: TutorialStatusSource): boolean {
  const entry = tutorial.getStatus(ONBOARDING_TOUR_ID)
  // No entry means the tour has never run. It is still coming, so hold.
  if (!entry) return false
  if (entry.version < (becomeOnboardingTour.version ?? 1)) return false
  if (entry.status === 'completed' || entry.status === 'dismissed') return true

  // A tour ABANDONED PART-WAY is the case this originally got wrong.
  //
  // The whole tour stays 'in-progress' forever once someone walks away mid-way —
  // there is no timeout and nothing marks it finished. So this returned false on
  // every single load, the check-in fell through to the 6-second fail-safe timer,
  // and anyone who tapped into a section before that timer fired never saw their
  // check-in again. Reported as "why do I no longer get my daily check in": a
  // real account had been sitting at 'in-progress' on the workout-schedule
  // segment for weeks with its home segment long since completed.
  //
  // Only the segment that plays ON THIS SCREEN can collide with the check-in.
  // Once it is done, nothing is going to draw over the dashboard however much of
  // the rest of the tour is outstanding.
  const home = entry.segments?.[DASHBOARD_SEGMENT]
  return home === 'completed' || home === 'dismissed'
}
