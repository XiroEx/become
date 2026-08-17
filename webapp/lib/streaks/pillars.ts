/**
 * Streak arithmetic for the Streaks page.
 *
 * Pure. Everything works on YYYY-MM-DD day keys (already in the member's local
 * zone) so the same code serves any pillar:
 *
 *   • day streaks   — nutrition, mindset, super: consecutive active days
 *   • week streaks  — workouts: consecutive weeks hitting the weekly target.
 *                     Workouts are not a daily habit (five a week is the plan,
 *                     not seven), so a day-based workout streak would break on
 *                     every rest day and never mean anything.
 *
 * "Current" is alive if the last active unit is today OR the one before it —
 * a streak is not lost until the day (or week) has actually gone by unmet.
 *
 * Streaks are not SHOWN until they reach STREAK_VISIBLE_MIN. One day is not a
 * streak, it is a Tuesday. The tiles say "Building · 2/3" until then.
 */

export const STREAK_VISIBLE_MIN = 3

export interface DayStreak {
  /** Consecutive active days ending today or yesterday; 0 if broken. */
  current: number
  /** Longest run in the supplied window. */
  best: number
  activeToday: boolean
}

export interface WeekStreak {
  /** Consecutive weeks meeting the target, ending last week (or this week if already met). */
  current: number
  best: number
  thisWeekCount: number
  target: number
  metThisWeek: boolean
}

const DAY_MS = 86_400_000

