/**
 * Whether a composed-but-unfinished session is still the right one to hand back.
 *
 * The session used to be rolled fresh on every Begin (`MindJourney.begin` set the
 * seed to `Date.now()`), so leaving halfway and returning gave you a different
 * session entirely. There was no place to lose, which is its own kind of broken.
 *
 * The rule, stated by the product owner: it stays until you finish it. A new day
 * regenerates it, and so does logging something the session was built from —
 * a workout or a meal — because the composer reads that context and a session
 * built on yesterday's picture is worse than a fresh one.
 */

export interface ActiveSessionStamp {
  dateKey: string
  generatedAt: Date | string
  lastWorkoutAt?: Date | string | null
  lastMealAt?: Date | string | null
}

export interface ActivityNow {
  /** Most recent workout log, or null when there is none. */
  lastWorkoutAt: Date | string | null
  /** Most recent meal log, or null when there is none. */
  lastMealAt: Date | string | null
}

export type StaleReason = 'new_day' | 'workout_logged' | 'meal_logged'

const ms = (d: Date | string | null | undefined): number | null => {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Returns why the stored session should be thrown away, or null to keep it.
 *
 * Comparing watermarks rather than counts on purpose: a deleted-and-relogged
 * meal leaves the count unchanged while the picture genuinely moved.
 */
export function staleReason(
  stored: ActiveSessionStamp | null | undefined,
  todayKey: string,
  now: ActivityNow,
): StaleReason | null {
  if (!stored) return null

  if (stored.dateKey !== todayKey) return 'new_day'

  const wNow = ms(now.lastWorkoutAt)
  const wThen = ms(stored.lastWorkoutAt)
  if (wNow !== null && (wThen === null || wNow > wThen)) return 'workout_logged'

  const mNow = ms(now.lastMealAt)
  const mThen = ms(stored.lastMealAt)
  if (mNow !== null && (mThen === null || mNow > mThen)) return 'meal_logged'

  return null
}

/** Keep the stored session? Sugar over staleReason for call sites that only care. */
export function isStillValid(
  stored: ActiveSessionStamp | null | undefined,
  todayKey: string,
  now: ActivityNow,
): boolean {
  return Boolean(stored) && staleReason(stored, todayKey, now) === null
}
