// Shared client cache key + invalidation for the AI-composed Mind session.
//
// The Mind home pre-composes an AI session and caches it (8h cooldown) so it
// doesn't regenerate on every tab open. Logging a workout or nutrition changes
// the user's context, so those flows call invalidateMindSession() to drop the
// cache — the NEXT Mind load then composes a fresh, up-to-date session.

export const MIND_AI_PLAN_KEY = 'mind-ai-plan'

/** Drop the cached AI session so the next Mind load regenerates. Safe anywhere
 *  (no-op on the server / when storage is unavailable). */
export function invalidateMindSession(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(MIND_AI_PLAN_KEY) } catch { /* ignore */ }
}