function parseKey(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** The day key `n` days after `key` (negative for before). */
export function shiftDay(key: string, n: number): string {
  return toKey(parseKey(key) + n * DAY_MS)
}

/** Sunday's day key for the week containing `key` — the week's identity. */
export function weekKeyOf(key: string): string {
  const ms = parseKey(key)
  const dow = new Date(ms).getUTCDay()
  return toKey(ms - dow * DAY_MS)
}

/** 0=Sun … 6=Sat for a day key. */
export function weekdayOf(key: string): number {
  return new Date(parseKey(key)).getUTCDay()
}

export function dayStreak(activeDays: Iterable<string>, todayKey: string): DayStreak {
  const days = new Set<string>()
  for (const k of activeDays) if (!Number.isNaN(parseKey(k))) days.add(k)

  const activeToday = days.has(todayKey)

  // Current: walk back from today (or yesterday if today is not yet done).
  let current = 0
  let cursor = activeToday ? todayKey : shiftDay(todayKey, -1)
  while (days.has(cursor)) {
    current += 1
    cursor = shiftDay(cursor, -1)
  }

  // Best: longest run anywhere in the window.
  let best = 0
  const sorted = [...days].sort()
  let run = 0
  let prev: string | null = null
  for (const k of sorted) {
    run = prev !== null && shiftDay(prev, 1) === k ? run + 1 : 1
    if (run > best) best = run
    prev = k
  }

  return { current, best: Math.max(best, current), activeToday }
}

/**
 * @param workoutDays  day keys with a completed workout (duplicates fine)
 * @param target       workouts per week the member committed to
 * @param todayKey     today's local day key
 */
export function weekStreak(workoutDays: Iterable<string>, target: number, todayKey: string): WeekStreak {
  const counts = new Map<string, number>()
  for (const k of workoutDays) {
    if (Number.isNaN(parseKey(k))) continue
    const wk = weekKeyOf(k)
    counts.set(wk, (counts.get(wk) ?? 0) + 1)
  }
  const thisWeek = weekKeyOf(todayKey)
  const thisWeekCount = counts.get(thisWeek) ?? 0
  const safeTarget = Math.max(1, Math.round(target))
  const metThisWeek = thisWeekCount >= safeTarget

  // Current: this week counts if it is already met; otherwise it is still in
  // play and neither helps nor breaks. Then walk back a week at a time.
  let current = 0
  let cursor = metThisWeek ? thisWeek : shiftDay(thisWeek, -7)
  while ((counts.get(cursor) ?? 0) >= safeTarget) {
    current += 1
    cursor = shiftDay(cursor, -7)
  }

  // Best run of qualifying weeks.
  let best = 0
  const weeks = [...counts.entries()].filter(([, n]) => n >= safeTarget).map(([wk]) => wk).sort()
  let run = 0
  let prev: string | null = null
  for (const wk of weeks) {
    run = prev !== null && shiftDay(prev, 7) === wk ? run + 1 : 1
    if (run > best) best = run
    prev = wk
  }

  return { current, best: Math.max(best, current), thisWeekCount, target: safeTarget, metThisWeek }
}

/**
 * Days that count for the workout half of the super streak: a workout was
 * completed, OR the day is a rest day on the member's schedule. Without a
 * schedule every day is a training day.
 */
export function workoutOrRestDays(
  workoutDays: Iterable<string>,
  allDays: Iterable<string>,
  trainingWeekdays: number[] | null,
): Set<string> {
  const out = new Set<string>(workoutDays)
  if (!trainingWeekdays || trainingWeekdays.length === 0) return out
  const training = new Set(trainingWeekdays)
  for (const k of allDays) if (!training.has(weekdayOf(k))) out.add(k)
  return out
}

/**
 * Weeks that can no longer hit the target: past weeks that fell short, and the
 * current week if the days left cannot make up the gap. The super streak's
 * workout half drops every day in a lost week — otherwise a member could hold
 * a "super" streak on rest days while their workout week was already blown.
 *
 * "Days left" for the current week are today (if not yet trained) plus the
 * remaining training weekdays on the schedule; with no schedule, every
 * remaining day counts as a chance.
 */
export function lostWeeks(
  workoutDays: Iterable<string>,
  target: number,
  todayKey: string,
  trainingWeekdays: number[] | null,
  weeksBack = 60,
): Set<string> {
  const days = new Set<string>()
  for (const k of workoutDays) if (!Number.isNaN(parseKey(k))) days.add(k)
  const counts = new Map<string, number>()
  for (const k of days) { const wk = weekKeyOf(k); counts.set(wk, (counts.get(wk) ?? 0) + 1) }
  const safeTarget = Math.max(1, Math.round(target))
  const thisWeek = weekKeyOf(todayKey)
  const lost = new Set<string>()
  for (let i = 1; i <= weeksBack; i++) {
    const wk = shiftDay(thisWeek, -7 * i)
    if ((counts.get(wk) ?? 0) < safeTarget) lost.add(wk)
  }
  // Current week: still achievable?
  const done = counts.get(thisWeek) ?? 0
  let chances = 0
  for (let d = todayKey; weekKeyOf(d) === thisWeek; d = shiftDay(d, 1)) {
    if (d === todayKey && days.has(d)) continue // already trained today
    if (!trainingWeekdays || trainingWeekdays.length === 0 || trainingWeekdays.includes(weekdayOf(d))) chances += 1
  }
  if (done + chances < safeTarget) lost.add(thisWeek)
  return lost
}

/** Drop every day whose week is lost. */
export function withoutLostWeeks(days: Iterable<string>, lost: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const k of days) if (!lost.has(weekKeyOf(k))) out.add(k)
  return out
}

/** Every day key from `fromKey` to `toKey` inclusive. */
export function dayRange(fromKey: string, untilKey: string): string[] {
  const out: string[] = []
  const end = parseKey(untilKey)
  for (let ms = parseKey(fromKey); ms <= end; ms += DAY_MS) out.push(toKey(ms))
  return out
}

/** Intersection helper for the super streak. */
export function intersectDays(...sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set()
  const [first, ...rest] = sets
  const out = new Set<string>()
  for (const k of first) if (rest.every(s => s.has(k))) out.add(k)
  return out
}

/** How the UI should present a streak count. */
export function streakDisplay(current: number): { visible: boolean; remaining: number } {
  return current >= STREAK_VISIBLE_MIN
    ? { visible: true, remaining: 0 }
    : { visible: false, remaining: STREAK_VISIBLE_MIN - Math.max(0, current) }
}
