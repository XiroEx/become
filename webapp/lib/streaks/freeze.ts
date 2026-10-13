// One freeze for the super streak.
//
// The super streak is meant to be strict: all three pillars, every day. But a
// strict rule with no give punishes the wrong thing — a funeral, a flight, a
// stomach bug — and once it breaks there is nothing left to protect, which is
// exactly when people stop trying. One freeze is the smallest amount of give
// that keeps the rule honest: it costs something (you only get one, and it takes
// a month to earn back), it has to be spent deliberately, and it covers a single
// day.
//
// Pure: day keys in, day keys out. The storage lives on UserProgress and the
// decision to spend it lives in the API.

import { STREAK_VISIBLE_MIN } from './pillars'

/** How long before a spent freeze comes back. */
export const SUPER_FREEZE_COOLDOWN_DAYS = 30

const DAY_MS = 86_400_000

function parseKey(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
}

function toKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Whole days between two day keys (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b) - parseKey(a)) / DAY_MS)
}

/** The most recent day a freeze was spent, or null. */
export function lastFreezeDay(usedDays: string[] | undefined | null): string | null {
  if (!usedDays?.length) return null
  return [...usedDays].sort().at(-1) ?? null
}

/** Is a freeze in hand today? */
export function freezeAvailable(usedDays: string[] | undefined | null, todayKey: string): boolean {
  const last = lastFreezeDay(usedDays)
  if (!last) return true
  return daysBetween(last, todayKey) >= SUPER_FREEZE_COOLDOWN_DAYS
}

/** The day the freeze comes back, or null when it is already available. */
export function freezeReturnsOn(usedDays: string[] | undefined | null, todayKey: string): string | null {
  const last = lastFreezeDay(usedDays)
  if (!last) return null
  if (daysBetween(last, todayKey) >= SUPER_FREEZE_COOLDOWN_DAYS) return null
  return toKey(parseKey(last) + SUPER_FREEZE_COOLDOWN_DAYS * DAY_MS)
}

export interface FreezeRequest {
  /** The day to cover. Only today: a freeze is a decision, not a rewrite. */
  dayKey: string
  todayKey: string
  usedDays: string[] | undefined | null
  /** The super streak's length right now — nothing to protect below the minimum. */
  currentStreak: number
  /** True when today already has all three pillars: nothing to spend it on. */
  completeToday: boolean
}

export type FreezeRefusal =
  | 'not_today'
  | 'already_used'
  | 'nothing_to_protect'
  | 'day_already_complete'
  | 'already_frozen'

/** Whether this freeze can be spent, and if not, why not. */
export function checkFreeze(req: FreezeRequest): { ok: true } | { ok: false; reason: FreezeRefusal } {
  if (req.dayKey !== req.todayKey) return { ok: false, reason: 'not_today' }
  if (req.usedDays?.includes(req.dayKey)) return { ok: false, reason: 'already_frozen' }
  if (!freezeAvailable(req.usedDays, req.todayKey)) return { ok: false, reason: 'already_used' }
  if (req.currentStreak < STREAK_VISIBLE_MIN) return { ok: false, reason: 'nothing_to_protect' }
  if (req.completeToday) return { ok: false, reason: 'day_already_complete' }
  return { ok: true }
}

/** What to tell someone who cannot spend it. */
export const FREEZE_REFUSAL_MESSAGE: Record<FreezeRefusal, string> = {
  not_today: 'A freeze only covers today.',
  already_used: 'Your freeze is still recharging.',
  already_frozen: 'Today is already frozen.',
  nothing_to_protect: 'There is no super streak to protect yet.',
  day_already_complete: 'Today is already complete — keep the freeze for a day you need it.',
}

/** Days covered by a freeze count as super days. */
export function applyFreezes(superDays: Set<string>, frozen: string[] | undefined | null): Set<string> {
  if (!frozen?.length) return superDays
  const out = new Set(superDays)
  for (const k of frozen) out.add(k)
  return out
}
