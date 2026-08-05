/**
 * When the daily check-in is allowed to appear.
 *
 * This used to live inline in DashboardClient as a single OR:
 *
 *     if (daysSinceMood > 0 || daysSinceWeight > 0) { ...show unless 8h stamp... }
 *
 * which produced three complaints from members:
 *
 *   1. Logging ONE half of the check-in left the other half's day-counter above
 *      zero, so the modal stayed "due" and came back the same day. Saving your
 *      weight bought you eight hours, not the day.
 *   2. "Skip for Today" wrote a weight skip and nothing else, so it also only
 *      bought eight hours — the button did not do what it says.
 *   3. The gate was a localStorage timestamp, so it was per-device and per-
 *      browser-context. An iOS home-screen PWA keeps its own storage container
 *      separate from Safari; checking in on one re-prompted on the other.
 *
 * The rule now: a check-in is COMPLETE when both mood and weight are logged for
 * the member's local day, and a complete check-in (or an explicit skip) closes
 * the prompt until tomorrow. The eight-hour window still exists, but only for
 * the genuinely partial case — you gave us one of the two and we may ask once
 * more later for the other.
 */

/** How long a partial check-in buys before we may ask for the missing half. */
export const PARTIAL_SUPPRESS_HOURS = 8

export type CheckInReason =
  /** Both halves logged today — nothing to ask for. */
  | 'complete'
  /** Member pressed "Skip for Today". Done until tomorrow. */
  | 'skipped'
  /** Partially done (or ignored) and inside the 8h window. */
  | 'throttled'
  /** Show it. */
  | 'due'

export interface CheckInFacts {
  /** A mood entry exists inside the member's local day. */
  moodLoggedToday: boolean
  /** A weight entry exists inside the member's local day. */
  weightLoggedToday: boolean
  /** "Skip for Today" was pressed during the member's local day. */
  skippedToday: boolean
  /** When the modal was last put in front of this member, on any device. */
  lastShownAt?: Date | string | null
}

export interface CheckInDecision {
  due: boolean
  reason: CheckInReason
  /** True once both halves are in — drives "you're done" affordances. */
  complete: boolean
}

function toMs(v: Date | string | null | undefined): number {
  if (!v) return 0
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

export function checkInDecision(
  facts: CheckInFacts,
  now: Date = new Date(),
): CheckInDecision {
  const complete = facts.moodLoggedToday && facts.weightLoggedToday

  // A finished check-in is finished. No timer, no second ask.
  if (complete) return { due: false, reason: 'complete', complete }

  // "Skip for Today" means today, not eight hours.
  if (facts.skippedToday) return { due: false, reason: 'skipped', complete }

  const lastShown = toMs(facts.lastShownAt)
  if (lastShown > 0) {
    const hoursSince = (now.getTime() - lastShown) / (1000 * 60 * 60)
    // A clock that moved backwards (device time change, stale write) must not
    // pin the prompt shut forever — negative elapsed time counts as "long ago".
    if (hoursSince >= 0 && hoursSince < PARTIAL_SUPPRESS_HOURS) {
      return { due: false, reason: 'throttled', complete }
    }
  }

  return { due: true, reason: 'due', complete }
}
