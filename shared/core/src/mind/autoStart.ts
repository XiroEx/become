// Decides whether MindJourney should auto-begin today's session on load.
//
// Backs the home dashboard's Mindset tile (`?start=1`), which promises to
// "jump straight into today's session" rather than just onto the Mind page.
// Pulled out as a pure function (no React) so the decision is unit-testable
// without jsdom — see composeSession.ts / suggestActions.ts for the same
// pattern in this directory.

export interface AutoStartMindSessionInput {
  /** The `?start=1` query param was present on load. */
  autoStart: boolean
  /** begin() already fired once for this mount — never re-fire. */
  alreadyStarted: boolean
  /** Initial data (progress/session/state) is still in flight. */
  loading: boolean
  /** Already inside the immersive session player. */
  playing: boolean
  /** null while identity is loading; false = onboarding not completed. */
  onboarded: boolean | null
  /** progress.mainSessionAvailable — false during the post-session cooldown. */
  available: boolean
  /** A composed plan (deterministic or AI) actually exists to begin. */
  hasPlan: boolean
}

/**
 * True exactly once the page has everything begin() needs and nothing that
 * should block it. Returns false (never forces a start) during onboarding,
 * the cooldown window, or before data has loaded — there is nothing valid to
 * jump into yet, so the tile silently falls back to landing on the page.
 */
export function shouldAutoStartMindSession(input: AutoStartMindSessionInput): boolean {
  if (!input.autoStart || input.alreadyStarted) return false
  if (input.loading || input.playing) return false
  if (input.onboarded !== true) return false
  if (!input.available || !input.hasPlan) return false
  return true
}
