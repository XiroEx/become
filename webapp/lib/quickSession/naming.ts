import type { StoredQuickSession } from './store'

const DEFAULT_NAMES = new Set(['', 'quick session', 'workout now'])

/** True when the title is still product copy rather than a name the member chose. */
export function isDefaultQuickSessionName(title: string | null | undefined): boolean {
  return DEFAULT_NAMES.has((title ?? '').trim().toLowerCase())
}

/**
 * A newly made, still-unnamed session asks for a name at its first completed
 * save. A repeat copied from history already has an identity, even when that
 * older record used the legacy "Quick Session" title.
 */
export function shouldPromptForQuickSessionName(
  session: Pick<StoredQuickSession, 'title' | 'sourceSessionId' | 'needsName'> | null | undefined,
): boolean {
  if (!session || session.sourceSessionId) return false
  if (typeof session.needsName === 'boolean') return session.needsName
  // Backward compatibility for drafts created before explicit naming intent
  // was recorded.
  return isDefaultQuickSessionName(session.title)
}

/**
 * The name a session takes when the member exits the naming prompt instead of
 * typing one: the local day the work was actually done, e.g. "9/9/26 workout".
 *
 * `dayKey` is a local YYYY-MM-DD key (`dateKey` / `localDateStr`) and is split
 * as a string rather than handed to `new Date()`. "2026-09-09" parses as UTC
 * midnight, which is the day BEFORE everywhere west of Greenwich — the exact
 * off-by-one that would misdate the one thing this name exists to record.
 *
 * Anything that is not such a key (absent, malformed) falls back to today
 * rather than throwing: a workout named for the wrong day is recoverable, a
 * finish button that explodes is not.
 */
export function fallbackQuickSessionName(dayKey?: string | null, now: Date = new Date()): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dayKey ?? '').trim())
  const [year, month, day] = parsed
    ? [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])]
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  return `${month}/${day}/${String(year).slice(-2)} workout`
}
