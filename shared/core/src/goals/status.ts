/**
 * How the nutrition weight goal's badge should read — one rule, three surfaces
 * (the Becoming door, the Becoming details sheet and the plan card), so they
 * can never disagree about whether a member has reached their goal.
 *
 * Two different claims were being made with the same two words:
 *
 *   'reached'  the goal is officially achieved — the band held for a week and
 *              no weigh-in since has broken it (lib/goals/ensure.ts).
 *   'at-goal'  today's weigh-in is inside the finish band, but the hold has
 *              not been confirmed. Worth saying, worth celebrating, and NOT
 *              the same sentence as "you reached your target" — which is the
 *              distinction lib/goals/suggestions.ts already draws in words.
 *
 * Pure, and free of any model import, so client components can call it.
 */

import type { PaceStatus } from './pace'

export type ReachedRead = 'reached' | 'at-goal' | null

export function readReached(
  status: 'none' | 'active' | 'achieved' | null | undefined,
  paceStatus: PaceStatus | null | undefined,
): ReachedRead {
  if (status === 'achieved') return 'reached'
  if (paceStatus === 'done') return 'at-goal'
  return null
}
