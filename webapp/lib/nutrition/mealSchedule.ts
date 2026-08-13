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
  startMinutes: number
  endMinutes: number
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
export function windowLength(w: TagWindow): number {
  const raw = w.endMinutes - w.startMinutes
  return raw > 0 ? raw : raw + MINUTES_PER_DAY
}

/**
 * Is a wall-clock minute inside this window? Start-inclusive, end-exclusive.
 *
 * A window whose end is <= its start wraps past midnight, so the test flips
 * from "between" to "outside the gap".
 */
export function windowContains(w: TagWindow, minutes: number): boolean {
  const t = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  if (w.endMinutes > w.startMinutes) return t >= w.startMinutes && t < w.endMinutes
  // Wraps midnight: inside means at-or-after the start OR before the end.
  return t >= w.startMinutes || t < w.endMinutes
}

/** The window configured for a tag, if any. */
export function windowForTag(windows: TagWindow[], tag: string): TagWindow | null {
  const lower = tag.toLowerCase()
  return windows.find(w => w.tag.toLowerCase() === lower) ?? null
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
  const hits = windows.filter(w => windowContains(w, minutes))
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
