/**
 * Program-nudge gating.
 *
 * This state used to live ONLY in localStorage, and that is why the permanent
 * opt-out never really worked. iOS gives a home-screen PWA its own storage
 * container (the same thing that forced the daily check-in server-side — see
 * app/api/checkin/route.ts), and Safari's ITP evicts script-writable storage
 * after a week of no interaction. Meanwhile the backoff below deliberately
 * spaces the showings 1 → 2 → 4 → 8 → 16 days apart, so by the third step the
 * gap between two showings is LONGER than the eviction window. A member could
 * dismiss the nudge indefinitely and never once have `dismissCount` survive
 * long enough to be offered the opt-out — and if they did tap it, the opt-out
 * itself was stored in that same evictable, per-container key and came back.
 *
 * So the record lives on UserProgress.programNudge and these helpers are pure,
 * shared by the route that decides and the client that renders.
 */

/** Legacy localStorage key. Still read once, to adopt state into the account. */
export const NUDGE_KEY = 'become_program_nudge'

export interface NudgeState {
  dismissCount: number
  lastDismissedAt: string
  dontShowAgain?: boolean
}

/**
 * How many prior dismissals before the modal offers a permanent opt-out.
 *
 * 1 means it is offered from the SECOND showing onward: a first-time member is
 * not invited to suppress something they have not seen yet, but anyone who has
 * said "not now" even once gets a way to say "not ever" the very next time.
 */
export const DONT_SHOW_AGAIN_THRESHOLD = 1

/** Longest the backoff is allowed to grow to, in days. */
const MAX_BACKOFF_DAYS = 16

export function shouldShowNudge(state: NudgeState | null): boolean {
  if (!state) return true
  if (state.dontShowAgain) return false
  const last = new Date(state.lastDismissedAt).getTime()
  // A missing or unparseable stamp must not read as 1970 (which would make the
  // nudge permanently due); treat it as "we have no idea" and show it.
  if (!Number.isFinite(last)) return true
  const daysSince = (Date.now() - last) / 86_400_000
  // 1 day → 2 days → 4 days → 8 days → 16 days (capped)
  const daysToWait = Math.min(Math.pow(2, state.dismissCount - 1), MAX_BACKOFF_DAYS)
  return daysSince >= daysToWait
}

/** True once the member has dismissed enough times to be offered the opt-out. */
export function offersDontShowAgain(dismissCount: number): boolean {
  return dismissCount >= DONT_SHOW_AGAIN_THRESHOLD
}

export function recordNudgeDismiss(current: NudgeState | null): NudgeState {
  return {
    dismissCount: (current?.dismissCount ?? 0) + 1,
    lastDismissedAt: new Date().toISOString(),
  }
}

export function recordNudgeDismissForever(current: NudgeState | null): NudgeState {
  return {
    dismissCount: current?.dismissCount ?? 0,
    lastDismissedAt: new Date().toISOString(),
    dontShowAgain: true,
  }
}

/**
 * Parse whatever is sitting in localStorage into a state we are willing to
 * adopt onto the account. Anything malformed becomes null rather than throwing,
 * and the count is clamped: it only ever suppresses this member's own modal, so
 * there is nothing to steal, but an absurd value should not reach the database.
 */
export function parseLegacyNudgeState(raw: string | null): NudgeState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<NudgeState> | null
    if (!parsed || typeof parsed !== 'object') return null
    const count = Number(parsed.dismissCount)
    const stamp =
      typeof parsed.lastDismissedAt === 'string' &&
      Number.isFinite(new Date(parsed.lastDismissedAt).getTime())
        ? parsed.lastDismissedAt
        : new Date().toISOString()
    return {
      dismissCount: Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 0), 99) : 0,
      lastDismissedAt: stamp,
      ...(parsed.dontShowAgain === true ? { dontShowAgain: true } : {}),
    }
  } catch {
    return null
  }
}
