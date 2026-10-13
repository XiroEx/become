/**
 * What to call a past state check-in.
 *
 * Twenty feelings collapse onto four canonical states. The check-in stores both
 * — the state drives the session's adaptation, the feeling is the word the
 * member actually tapped — but the client used to read back only the state and
 * render the state's name.
 *
 * That reads as a bug to the member, and a specific one: each state's canonical
 * name is also the FIRST tile of its colour group in the grid. Pick "Scattered"
 * and the app answers "distracted"; pick "Drained" and it answers "low energy";
 * pick anything green and it answers "locked in". It looks exactly as though
 * your choice was reset to the top of the list you picked from.
 */

import type { MindState } from '@/lib/mindContent'

/** Canonical fallback names, used only for logs written before feelings were stored. */
export const STATE_LABELS: Record<MindState, string> = {
  stressed: 'stressed',
  distracted: 'distracted',
  low_energy: 'low energy',
  locked_in: 'locked in',
}

/**
 * Prefer the exact feeling; fall back to the state name only when there isn't
 * one. Blank/whitespace feelings are treated as absent so a junk value can't
 * render as an empty label.
 */
export function recentFeelingLabel(state: MindState, feeling?: string | null): string {
  const f = feeling?.trim()
  return f && f.length > 0 ? f : STATE_LABELS[state]
}

/** True when we're falling back to the bucket name rather than their word. */
export function isFallbackLabel(feeling?: string | null): boolean {
  return !(feeling?.trim())
}
