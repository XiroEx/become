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
