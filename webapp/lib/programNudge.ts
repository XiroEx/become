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
 *
 * The other half of "the second time this pops up there should be a way out":
 * the count that matters is SHOWINGS, not dismissals. Only the two buttons and
 * the backdrop recorded anything, so a member who left the modal any other way
 * — backgrounding the PWA, killing the app, reloading — stayed at zero
 * forever. The nudge was then due on every single dashboard load and never
 * once offered the opt-out, because nothing had ever been "dismissed". A
 * showing is what the member actually experiences, so a showing is what counts
 * and what starts the backoff clock.
 */

/** Legacy localStorage key. Still read once, to adopt state into the account. */
export const NUDGE_KEY = 'become_program_nudge'

export interface NudgeState {
  dismissCount: number
  /** Absent on a record that has only ever been SHOWN, never dismissed. */
  lastDismissedAt?: string
  dontShowAgain?: boolean
  shownCount?: number
  lastShownAt?: string
}

/**
 * How many prior showings before the modal offers a permanent opt-out.
 *
 * 1 means it is offered from the SECOND showing onward: a first-time member is
 * not invited to suppress something they have not seen yet, but anyone who has
 * seen it even once gets a way to say "not ever" the very next time.
 */
export const DONT_SHOW_AGAIN_THRESHOLD = 1

/** Longest the backoff is allowed to grow to, in days. */
const MAX_BACKOFF_DAYS = 16

/**
 * How many times this member has already been shown the nudge.
 *
 * A dismissal implies a showing, so a record written before showings were
 * counted — or adopted from a browser that only ever tracked dismissals —
 * still gets credit for every time it was in front of someone.
 */
export function nudgeShowings(state: NudgeState | null | undefined): number {
  if (!state) return 0
  const shown = Number(state.shownCount)
  const dismissed = Number(state.dismissCount)
  return Math.max(
    Number.isFinite(shown) ? shown : 0,
    Number.isFinite(dismissed) ? dismissed : 0,
    0,
  )
}

/**
 * When we last put it in front of them. Either stamp counts, and the LATER one
 * wins: a dismissal is recorded a beat after the showing that preceded it, and
 * an un-dismissed showing has no dismissal stamp at all.
 */
function lastContactMs(state: NudgeState): number | null {
  const stamps = [state.lastShownAt, state.lastDismissedAt]
    .map((s) => (s ? new Date(s).getTime() : NaN))
    .filter((n) => Number.isFinite(n))
  return stamps.length ? Math.max(...stamps) : null
}

export function shouldShowNudge(state: NudgeState | null): boolean {
  if (!state) return true
  if (state.dontShowAgain) return false
  const last = lastContactMs(state)
  // A missing or unparseable stamp must not read as 1970 (which would make the
  // nudge permanently due); treat it as "we have no idea" and show it.
  if (last === null) return true
  const daysSince = (Date.now() - last) / 86_400_000
  // 1 day → 2 days → 4 days → 8 days → 16 days (capped)
  const daysToWait = Math.min(Math.pow(2, nudgeShowings(state) - 1), MAX_BACKOFF_DAYS)
  return daysSince >= daysToWait
}

/** True once the member has seen it enough times to be offered the opt-out. */
export function offersDontShowAgain(priorShowings: number): boolean {
  return priorShowings >= DONT_SHOW_AGAIN_THRESHOLD
}

/**
 * Record that the modal was actually put on screen. This is what makes the
 * opt-out reachable without requiring a deliberate dismissal first, and what
 * stops an un-dismissed nudge from reappearing on every single page load.
 */
export function recordNudgeShown(current: NudgeState | null): NudgeState {
  return {
    ...(current ?? { dismissCount: 0 }),
    shownCount: nudgeShowings(current) + 1,
    lastShownAt: new Date().toISOString(),
  }
}

export function recordNudgeDismiss(current: NudgeState | null): NudgeState {
  return {
    ...(current ?? {}),
    dismissCount: (current?.dismissCount ?? 0) + 1,
    lastDismissedAt: new Date().toISOString(),
    // A dismissal is also a showing that has now ended. Counting it keeps the
    // two in step for a member whose 'shown' write never landed.
    shownCount: Math.max(nudgeShowings(current), (current?.dismissCount ?? 0) + 1),
  }
}

export function recordNudgeDismissForever(current: NudgeState | null): NudgeState {
  return {
    ...(current ?? { dismissCount: 0 }),
    dismissCount: current?.dismissCount ?? 0,
    lastDismissedAt: new Date().toISOString(),
    dontShowAgain: true,
  }
}

/**
 * Parse whatever is sitting in localStorage into a state we are willing to
 * adopt onto the account. Anything malformed becomes null rather than throwing,
 * and the counts are clamped: they only ever suppress this member's own modal,
 * so there is nothing to steal, but an absurd value should not reach the
 * database.
 */
export function parseLegacyNudgeState(raw: string | null): NudgeState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<NudgeState> | null
    if (!parsed || typeof parsed !== 'object') return null
    const clamp = (value: unknown): number => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), 99) : 0
    }
    const stamp = (value: unknown): string | undefined =>
      typeof value === 'string' && Number.isFinite(new Date(value).getTime())
        ? value
        : undefined
    const lastDismissedAt = stamp(parsed.lastDismissedAt)
    const lastShownAt = stamp(parsed.lastShownAt)
    return {
      dismissCount: clamp(parsed.dismissCount),
      // A record with neither stamp is still worth adopting for its counts, so
      // give it one rather than dropping it — but never invent one for a record
      // that already carries the other.
      ...(lastDismissedAt || lastShownAt
        ? {}
        : { lastDismissedAt: new Date().toISOString() }),
      ...(lastDismissedAt ? { lastDismissedAt } : {}),
      ...(lastShownAt ? { lastShownAt } : {}),
      ...(parsed.shownCount !== undefined ? { shownCount: clamp(parsed.shownCount) } : {}),
      ...(parsed.dontShowAgain === true ? { dontShowAgain: true } : {}),
    }
  } catch {
    return null
  }
}
