/**
 * Meal-tag time windows: parsing, matching, and picking a default tag.
 *
 * Pure functions only — no Mongo, no React — so the rules can be tested
 * directly and reused by the day-ordering code, the API and the UI.
 *
 * The window model in one line: minutes from local midnight, and a window whose
 * end is <= its start wraps past midnight. "Bed 23:00-02:00" is start 1380, end
 * 120, and 00:30 (30) is inside it. Every check below has to go through
 * `windowContains` for that reason; a naive `start <= t && t < end` silently
 * excludes the entire post-midnight half of any late-night tag.
 */

import { DEFAULT_TAG_TIMES, defaultTimeForTag } from '@/lib/mealPlanTimes'

export const MINUTES_PER_DAY = 1440

export interface TagWindow {
  tag: string
  /** Null when the tag has no set time. It is still ORDERED. */
  startMinutes: number | null
  endMinutes: number | null
}

/** A window with both ends set — the only shape the time checks can act on. */
export interface ScheduledWindow extends TagWindow {
  startMinutes: number
  endMinutes: number
}

export function isScheduled(w: TagWindow | null | undefined): w is ScheduledWindow {
  return Boolean(w) && typeof w!.startMinutes === 'number' && typeof w!.endMinutes === 'number'
}

/** "HH:MM" -> minutes from midnight, or null when unparseable. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** Minutes from midnight -> "HH:MM" (24h, zero-padded). */
export function formatHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Minutes from midnight -> "8:30 am", for display. */
export function formatClockLabel(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const h24 = Math.floor(m / 60)
  const min = m % 60
  const suffix = h24 < 12 ? 'am' : 'pm'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(min).padStart(2, '0')} ${suffix}`
}

/** Local wall-clock minutes from midnight for a Date. */
export function minutesOfDay(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * How long a window lasts, in minutes. Wrap-aware, so a 23:00-02:00 window is
 * 180 minutes rather than a negative number.
 */
export function windowLength(w: ScheduledWindow): number {
  const raw = w.endMinutes - w.startMinutes
  return raw > 0 ? raw : raw + MINUTES_PER_DAY
}

/**
 * Is a wall-clock minute inside this window? Start-inclusive, end-exclusive.
 *
 * A window whose end is <= its start wraps past midnight, so the test flips
 * from "between" to "outside the gap".
 */
export function windowContains(w: ScheduledWindow, minutes: number): boolean {
  const t = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  if (w.endMinutes > w.startMinutes) return t >= w.startMinutes && t < w.endMinutes
  // Wraps midnight: inside means at-or-after the start OR before the end.
  return t >= w.startMinutes || t < w.endMinutes
}

/** The SCHEDULED window for a tag, if it has one. Order-only rows return null. */
export function windowForTag(windows: TagWindow[], tag: string): ScheduledWindow | null {
  const lower = tag.toLowerCase()
  const found = windows.find(w => w.tag.toLowerCase() === lower)
  return isScheduled(found) ? found : null
}

/** Every tag the member has ordered, in their order. */
export function orderedTags(windows: TagWindow[]): string[] {
  return windows.map(w => w.tag.toLowerCase())
}

/** Position in the member's meal order; -1 when the tag is not listed. */
export function orderIndexForTag(windows: TagWindow[], tag: string): number {
  return windows.findIndex(w => w.tag.toLowerCase() === tag.toLowerCase())
}

/**
 * Which tag should be selected by default at this time of day?
 *
 * Only the member's own windows get a vote. When several overlap, the NARROWEST
 * wins: someone who defines "Lunch 11:00-14:00" and "Post-workout 12:00-12:30"
 * means the narrower one at 12:15, because a tight window is a more deliberate
 * statement than a loose one.
 *
 * Returns null when nothing covers this minute, which is the honest answer for a
 * member who only scheduled breakfast — the caller decides what to fall back to.
 */
export function tagForMinutes(windows: TagWindow[], minutes: number): string | null {
  const hits = windows.filter(isScheduled).filter(w => windowContains(w, minutes))
  if (hits.length === 0) return null
  let best = hits[0]
  for (const w of hits) if (windowLength(w) < windowLength(best)) best = w
  return best.tag.toLowerCase()
}

/**
 * The app-wide fallback used when a member has scheduled nothing that covers
 * `minutes`. This is the pre-existing hardcoded behaviour, kept as the floor so
 * a member who never opens the Meal Schedule screen sees exactly what they saw
 * before.
 */
export function fallbackTagForMinutes(minutes: number): string {
  const h = Math.floor((((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60)
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack'
}

/** The tag to preselect when the food picker opens. Schedule first, then floor. */
export function defaultTagAt(windows: TagWindow[], minutes: number): string {
  return tagForMinutes(windows, minutes) ?? fallbackTagForMinutes(minutes)
}

/**
 * Where a tag sits on the clock, for ORDERING things that have no real time of
 * their own — chiefly a planned meal, which carries a date but not a moment.
 *
 * Preference order: the member's own window start, then the app-wide table, then
 * midday. Never null, because everything on the day view has to sort somewhere.
 */
export function sortMinutesForTag(windows: TagWindow[], tag: string): number {
  const own = windowForTag(windows, tag)
  if (own) return own.startMinutes
  const [h, m] = defaultTimeForTag(tag)
  return h * 60 + m
}

/** Does the app-wide table know this tag? Used to offer sensible starting values. */
export function suggestedWindowForTag(tag: string): TagWindow | null {
  const lower = tag.toLowerCase()
  const known = DEFAULT_TAG_TIMES[lower]
  if (!known) return null
  const start = known[0] * 60 + known[1]
  // A two-hour suggestion is wide enough to be useful and narrow enough that the
  // member will want to adjust it rather than accept it blindly.
  return { tag: lower, startMinutes: start, endMinutes: (start + 120) % MINUTES_PER_DAY }
}

/**
 * Is logging this tag right now unusual? Drives the "outside its usual time"
 * hint in the picker.
 *
 * Unscheduled tags are never "outside" anything — that is the whole point of
 * leaving a tag unscheduled — so this returns false for them rather than
 * nagging someone whose shift moves every day.
 */
export function isOutsideWindow(windows: TagWindow[], tag: string, minutes: number): boolean {
  const w = windowForTag(windows, tag)
  if (!w) return false
  return !windowContains(w, minutes)
}

/**
 * Where an entry logged WITHOUT a time belongs on the day.
 *
 * The member's own framing: "if I have lunch -> snack -> dinner as the order set,
 * and lunch is 1-4pm and dinner is 6pm-10pm, and I log dinner one day at 3pm,
 * then log a snack with no time, it should appear after that dinner. The 4pm and
 * 6pm act as the true anchors in that case. If the dinner I logged was 5pm, and I
 * also log a snack with no time later, it should appear before that dinner."
 *
 * So the anchor for an unscheduled tag is the END of the nearest scheduled tag
 * ABOVE it in the order — 4pm for snack in that example. A dinner actually eaten
 * at 3pm falls before it; one at 5pm falls after. Both readings match what the
 * member expects without anyone having to type a time.
 *
 * Resolution order:
 *   1. the tag's own window start, when it has one
 *   2. the end of the nearest scheduled tag above it
 *   3. the start of the nearest scheduled tag below it
 *   4. the app-wide table, then midday
 *
 * Ties are broken by order index at the call site, which is what keeps several
 * unscheduled tags sharing one anchor in the member's chosen sequence.
 */
export function anchorMinutesForTag(windows: TagWindow[], tag: string): number {
  const lower = tag.toLowerCase()
  const i = windows.findIndex(w => w.tag.toLowerCase() === lower)

  if (i >= 0) {
    const own = windows[i]
    if (isScheduled(own)) return own.startMinutes

    for (let j = i - 1; j >= 0; j--) {
      const w = windows[j]
      if (isScheduled(w)) return w.endMinutes
    }
    for (let j = i + 1; j < windows.length; j++) {
      const w = windows[j]
      if (isScheduled(w)) return w.startMinutes
    }
  }

  // Not in the member's list at all, or nothing in the list is scheduled.
  const [h, m] = defaultTimeForTag(lower)
  return h * 60 + m
}

/**
 * Accept only whole minutes inside a day; null means "no time set".
 *
 * Lives here rather than in the API route because a Next.js App Router route
 * file may only export its HTTP handlers — exporting this helper from there to
 * make it testable broke `next build` with "cleanMinutes is not a valid Route
 * export field", and `tsc --noEmit` does not catch that.
 *
 * The explicit null/''/undefined check is load-bearing: `Number(null)` is 0, so
 * without it an UNSCHEDULED tag arrives as midnight paired with a midnight end,
 * trips the zero-length-window guard, and the whole save is rejected.
 */
export function cleanMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 0 || rounded >= MINUTES_PER_DAY) return null
  return rounded
}
