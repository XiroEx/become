// Shared client cache for the AI-composed Mind session.
//
// The session is pre-composed in the background (on app open, see
// lib/mind/precompose.ts) and cached here with an 8h cooldown so it does NOT
// regenerate on every Mind tab open. Logging a workout or nutrition changes the
// user's context, so those flows call invalidateMindSession() to drop the cache
// — the next compose (app open or Mind open with an empty cache) then makes a
// fresh, up-to-date session. The Mind home only READS this cache; it never
// blocks on generation.

import type { MindSessionPlan } from './moves'

export const MIND_AI_PLAN_KEY = 'mind-ai-plan'
export const AI_PLAN_TTL = 8 * 60 * 60 * 1000 // 8h cooldown

/** Read the cached plan + its timestamp. A record may carry { ts } with no plan
 *  (a cooldown stamp from an attempt that hasn't resolved/ failed) — callers
 *  fall back to the deterministic plan in that case. */
export function readMindPlanCache(): { plan: MindSessionPlan | null; ts: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MIND_AI_PLAN_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { plan?: MindSessionPlan; ts?: number }
    if (typeof o?.ts === 'number') return { plan: o.plan ?? null, ts: o.ts }
  } catch { /* ignore */ }
  return null
}

/** Drop the cached AI session so the next compose regenerates. Safe anywhere
 *  (no-op on the server / when storage is unavailable). */
export function invalidateMindSession(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(MIND_AI_PLAN_KEY) } catch { /* ignore */ }
}
