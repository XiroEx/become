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

/** The slice of the tutorial context this needs — keeps callers easy to test. */
export interface TutorialStatusSource {
  getStatus: (id: string) => { status: string; version: number } | null
}

export function onboardingSettled(tutorial: TutorialStatusSource): boolean {
  const entry = tutorial.getStatus(ONBOARDING_TOUR_ID)
  // No entry means the tour has never run. It is still coming, so hold.
  if (!entry) return false
  if (entry.version < (becomeOnboardingTour.version ?? 1)) return false
  return entry.status === 'completed' || entry.status === 'dismissed'
}
